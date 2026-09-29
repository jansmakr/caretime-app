import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { ContactStatusRow, DailyHoursRow, LiveStatusRow, WaitingStatusRow } from "./rows";

/**
 * 병원 1곳의 상태 변경 구독. 채널 두 개를 쓴다.
 *
 * ① postgres_changes — 병원 직접입력 4개 테이블. 행을 그대로 싣는다.
 *    Realtime 이 구독자 역할의 RLS 를 따르므로 anon·병원 계정 모두 받는다.
 *
 * ② broadcast — 항목별 상태(service_statuses). 토픽은 `hospital:<id>` 다.
 *    원본 테이블에는 anon 읽기 정책이 없어서 ① 경로로는 보호자에게 오지 않는다.
 *    대신 DB 트리거가 고른 값만 이 토픽으로 보낸다(migration 20260926).
 *    청취 권한은 realtime.messages 의 RLS 가 판정한다 — 승인된 참여 병원의 토픽만.
 *
 * 채널이 둘인 이유: 토픽 이름이 정책과 정확히 맞아야 한다. 한 채널은 토픽이 하나다.
 */

export type HospitalChange =
  /**
   * 대표 상태가 바뀌었다. row 는 **파생물**이다 — 항목별 상태를 접어 옛 모양으로 맞춘
   * 값이고 어디에도 저장되지 않는다(features/partner/supabaseBackend.readRepresentative).
   * 이 변종은 파트너 저장 응답으로만 만들어진다. 구독으로는 오지 않는다.
   */
  | { table: "service_statuses"; row: LiveStatusRow }
  | { table: "hospital_daily_hours"; row: DailyHoursRow }
  | { table: "hospital_contact_status"; row: ContactStatusRow }
  | { table: "hospital_waiting_status"; row: WaitingStatusRow };

export type RealtimeConnection = "connecting" | "live" | "offline";

/**
 * 행을 실어 보내는 테이블. 변경 내용을 그대로 화면에 반영할 수 있는 것들이다.
 *
 * hospital_live_status 는 빠졌다. 병원 쓰기가 service_statuses 로 옮겨져서 이제
 * 아무도 그 표에 쓰지 않는다 — 구독해도 이벤트가 오지 않는다. 표와 읽기 정책은
 * DB 에 그대로 남아 있다(비파괴). 대표 상태 변경은 아래 신호 경로로 온다.
 */
const ROW_TABLES = [
  "hospital_daily_hours",
  "hospital_contact_status",
  "hospital_waiting_status",
] as const;

/**
 * 항목별 상태 broadcast. 페이로드를 쓰지 않고 "다시 읽어라"로만 쓴다.
 *
 * 왜 페이로드를 안 쓰는가: 한 항목의 값만 받아서는 대표 상태를 다시 접을 수 없다.
 * 접기에는 항목 전체가 필요하다(모르는 항목이 하나라도 있으면 UNKNOWN). 게다가
 * 보호자 경로가 읽는 것은 원본이 아니라 컬럼이 다른 공개 뷰다. 그래서 신호로만 쓴다.
 */
export const SERVICE_STATUS_EVENT = "service_status";

/** 트리거가 보내는 토픽과 정책이 검사하는 토픽이 같은 문자열이어야 한다. */
export function serviceStatusTopic(hospitalId: string): string {
  return `hospital:${hospitalId}`;
}

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
   * 넘기지 않으면 아무 구독도 열지 않는다 — 쓰지 않을 구독을 만들지 않는다.
   */
  onServiceStatusesChanged?: () => void,
  /**
   * 그 신호를 어느 경로로 받는가. 역할에 따라 다르다.
   *
   *   "broadcast"         보호자. 원본을 읽을 권한이 없으므로 트리거가 보내는
   *                       토픽을 듣는다. 승인된 참여 병원만 들을 수 있다.
   *   "postgres_changes"  병원 계정. 원본 select 정책이 있으므로 표를 직접 구독한다.
   *                       승인 여부와 무관하게 동작해야 한다 — 승인 전에도 병원은
   *                       자기 화면을 써야 하고, 여러 기기에서 같이 봐야 한다.
   */
  signal: "broadcast" | "postgres_changes" = "broadcast",
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

  /*
   * 항목별 상태용 broadcast 채널. private 이라 realtime.messages 의 RLS 를 통과해야 한다.
   *
   * 구독이 거절되는 것은 정상 상황이다 — 승인되지 않은 병원(verification_state !=
   * 'APPROVED')의 토픽은 정책이 막는다. 그래서 여기서 실패해도 onStatus 로 "offline" 을
   * 보내지 않는다. 화면의 연결 표시는 ① 채널만 따른다. ② 가 막힌 병원에서 "연결 끊김"을
   * 그리면 사실과 다르다 — 나머지 정보는 정상적으로 오고 있다.
   */
  let signalChannel: RealtimeChannel | null = null;
  if (onServiceStatusesChanged && signal === "broadcast") {
    signalChannel = client
      .channel(serviceStatusTopic(hospitalId), { config: { private: true } })
      .on("broadcast", { event: SERVICE_STATUS_EVENT }, () => onServiceStatusesChanged());
    signalChannel.subscribe();
  } else if (onServiceStatusesChanged) {
    signalChannel = client
      .channel(`service-statuses:${hospitalId}:${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "service_statuses",
          filter: `hospital_id=eq.${hospitalId}`,
        },
        () => onServiceStatusesChanged(),
      );
    signalChannel.subscribe();
  }

  return () => {
    void client.removeChannel(channel);
    if (signalChannel) void client.removeChannel(signalChannel);
  };
}
