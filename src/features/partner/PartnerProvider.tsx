"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { subscribeHospitalChanges, type RealtimeConnection } from "@/features/hospitals/realtime";
import type {
  ContactStatusCode,
  HospitalView,
  IncomingAggregate,
  LimitReasonCode,
} from "@/features/hospitals/types";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createIncomingDemoVisits, createPartnerDemoState, getPartnerHospital } from "./mock";
import {
  aggregateIncoming,
  confirmSameAsYesterday,
  deriveTodayMode,
  saveTodayHours,
  setContactStatus,
  setLimitReason,
  setTodayMode,
  setWaitingHeadcount,
} from "./service";
import {
  PartnerSetupError,
  SLICE_OF_TABLE,
  applyHospitalChange,
  fetchMembership,
  loadPartnerState,
  saveSlice,
  type PartnerSlice,
} from "./supabaseBackend";
import type { HoursSaveError, IncomingVisit, PartnerState } from "./types";

/**
 * 파트너 화면 상태 저장소.
 *
 * - Supabase 설정이 없으면 데모 모드: 브라우저 메모리에서만 동작한다. (1단계와 같음)
 * - 설정이 있으면: 로그인 → 소속 병원 확인 → 불러오기 → 입력마다 저장 → Realtime 으로 다른 기기와 동기화.
 *
 * 입력은 누르는 즉시 화면에 반영(낙관적 갱신)하고 저장한다. 저장이 끝나면 DB 가 확정한 행
 * (서버 확인시각)으로 다시 맞춘다. 실패하면 알리고 서버 값으로 되돌린다.
 * 상태는 마운트 이후에만 만든다. 시각이 들어간 값을 서버에서 렌더하지 않는다.
 */

const TICK_MS = 30_000;
/** 대기 스테퍼 연타를 한 번의 저장으로 묶는 시간. */
const WAITING_DEBOUNCE_MS = 600;

export type PartnerPhase = "loading" | "signed_out" | "no_membership" | "ready" | "error";

interface PartnerContextValue {
  source: "demo" | "supabase";
  phase: PartnerPhase;
  /** 저장 실패·설정 오류 등 사용자에게 보여줄 문구. */
  notice: string | null;
  dismissNotice: () => void;
  connection: RealtimeConnection | "off";
  hospital: HospitalView | null;
  state: PartnerState | null;
  visits: IncomingVisit[];
  incoming: IncomingAggregate | null;
  now: Date;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  confirmSameAsYesterday: () => void;
  setTodayMode: (mode: "limited" | "difficult") => void;
  setLimitReason: (code: LimitReasonCode | null) => void;
  saveTodayHours: (input: { closeClock: string; admissionClock: string | null }) => HoursSaveError | null;
  setContactStatus: (status: ContactStatusCode) => void;
  /** 대기 인원 증감. 연타해도 누락되지 않게 이전 값 기준으로 더한다. */
  stepWaitingHeadcount: (delta: number) => void;
}

const PartnerContext = createContext<PartnerContextValue | null>(null);

const SLICES: PartnerSlice[] = ["live", "hours", "contact", "waiting"];
const zeroBySlice = () => ({ live: 0, hours: 0, contact: 0, waiting: 0 });

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function PartnerProvider({ children }: { children: React.ReactNode }) {
  const source = isSupabaseConfigured ? "supabase" : "demo";
  const [phase, setPhase] = useState<PartnerPhase>("loading");
  const [notice, setNotice] = useState<string | null>(null);
  const [connection, setConnection] = useState<RealtimeConnection | "off">("off");
  const [hospital, setHospital] = useState<HospitalView | null>(null);
  const [state, setState] = useState<PartnerState | null>(null);
  const [visits, setVisits] = useState<IncomingVisit[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [hospitalId, setHospitalId] = useState<string | null>(null);

  // 연타·동시 저장에서 항상 최신 값을 기준으로 계산하기 위한 거울. 렌더를 기다리지 않는다.
  const stateRef = useRef<PartnerState | null>(null);
  const hospitalIdRef = useRef<string | null>(null);
  const userIdRef = useRef<string | null | undefined>(undefined);
  /** 저장 중인 조각. 이 동안 들어오는 Realtime 이벤트는 내 이전 저장의 메아리일 수 있어 무시한다. */
  const inflight = useRef(zeroBySlice());
  /** 조각별로 마지막으로 반영한 서버 확인시각. 늦게 도착한 옛 이벤트가 새 값을 덮지 않게 한다. */
  const lastServerAt = useRef(zeroBySlice());
  const waitingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const replaceState = useCallback((next: PartnerState | null) => {
    stateRef.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  // ── 데모 모드 ──
  useEffect(() => {
    if (source !== "demo") return;
    const t = new Date();
    setNow(t);
    setHospital(getPartnerHospital());
    replaceState(createPartnerDemoState(t));
    setVisits(createIncomingDemoVisits(t));
    setPhase("ready");
  }, [source, replaceState]);

  // ── Supabase: 세션 → 소속 병원 ──
  useEffect(() => {
    if (source !== "supabase") return;
    const client = getBrowserSupabase();
    let cancelled = false;

    const resolveUser = async (userId: string | null) => {
      if (userIdRef.current === userId) return; // 토큰 갱신 등으로 같은 사용자 이벤트가 반복될 때
      userIdRef.current = userId;
      hospitalIdRef.current = null;
      setHospitalId(null);
      replaceState(null);
      setHospital(null);
      if (!userId) {
        setPhase("signed_out");
        return;
      }
      setPhase("loading");
      try {
        const membership = await fetchMembership(client);
        if (cancelled) return;
        if (!membership) {
          setPhase("no_membership");
          return;
        }
        hospitalIdRef.current = membership.hospitalId;
        setHospitalId(membership.hospitalId);
      } catch (e) {
        if (cancelled) return;
        setNotice(errorText(e));
        setPhase("error");
      }
    };

    client.auth.getSession().then(({ data }) => void resolveUser(data.session?.user.id ?? null));
    const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
      // 콜백 안에서 바로 Supabase 호출을 기다리면 인증 잠금과 엇갈릴 수 있어 다음 틱으로 넘긴다.
      setTimeout(() => void resolveUser(session?.user.id ?? null), 0);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [source, replaceState]);

  const reload = useCallback(
    /**
     * mode "merge": 재조회가 Realtime 이벤트보다 늦게 도착해도 이미 반영한 더 최신 서버 값은 되돌리지 않는다.
     * mode "replace": 저장 실패 후 되돌리기. 화면의 낙관적 값(클라이언트 시각)이 더 최신이어도 서버 값으로 덮는다.
     */
    async (id: string, mode: "merge" | "replace" = "merge") => {
      const t = new Date();
      const loaded = await loadPartnerState(getBrowserSupabase(), id, t);
      if (hospitalIdRef.current !== id) return;
      const cur = mode === "merge" ? stateRef.current : null;
      const keepNewer = <T extends { verifiedAt: string }>(a: T, b: T) =>
        Date.parse(a.verifiedAt) > Date.parse(b.verifiedAt) ? a : b;
      const s: PartnerState =
        cur && cur.hospitalId === id
          ? {
              ...loaded.state,
              liveStatus: keepNewer(cur.liveStatus, loaded.state.liveStatus),
              hours: keepNewer(cur.hours, loaded.state.hours),
              contact: keepNewer(cur.contact, loaded.state.contact),
              waiting: keepNewer(cur.waiting, loaded.state.waiting),
            }
          : loaded.state;
      s.mode = deriveTodayMode(s.liveStatus, t);
      lastServerAt.current = {
        live: Date.parse(s.liveStatus.verifiedAt),
        hours: Date.parse(s.hours.verifiedAt),
        contact: Date.parse(s.contact.verifiedAt),
        waiting: Date.parse(s.waiting.verifiedAt),
      };
      setNow(t);
      setHospital(loaded.hospital);
      replaceState(s);
    },
    [replaceState],
  );

  const busy = () => SLICES.some((s) => inflight.current[s] > 0) || waitingTimer.current !== null;

  // ── Supabase: 불러오기 + Realtime ──
  useEffect(() => {
    if (source !== "supabase" || !hospitalId) return;
    const client = getBrowserSupabase();
    let cancelled = false;
    // 내원예정은 5단계에서 테이블이 생긴다. 그 전까지 목록·카운터는 데모 값이다.
    setVisits(createIncomingDemoVisits(new Date()));

    const load = () =>
      reload(hospitalId)
        .then(() => !cancelled && setPhase("ready"))
        .catch((e) => {
          if (cancelled) return;
          setNotice(e instanceof PartnerSetupError ? e.message : `불러오기 실패: ${errorText(e)}`);
          setPhase("error");
        });

    void load();

    const unsubscribe = subscribeHospitalChanges(
      client,
      hospitalId,
      (change) => {
        const slice = SLICE_OF_TABLE[change.table];
        if (inflight.current[slice] > 0 || (slice === "waiting" && waitingTimer.current)) return;
        const at = Date.parse(change.row.verified_at);
        if (at < lastServerAt.current[slice]) return;
        lastServerAt.current[slice] = at;
        const prev = stateRef.current;
        if (!prev) return;
        const t = new Date();
        setNow(t);
        replaceState(applyHospitalChange(prev, change, t));
      },
      (status) => {
        if (cancelled) return;
        setConnection(status);
        // 재연결: 끊겨 있던 사이의 변경을 다시 읽는다. 입력 저장 중이면 덮어쓰지 않고 다음 기회로 미룬다.
        if (status === "live" && stateRef.current && !busy()) void load();
      },
    );

    return () => {
      cancelled = true;
      unsubscribe();
      setConnection("off");
    };
  }, [source, hospitalId, reload, replaceState]);

  const persist = useCallback(
    async (slices: PartnerSlice[]) => {
      const client = getBrowserSupabase();
      await Promise.all(
        slices.map(async (slice) => {
          const current = stateRef.current;
          if (!current) return;
          inflight.current[slice] += 1;
          try {
            const change = await saveSlice(client, slice, current, new Date());
            inflight.current[slice] -= 1;
            const at = Date.parse(change.row.verified_at);
            if (at >= lastServerAt.current[slice]) lastServerAt.current[slice] = at;
            // 마지막 저장의 응답일 때만 서버 확정값으로 맞춘다. 중간 응답이 최신 입력을 되돌리지 않게.
            const settled = inflight.current[slice] === 0 && !(slice === "waiting" && waitingTimer.current);
            const latest = stateRef.current;
            if (settled && latest) replaceState(applyHospitalChange(latest, change, new Date()));
          } catch (e) {
            inflight.current[slice] -= 1;
            setNotice(`저장하지 못했습니다. 최신 상태로 다시 불러왔습니다. (${errorText(e)})`);
            const id = hospitalIdRef.current;
            if (id) void reload(id, "replace").catch(() => undefined);
          }
        }),
      );
    },
    [reload, replaceState],
  );

  // 파트너 화면을 떠나기 직전 묶여 있던 대기 인원 저장을 흘려보내지 않는다.
  useEffect(
    () => () => {
      if (waitingTimer.current) {
        clearTimeout(waitingTimer.current);
        waitingTimer.current = null;
        void persist(["waiting"]);
      }
    },
    [persist],
  );

  const apply = useCallback(
    (update: (s: PartnerState, t: Date) => PartnerState, slices: PartnerSlice[]) => {
      const prev = stateRef.current;
      if (!prev) return;
      const t = new Date();
      setNow(t);
      replaceState(update(prev, t));
      if (source !== "supabase") return;

      const immediate = slices.filter((s) => s !== "waiting");
      if (immediate.length > 0) void persist(immediate);
      if (slices.includes("waiting")) {
        if (waitingTimer.current) clearTimeout(waitingTimer.current);
        waitingTimer.current = setTimeout(() => {
          waitingTimer.current = null;
          void persist(["waiting"]);
        }, WAITING_DEBOUNCE_MS);
      }
    },
    [source, persist, replaceState],
  );

  const saveHours = useCallback(
    (input: { closeClock: string; admissionClock: string | null }) => {
      const prev = stateRef.current;
      if (!prev) return null;
      const result = saveTodayHours(prev, input, new Date());
      if (result.error) return result.error;
      // 종료시각이 바뀌면 오늘 상태의 유효시간도 같이 바뀐다.
      apply(() => result.state, ["hours", "live"]);
      return null;
    },
    [apply],
  );

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await getBrowserSupabase().auth.signInWithPassword({ email, password });
    if (!error) {
      setNotice(null);
      return null;
    }
    return error.status === 400 ? "이메일 또는 비밀번호를 확인해 주세요." : `로그인하지 못했습니다. (${error.message})`;
  }, []);

  const signOut = useCallback(async () => {
    await getBrowserSupabase().auth.signOut();
  }, []);

  const incoming = useMemo(
    () => (state ? aggregateIncoming(state.hospitalId, visits, now) : null),
    [state, visits, now],
  );

  const value = useMemo<PartnerContextValue>(
    () => ({
      source,
      phase,
      notice,
      dismissNotice: () => setNotice(null),
      connection,
      hospital,
      state,
      visits,
      incoming,
      now,
      signIn,
      signOut,
      confirmSameAsYesterday: () => apply(confirmSameAsYesterday, ["live", "hours"]),
      setTodayMode: (mode) => apply((s, t) => setTodayMode(s, mode, t), ["live"]),
      setLimitReason: (code) => apply((s, t) => setLimitReason(s, code, t), ["live"]),
      saveTodayHours: saveHours,
      setContactStatus: (status) => apply((s, t) => setContactStatus(s, status, t), ["contact"]),
      stepWaitingHeadcount: (delta) =>
        apply((s, t) => setWaitingHeadcount(s, (s.waiting.headcount ?? 0) + delta, t), ["waiting"]),
    }),
    [source, phase, notice, connection, hospital, state, visits, incoming, now, signIn, signOut, apply, saveHours],
  );

  return <PartnerContext.Provider value={value}>{children}</PartnerContext.Provider>;
}

export function usePartner(): PartnerContextValue {
  const ctx = useContext(PartnerContext);
  if (!ctx) throw new Error("usePartner must be used inside PartnerProvider");
  return ctx;
}
