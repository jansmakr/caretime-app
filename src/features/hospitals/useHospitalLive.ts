"use client";

import { useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { subscribeHospitalChanges, type RealtimeConnection } from "./realtime";
import { fetchHospitalView } from "./repository";
import { withContactRow, withDailyHoursRow, withLiveStatusRow, withWaitingRow } from "./rows";
import type { HospitalView } from "./types";

/** 만료·"N분 전" 재판정 주기. Realtime 이벤트가 없어도 오래된 상태는 시간이 지나면 바뀌어야 한다. */
const TICK_MS = 30_000;

/**
 * 보호자 병원 상세의 실시간 상태.
 *
 * 서버 렌더 값(initial)으로 시작하고, 첫 렌더의 now 는 서버 시각(renderedAt)을 써서
 * hydration 이 어긋나지 않게 한다. 마운트 후 실제 시각으로 바꾸고 구독을 연다.
 * 연결(재연결 포함)될 때마다 전체를 한 번 다시 읽어, 끊겨 있던 사이의 변경을 놓치지 않는다.
 */
export function useHospitalLive(initial: HospitalView, renderedAt: string, enabled: boolean) {
  const [hospital, setHospital] = useState(initial);
  const [now, setNow] = useState(() => new Date(renderedAt));
  const [connection, setConnection] = useState<RealtimeConnection | "off">(enabled ? "connecting" : "off");

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const client = getBrowserSupabase();
    let cancelled = false;

    const unsubscribe = subscribeHospitalChanges(
      client,
      initial.id,
      (change) => {
        const t = new Date();
        setNow(t);
        setHospital((h) => {
          switch (change.table) {
            case "hospital_live_status":
              return withLiveStatusRow(h, change.row);
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
        fetchHospitalView(client, initial.id)
          .then((fresh) => {
            if (!cancelled && fresh) setHospital(fresh);
          })
          .catch(() => {
            // 다시 읽기에 실패해도 받은 이벤트로 계속 갱신한다. 다음 재연결 때 다시 시도한다.
          });
      },
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [enabled, initial.id]);

  return { hospital, now, connection };
}
