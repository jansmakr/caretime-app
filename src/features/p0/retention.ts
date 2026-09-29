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

export const RETENTION: Record<string, RetentionRule> = {
  posts: {
    subject: "일반 현장 글",
    publicForMs: 24 * HOUR,
    purgeAfterMs: 7 * DAY,
    note: "공개 24시간 후 비공개, 7일 후 본문·세션 연결 삭제",
  },
  observations: {
    subject: "리액션",
    publicForMs: 15 * 60_000,
    purgeAfterMs: 24 * HOUR,
    note: "집계 15분, 원본 24시간. 이후 비식별 일 단위 집계만 남긴다",
  },
  guestSessions: {
    subject: "비회원 세션",
    publicForMs: null,
    purgeAfterMs: 7 * DAY,
    note: "절대 7일. 만료 후 24시간 내 토큰 해시·별칭 제거",
  },
  abuseKeys: {
    subject: "악용 방지 HMAC 키",
    publicForMs: null,
    purgeAfterMs: 24 * HOUR,
    note: "키 회전과 원본 폐기. 영구 지문을 만들지 않는다",
  },
  reports: {
    subject: "신고·조치 증거",
    publicForMs: null,
    purgeAfterMs: 30 * DAY,
    note: "사건 종료 후 30일. 법적 보존이 필요하면 근거·범위·기한을 기록하고 예외 처리",
  },
  partnerEvidence: {
    subject: "기관 인증 첨부",
    publicForMs: null,
    purgeAfterMs: 30 * DAY,
    note: "승인/반려 후 30일. 문서는 삭제하고 확인 결과만 유지",
  },
  auditLogs: {
    subject: "상태·권한 감사 로그",
    publicForMs: null,
    purgeAfterMs: 90 * DAY,
    note: "접근 제한. 환자 본문을 담지 않는다",
  },
};

/** 백업에 남아도 되는 최대 기간. 복원 시 삭제 원장을 재적용한다. (PRD §7.4 말미) */
export const BACKUP_MAX_RESIDUAL_MS = 30 * DAY;

export function publicUntil(subject: keyof typeof RETENTION, createdAt: Date): Date | null {
  const rule = RETENTION[subject];
  if (rule.publicForMs === null) return null;
  return new Date(createdAt.getTime() + rule.publicForMs);
}

export function purgeAt(subject: keyof typeof RETENTION, createdAt: Date): Date {
  return new Date(createdAt.getTime() + RETENTION[subject].purgeAfterMs);
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
