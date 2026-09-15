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
 * onStatus("live") 는 최초 연결·DB 구독 확정·재연결 때마다 불린다(한 번 연결에 두 번 올 수 있다).
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

  // SUBSCRIBED 는 채널 참여 완료일 뿐, DB 변경 구독은 조금 뒤 system 메시지로 확정된다.
  // 그 사이에 난 변경은 이벤트로 오지 않으므로, 확정 시점에도 한 번 더 "live" 를 알려 다시 읽게 한다.
  // (인증 토큰이 바뀌어 서버가 재구독할 때도 같은 메시지가 온다)
  channel.on("system", {}, (payload: { extension?: string; status?: string }) => {
    if (payload.extension !== "postgres_changes") return;
    if (payload.status === "ok") onStatus("live");
    else if (payload.status === "error") onStatus("offline");
  });

  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") onStatus("live");
    else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") onStatus("offline");
  });

  return () => {
    void client.removeChannel(channel);
  };
}
