/**
 * 비회원 악용 방지 제한값 (PRD §3.1) + API 오류 계약 (PRD §10).
 *
 * PRD 가 명시적으로 못박은 것: **localStorage 의 카운터는 보안 기준으로 사용하지 않는다.**
 * 그래서 클라이언트 값과 서버 값을 따로 둔다. 클라이언트 쪽은 연타를 막는 UX 장치이고,
 * 실제 제한은 서버 값이다. 이 파일은 두 값을 한 곳에 둬서 어긋나지 않게 한다.
 *
 * 제한값은 서버 설정으로 버전 관리한다(§3.1 말미). 그래서 상수를 export 하고,
 * 서버는 환경값으로 덮어쓸 수 있게 `resolveLimits()` 를 거친다.
 */

/**
 * ⏳ 아직 어디서도 import 되지 않는다. 게스트 세션과 글쓰기 API 를 서버로 옮기는 턴에
 *    서버가 이 값을 쓴다. 클라이언트 쪽 값은 그때 화면이 같은 상수를 읽게 한다.
 */

// ─── 클라이언트 쪽 (UX) ────────────────────────────────────

/** 글 전송 후 버튼 비활성 시간. "다시 작성까지 29초" 를 함께 보여준다. */
export const CLIENT_POST_COOLDOWN_MS = 30_000;
/** 리액션 연타 방지. */
export const CLIENT_REACTION_COOLDOWN_MS = 2_000;

export function cooldownText(remainingMs: number): string {
  return `다시 작성까지 ${Math.ceil(remainingMs / 1000)}초`;
}

// ─── 서버 쪽 (실제 제한) ───────────────────────────────────

export interface RateRule {
  /** 창의 길이(ms). */
  windowMs: number;
  /** 그 창에서 허용되는 건수. */
  max: number;
}

export interface GuestLimits {
  posts: RateRule[];
  reactions: RateRule[];
  reports: RateRule[];
  /** 같은 병원에서 같은 본문을 다시 올릴 수 없는 시간. */
  duplicateBodyWindowMs: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** PRD §3.1 서버 제한 표를 그대로 옮긴 값. */
export const DEFAULT_GUEST_LIMITS: GuestLimits = {
  posts: [
    { windowMs: 30_000, max: 1 },
    { windowMs: HOUR, max: 10 },
    { windowMs: DAY, max: 30 },
  ],
  reactions: [
    { windowMs: 10_000, max: 5 },
    { windowMs: HOUR, max: 60 },
  ],
  reports: [{ windowMs: HOUR, max: 5 }],
  duplicateBodyWindowMs: 10 * MINUTE,
};

export type LimitedAction = "posts" | "reactions" | "reports";

export interface RateCheckInput {
  action: LimitedAction;
  /** 이 주체가 최근에 성공시킨 요청들의 타임스탬프(ms). 최신순·오래된순 무관. */
  recentTimestamps: number[];
  now: number;
  limits?: GuestLimits;
}

export interface RateCheckResult {
  allowed: boolean;
  /** 막혔을 때 다시 시도 가능한 시각까지의 초. 429 응답 본문에 싣는다. (PRD §10) */
  retryAfterSeconds: number;
  /** 어느 규칙에 걸렸는지. 로그·운영 조정용. */
  violated: RateRule | null;
}

/**
 * 여러 창을 모두 본다. 30초 규칙을 통과해도 일일 30건에 걸릴 수 있다.
 * 가장 오래 기다려야 하는 창을 기준으로 retry_after 를 돌려준다 —
 * 짧은 쪽을 알려주면 눌렀다가 또 막힌다.
 */
export function checkRate(input: RateCheckInput): RateCheckResult {
  const limits = input.limits ?? DEFAULT_GUEST_LIMITS;
  const rules = limits[input.action];
  let worstWaitMs = 0;
  let violated: RateRule | null = null;

  for (const rule of rules) {
    const windowStart = input.now - rule.windowMs;
    const inWindow = input.recentTimestamps.filter((t) => t > windowStart).sort((a, b) => a - b);
    if (inWindow.length < rule.max) continue;
    // 창에서 가장 오래된 건이 빠져나가면 한 자리가 생긴다.
    const oldestToExpire = inWindow[inWindow.length - rule.max];
    const waitMs = Math.max(0, oldestToExpire + rule.windowMs - input.now);
    if (waitMs >= worstWaitMs) {
      worstWaitMs = waitMs;
      violated = rule;
    }
  }

  if (violated === null) return { allowed: true, retryAfterSeconds: 0, violated: null };
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(worstWaitMs / 1000)), violated };
}

/** 같은 병원·같은 본문 중복. (PRD §3.1 "중복 본문은 같은 병원에서 10분 이내 거절") */
export function isDuplicateBody(input: {
  previous: { hospitalId: string; text: string; createdAt: number }[];
  hospitalId: string;
  text: string;
  now: number;
  limits?: GuestLimits;
}): boolean {
  const windowMs = (input.limits ?? DEFAULT_GUEST_LIMITS).duplicateBodyWindowMs;
  const normalized = input.text.replace(/\s+/g, " ").trim();
  return input.previous.some(
    (p) =>
      p.hospitalId === input.hospitalId &&
      p.createdAt > input.now - windowMs &&
      p.text.replace(/\s+/g, " ").trim() === normalized,
  );
}

// ─── 세션 정책 (PRD §3.1) ─────────────────────────────────

export const GUEST_SESSION_TOKEN_BITS = 256;
export const GUEST_SESSION_IDLE_MS = 24 * HOUR;
export const GUEST_SESSION_ABSOLUTE_MS = 7 * DAY;

/** 쿠키 속성. HttpOnly·Secure·SameSite=Lax 를 코드 한 곳에서 정한다. */
export const GUEST_COOKIE = {
  name: "ct_guest",
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
} as const;

export function guestSessionExpiry(createdAt: Date, lastSeenAt: Date): Date {
  const idle = lastSeenAt.getTime() + GUEST_SESSION_IDLE_MS;
  const absolute = createdAt.getTime() + GUEST_SESSION_ABSOLUTE_MS;
  return new Date(Math.min(idle, absolute));
}

export function isSessionExpired(input: { createdAt: string; lastSeenAt: string; now: Date }): boolean {
  const created = Date.parse(input.createdAt);
  const seen = Date.parse(input.lastSeenAt);
  if (Number.isNaN(created) || Number.isNaN(seen)) return true;
  return input.now >= guestSessionExpiry(new Date(created), new Date(seen));
}

// ─── API 오류 계약 (PRD §10) ──────────────────────────────

export type ApiErrorCode =
  | "VALIDATION_FAILED" // 422
  | "RATE_LIMITED" // 429
  | "UNAUTHENTICATED" // 401
  | "FORBIDDEN" // 403
  | "NOT_FOUND" // 404
  | "VERSION_CONFLICT" // 409
  | "IDEMPOTENCY_MISMATCH" // 409
  | "UNAVAILABLE"; // 503

export const API_ERROR_STATUS: Record<ApiErrorCode, number> = {
  VALIDATION_FAILED: 422,
  RATE_LIMITED: 429,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VERSION_CONFLICT: 409,
  IDEMPOTENCY_MISMATCH: 409,
  UNAVAILABLE: 503,
};

/**
 * 사용자에게 보여줄 문구. PRD §10 말미의 상태별 동작을 문장으로 고정한다.
 * 401 에서 자동 재게시하지 않는다 — 같은 글이 두 번 올라간다.
 */
export const API_ERROR_TEXT: Record<ApiErrorCode, string> = {
  VALIDATION_FAILED: "입력을 확인해 주세요.",
  RATE_LIMITED: "잠시 후 다시 시도해 주세요.",
  UNAUTHENTICATED: "다시 시도해 주세요. 작성 중인 내용은 남아 있습니다.",
  FORBIDDEN: "권한이 없습니다.",
  NOT_FOUND: "대상을 찾을 수 없습니다.",
  VERSION_CONFLICT: "다른 담당자가 먼저 변경했습니다. 최신 상태를 확인하고 다시 선택해 주세요.",
  IDEMPOTENCY_MISMATCH: "같은 요청 키로 다른 내용이 들어왔습니다.",
  UNAVAILABLE: "일시적으로 연결이 어렵습니다. 급하면 병원에 전화해 주세요.",
};
