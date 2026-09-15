import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContactStatusRow, DailyHoursRow, LiveStatusRow, WaitingStatusRow } from "./rows";

/**
 * 병원 1곳의 병원 직접입력 테이블 변경 구독.
 * Realtime 은 RLS 를 따르므로 anon 도 공개 읽기 정책이 있는 이 4개 테이블만 받는다.
 */

export type HospitalChange =
  | { table: "hospital_live_status"; row: LiveStatusRow }
  | { table: "hospital_daily_hours"; row: DailyHoursRow }
  | { table: "hospital_contact_status"; row: ContactStatusRow }
  | { table: "hospital_waiting_status"; row: WaitingStatusRow };

export type RealtimeConnection = "connecting" | "live" | "offline";

const TABLES = [
  "hospital_live_status",
  "hospital_daily_hours",
  "hospital_contact_status",
  "hospital_waiting_status",
] as const;

/**
 * onStatus("live") 는 최초 연결과 재연결 때마다 불린다.
 * 끊겨 있던 사이의 변경은 이벤트로 오지 않으므로, 호출하는 쪽은 그때 전체를 다시 읽어야 한다.
 */
export function subscribeHospitalChanges(
  client: SupabaseClient,
  hospitalId: string,
  onChange: (change: HospitalChange) => void,
  onStatus: (status: RealtimeConnection) => void,
): () => void {
  let channel = client.channel(`hospital-live:${hospitalId}:${Math.random().toString(36).slice(2, 8)}`);

  for (const table of TABLES) {
    channel = channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table, filter: `hospital_id=eq.${hospitalId}` },
      (payload) => {
        // 삭제 권한은 누구에게도 없다. INSERT/UPDATE 의 새 행만 쓴다.
        if (payload.eventType === "DELETE") return;
        onChange({ table, row: payload.new } as HospitalChange);
      },
    );
  }

  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") onStatus("live");
    else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") onStatus("offline");
  });

  return () => {
    void client.removeChannel(channel);
  };
}
