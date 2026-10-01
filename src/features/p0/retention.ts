/**
 * 보관·삭제 정책 (PRD §7.4).
 *
 * PRD 가 "위 수치는 법정 기간이 아닌 운영 제안"이라고 못박았다. 그래서 여기 값은
 * 개인정보처리방침·위탁 계약과 함께 확정될 **제안값**이며, 코드 한 곳에 모아 두어
 * 방침 문서와 실제 삭제 작업이 어긋나지 않게 한다.
 *
 * 삭제는 읽기 시점 필터(공개 여부)와 실제 삭제(purge)를 **따로** 둔다.
 * 공개를 끊는 것과 지우는 것은 다른 일이고, 신고 조치 중인 건은 지우면 증거가 사라진다.
 */

/**
 * ⏳ 아직 어디서도 import 되지 않는다. 보관·삭제 작업(purge)을 붙이는 턴에 그 작업과
 *    개인정보처리방침 문서가 이 값을 함께 읽는다. 값은 아직 제안값이다.
 */

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

export interface RetentionRule {
  /** 무엇에 대한 규칙인지. 방침 문서의 표와 같은 이름을 쓴다. */
  subject: string;
  /** 공개 노출이 끊기는 시점까지의 ms. null = 공개 개념이 없음. */
  publicForMs: number | null;
  /** 서버에서 실제로 지우기까지의 ms. */
  purgeAfterMs: number;
  /** 지울 때 무엇을 지우는지 / 예외. */
  note: string;
}

/**
 * 보관 기간. **진짜 값은 DB 의 retention_policy 표에 있다.**
 *
 * 여기 있는 것은 그 표의 사본이고, 화면·문서에서 읽기 위한 것이다.
 * 실제 삭제는 public.purge_expired() 가 그 표를 읽어서 한다
 * (migration 20261004_retention_purge).
 *
 * 두 값이 갈라지면 방침에 쓴 숫자와 실제로 지우는 시점이 달라진다 — 그 자체가 위반이다.
 * 그래서 테스트가 이 상수와 DB 표를 비교한다(tests/retention.realtime.test.ts).
 * 기간을 바꾸려면 migration 과 이 파일을 함께 고쳐야 한다. 한쪽만 고치면 테스트가 깨진다.
 */
export const RETENTION_DAYS = {
  /** 작성 시각 기준. 공개는 24시간, 그 뒤 신고·이의 처리를 위해 더 둔다. */
  field_reports: 30,
  /** 마지막 접속 기준. 지워지면 글의 guest_id 만 끊기고 글은 남는다. */
  guest_sessions: 30,
  /** 만료 시각 기준. (PRD 표. 현재 미사용) */
  observations: 7,
  /** 접수 시각 기준. 다음 지역 판단 근거. */
  hospital_requests: 365,
  /** 접수 시각 기준. 조치 기록도 같은 기간. */
  reports: 365,
  /**
   * 접수 시각 기준. **삭제 기한이 아니라 자동 종결 기한이다.**
   *
   * 90일 동안 사람이 확인하지 않은 신고는 DISMISSED 로 바뀌고
   * moderation_actions 에 `auto_dismiss_unreviewed` 로 남는다
   * (migration 20261005, `close_stale_reports()`).
   *
   * 왜 필요한가: 지우는 조건에 "처리가 끝난 것만"이 걸려 있어서, 아무도 보지 않은
   * 신고는 1년이 지나도 남고 그 신고가 걸린 글까지 함께 남는다. 분쟁 중 증거를
   * 지키려고 만든 규칙이 반대로 작동한다.
   */
  reports_unreviewed: 90,
} as const;

export type RetentionSubject = keyof typeof RETENTION_DAYS;


/** 백업에 남아도 되는 최대 기간. 복원 시 삭제 원장을 재적용한다. (PRD §7.4 말미) */
export const BACKUP_MAX_RESIDUAL_MS = 30 * DAY;

/**
 * 언제 지워지는가. 화면·문서에서 "N일 후 삭제"를 적을 때 쓴다.
 *
 * 실제 삭제는 이 함수가 하지 않는다 — DB 의 purge_expired() 가 한다.
 * 이것은 그 시점을 사람에게 보여주기 위한 계산이다.
 */
export function purgeAt(subject: RetentionSubject, basisAt: Date): Date {
  return new Date(basisAt.getTime() + RETENTION_DAYS[subject] * DAY);
}

/**
 * 공개해도 되는지. 서버 조회와 화면이 같은 함수를 쓴다(PRD §3.5 "서버 조회에서도 동일 정책").
 * 클라이언트 타이머만 믿지 않으므로 now 를 인자로 받는다.
 */
export function isPubliclyVisible(input: {
  publicUntil: string | null;
  visibility: "VISIBLE" | "FLAGGED" | "QUARANTINED" | "RESTORED" | "REMOVED";
  now: Date;
}): boolean {
  if (input.visibility === "QUARANTINED" || input.visibility === "REMOVED") return false;
  if (input.publicUntil === null) return true;
  const until = Date.parse(input.publicUntil);
  if (Number.isNaN(until)) return false;
  return input.now.getTime() < until;
}

/**
 * 관찰 제보의 '현재 참고' 유효시간 30분 (PRD §3.5).
 * 지나면 "지난 제보"로 낮춰 표시하고 현재 요약 집계에서 뺀다. 지우는 것이 아니다.
 */
export const POST_CURRENT_REFERENCE_MS = 30 * 60_000;

export function isStalePost(input: { observedAt: string | null; now: Date }): boolean {
  if (input.observedAt === null) return false; // 질문은 시효 대상이 아니다.
  const observed = Date.parse(input.observedAt);
  if (Number.isNaN(observed)) return true;
  return input.now.getTime() - observed >= POST_CURRENT_REFERENCE_MS;
}
