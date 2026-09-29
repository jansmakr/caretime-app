import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContactStatusRow, DailyHoursRow, LiveStatusRow, WaitingStatusRow } from "./rows";

/**
 * 병원 1곳의 병원 직접입력 테이블 변경 구독.
 *
 * Realtime 은 구독자 역할의 RLS 를 따른다. 그래서 테이블마다 도달 범위가 다르다.
 *   hospital_* 4개   → anon·병원 계정 모두 받는다 (공개 읽기 정책이 있다)
 *   service_statuses → **병원 계정만** 받는다. anon 정책을 만들지 않았기 때문이다.
 *                      보호자 화면은 이벤트 대신 다시 읽기로 최신성을 얻는다.
 *
 * 구독 자체는 한 곳에서 선언한다. 역할에 따라 오는 것만 달라진다.
 */

export type HospitalChange =
  | { table: "hospital_live_status"; row: LiveStatusRow }
  | { table: "hospital_daily_hours"; row: DailyHoursRow }
  | { table: "hospital_contact_status"; row: ContactStatusRow }
  | { table: "hospital_waiting_status"; row: WaitingStatusRow };

export type RealtimeConnection = "connecting" | "live" | "offline";

/** 행을 실어 보내는 테이블. 변경 내용을 그대로 화면에 반영할 수 있는 것들이다. */
const ROW_TABLES = [
  "hospital_live_status",
  "hospital_daily_hours",
  "hospital_contact_status",
  "hospital_waiting_status",
] as const;

/**
 * 항목별 상태 테이블. 행을 싣지 않고 "다시 읽어라"만 알린다.
 *
 * 왜 행을 안 싣는가: 한 항목의 행만 받아서는 대표 상태를 다시 접을 수 없다.
 * 접기에는 항목 전체가 필요하다(모르는 항목이 하나라도 있으면 UNKNOWN). 게다가
 * 보호자 경로가 읽는 것은 원본이 아니라 컬럼이 다른 공개 뷰다. 그래서 신호만 준다.
 */
const SIGNAL_TABLE = "service_statuses";

/**
 * onStatus("live") 는 최초 연결·DB 구독 확정·재연결 때마다 불린다(한 번 연결에 두 번 올 수 있다).
 * 끊겨 있던 사이의 변경은 이벤트로 오지 않으므로, 호출하는 쪽은 그때 전체를 다시 읽어야 한다.
 */
export function subscribeHospitalChanges(
  client: SupabaseClient,
  hospitalId: string,
  onChange: (change: HospitalChange) => void,
  onStatus: (status: RealtimeConnection) => void,
  /**
   * 항목별 상태가 바뀌었다는 신호. 받는 쪽은 병원 전체를 다시 읽는다.
   * 넘기지 않으면 그 테이블을 구독하지도 않는다 — 쓰지 않을 구독을 열지 않는다.
   * anon 은 RLS 때문에 이 신호를 받지 못한다(위 주석 참고).
   */
  onServiceStatusesChanged?: () => void,
): () => void {
  let channel = client.channel(`hospital-live:${hospitalId}:${Math.random().toString(36).slice(2, 8)}`);

  for (const table of ROW_TABLES) {
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

  if (onServiceStatusesChanged) {
    channel = channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: SIGNAL_TABLE, filter: `hospital_id=eq.${hospitalId}` },
      () => onServiceStatusesChanged(),
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
