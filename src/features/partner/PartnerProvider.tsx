"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type {
  ContactStatusCode,
  HospitalView,
  IncomingAggregate,
  LimitReasonCode,
} from "@/features/hospitals/types";
import {
  createIncomingDemoVisits,
  createPartnerDemoState,
  getPartnerHospital,
} from "./mock";
import {
  aggregateIncoming,
  confirmSameAsYesterday,
  saveTodayHours,
  setContactStatus,
  setLimitReason,
  setTodayMode,
  setWaitingHeadcount,
} from "./service";
import type { HoursSaveError, IncomingVisit, PartnerState } from "./types";

/**
 * 파트너 화면 상태 저장소.
 *
 * partner 레이아웃에 붙어 있어서 /partner 하위 탭을 오가도 입력값이 유지된다.
 * 상태는 마운트 이후에만 만든다. 시각이 들어간 값을 서버에서 렌더하면
 * 서버·브라우저 시간대가 다를 때 화면이 어긋나기 때문이다.
 */

/** 내원예정 카운터와 "N분 전" 표시를 갱신하는 주기. */
const TICK_MS = 30_000;

interface PartnerContextValue {
  hospital: HospitalView;
  /** 마운트 전에는 null. */
  state: PartnerState | null;
  visits: IncomingVisit[];
  incoming: IncomingAggregate | null;
  now: Date;
  confirmSameAsYesterday: () => void;
  setTodayMode: (mode: "limited" | "difficult") => void;
  setLimitReason: (code: LimitReasonCode | null) => void;
  saveTodayHours: (input: { closeClock: string; admissionClock: string | null }) => HoursSaveError | null;
  setContactStatus: (status: ContactStatusCode) => void;
  /** 대기 인원 증감. 연타해도 누락되지 않게 이전 값 기준으로 더한다. */
  stepWaitingHeadcount: (delta: number) => void;
}

const PartnerContext = createContext<PartnerContextValue | null>(null);

export function PartnerProvider({ children }: { children: React.ReactNode }) {
  const hospital = useMemo(() => getPartnerHospital(), []);
  const [state, setState] = useState<PartnerState | null>(null);
  const [visits, setVisits] = useState<IncomingVisit[]>([]);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = new Date();
    setNow(t);
    setState(createPartnerDemoState(t));
    setVisits(createIncomingDemoVisits(t));
    const id = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  /** 입력은 누른 순간의 시각으로 확인시각을 남기고, 화면의 "방금"도 즉시 맞춘다. */
  const apply = useCallback((update: (s: PartnerState, t: Date) => PartnerState) => {
    const t = new Date();
    setNow(t);
    setState((prev) => (prev ? update(prev, t) : prev));
  }, []);

  const saveHours = useCallback(
    (input: { closeClock: string; admissionClock: string | null }) => {
      if (!state) return null;
      const t = new Date();
      const result = saveTodayHours(state, input, t);
      if (result.error) return result.error;
      setNow(t);
      setState(result.state);
      return null;
    },
    [state],
  );

  const incoming = useMemo(
    () => (state ? aggregateIncoming(state.hospitalId, visits, now) : null),
    [state, visits, now],
  );

  const value = useMemo<PartnerContextValue>(
    () => ({
      hospital,
      state,
      visits,
      incoming,
      now,
      confirmSameAsYesterday: () => apply(confirmSameAsYesterday),
      setTodayMode: (mode) => apply((s, t) => setTodayMode(s, mode, t)),
      setLimitReason: (code) => apply((s, t) => setLimitReason(s, code, t)),
      saveTodayHours: saveHours,
      setContactStatus: (status) => apply((s, t) => setContactStatus(s, status, t)),
      stepWaitingHeadcount: (delta) =>
        apply((s, t) => setWaitingHeadcount(s, (s.waiting.headcount ?? 0) + delta, t)),
    }),
    [hospital, state, visits, incoming, now, apply, saveHours],
  );

  return <PartnerContext.Provider value={value}>{children}</PartnerContext.Provider>;
}

export function usePartner(): PartnerContextValue {
  const ctx = useContext(PartnerContext);
  if (!ctx) throw new Error("usePartner must be used inside PartnerProvider");
  return ctx;
}
