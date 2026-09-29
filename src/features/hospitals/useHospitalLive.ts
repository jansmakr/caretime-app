"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getPublicBrowserSupabase } from "@/lib/supabase/browser";
import { useRevisitRefetch } from "@/lib/useRevisitRefetch";
import { subscribeHospitalChanges, type RealtimeConnection } from "./realtime";
import { fetchHospitalView } from "./repository";
import { mergeFresher, withContactRow, withDailyHoursRow, withLiveStatusRow, withWaitingRow } from "./rows";
import type { HospitalView } from "./types";

/** 만료·"N분 전" 재판정 주기. Realtime 이벤트가 없어도 오래된 상태는 시간이 지나면 바뀌어야 한다. */
const TICK_MS = 30_000;

/**
 * 보호자 병원 상세의 실시간 상태.
 *
 * 서버 렌더 값(initial)으로 시작하고, 첫 렌더의 now 는 서버 시각(renderedAt)을 써서
 * hydration 이 어긋나지 않게 한다. 마운트 후 실제 시각으로 바꾸고 구독을 연다.
 * 연결(재연결 포함)될 때마다 전체를 한 번 다시 읽어, 끊겨 있던 사이의 변경을 놓치지 않는다.
 *
 * 그리고 화면으로 돌아올 때도 다시 읽는다(useRevisitRefetch). 항목별 상태는 anon 에게
 * Realtime 이벤트가 오지 않으므로, 열어 둔 화면은 그것 말고는 갱신 계기가 없다.
 * 다시 읽기는 mergeFresher 로 합친다 — 이전 값을 지우거나 로딩 상태로 되돌리지 않는다.
 * 실패하면 조용히 지나가고 다음 계기에 다시 시도한다(원칙 9: 깜빡이지 않는다).
 */
export function useHospitalLive(initial: HospitalView, renderedAt: string, enabled: boolean) {
  const [hospital, setHospital] = useState(initial);
  const [now, setNow] = useState(() => new Date(renderedAt));
  const [connection, setConnection] = useState<RealtimeConnection | "off">(enabled ? "connecting" : "off");
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  /**
   * 병원 전체를 다시 읽어 합친다.
   * 쓰는 곳: 연결·재연결, 항목별 상태 변경 신호, 화면 복귀.
   * 항목별 변경은 행 하나만으로 대표 상태를 다시 접을 수 없어서 전체를 읽는다.
   */
  const refetch = useCallback(() => {
    if (!enabled) return;
    fetchHospitalView(getPublicBrowserSupabase(), initial.id)
      .then((fresh) => {
        if (!alive.current || !fresh) return;
        setNow(new Date());
        setHospital((h) => mergeFresher(h, fresh));
      })
      .catch(() => {
        // 실패해도 받은 이벤트로 계속 갱신한다. 다음 계기에 다시 시도한다.
      });
  }, [enabled, initial.id]);

  useRevisitRefetch(refetch);

  useEffect(() => {
    if (!enabled) return;
    const client = getPublicBrowserSupabase();

    const unsubscribe = subscribeHospitalChanges(
      client,
      initial.id,
      (change) => {
        const t = new Date();
        setNow(t);
        setHospital((h) => {
          switch (change.table) {
            case "hospital_live_status":
              return withLiveStatusRow(h, change.row, t);
            case "hospital_daily_hours":
              return withDailyHoursRow(h, change.row, t);
            case "hospital_contact_status":
              return withContactRow(h, change.row);
            case "hospital_waiting_status":
              return withWaitingRow(h, change.row);
          }
        });
      },
      (status) => {
        setConnection(status);
        if (status !== "live") return;
        refetch();
      },
      // 항목별 상태가 바뀌면 전체를 다시 읽는다. 대표 상태는 항목 전체를 봐야 접힌다.
      // (지금 anon 은 RLS 때문에 이 신호를 받지 못한다 — 받게 되면 이 배선이 그대로 동작한다.)
      refetch,
    );

    return () => {
      unsubscribe();
    };
  }, [enabled, initial.id, refetch]);

  return { hospital, now, connection };
}
