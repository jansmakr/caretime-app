import { DEFAULT_GUEST_LIMITS, type GuestLimits } from "./limits";

/**
 * 운영 중에 제한값을 조일 수 있게 한다. **서버 전용이다.**
 *
 * 왜 필요한가: 작성창을 여는 순간부터 사용자가 부딪히는 값이다. 도배가 시작되면 조여야
 * 하고, 정상 이용을 막고 있으면 풀어야 한다. 그때마다 재빌드·재배포를 하면 대응이
 * 몇 십 분 늦는다. 야간에는 그 사이에 방이 망가진다.
 *
 * NEXT_PUBLIC_ 을 붙이지 않는다. 판정은 서버가 하고, 브라우저가 이 값을 알 이유가 없다 —
 * 알면 "몇 건까지 되는지" 보고 맞춰 쓰는 경로가 생긴다.
 *
 * 형식은 `창초:건수` 를 쉼표로 이은 것이다. 예: 30:1,3600:10,86400:30
 * 읽을 수 없는 값이면 기본값을 쓴다. **틀린 설정 때문에 제한이 풀리지 않게 한다** —
 * 여기서 조용히 무제한이 되면 그게 가장 나쁜 실패다.
 */

export const LIMIT_ENV = {
  posts: "GUEST_LIMIT_POSTS",
  reactions: "GUEST_LIMIT_REACTIONS",
  reports: "GUEST_LIMIT_REPORTS",
  duplicateBodyMinutes: "GUEST_LIMIT_DUPLICATE_MINUTES",
} as const;

/** "30:1,3600:10" → [{windowMs:30000,max:1},...]. 못 읽으면 null. */
export function parseRules(raw: string | undefined): GuestLimits["posts"] | null {
  if (!raw || raw.trim() === "") return null;

  const rules: GuestLimits["posts"] = [];
  for (const part of raw.split(",")) {
    const [windowText, maxText] = part.split(":");
    const windowSeconds = Number(windowText);
    const max = Number(maxText);
    const valid =
      Number.isInteger(windowSeconds) &&
      windowSeconds > 0 &&
      Number.isInteger(max) &&
      max > 0 &&
      max <= 10_000;
    if (!valid) return null; // 한 조각이라도 이상하면 전체를 버린다. 반만 적용하지 않는다.
    rules.push({ windowMs: windowSeconds * 1_000, max });
  }
  return rules.length > 0 ? rules : null;
}

export function resolveLimits(env: Record<string, string | undefined> = process.env): GuestLimits {
  const duplicateMinutes = Number(env[LIMIT_ENV.duplicateBodyMinutes]);

  return {
    posts: parseRules(env[LIMIT_ENV.posts]) ?? DEFAULT_GUEST_LIMITS.posts,
    reactions: parseRules(env[LIMIT_ENV.reactions]) ?? DEFAULT_GUEST_LIMITS.reactions,
    reports: parseRules(env[LIMIT_ENV.reports]) ?? DEFAULT_GUEST_LIMITS.reports,
    duplicateBodyWindowMs:
      Number.isInteger(duplicateMinutes) && duplicateMinutes > 0
        ? duplicateMinutes * 60_000
        : DEFAULT_GUEST_LIMITS.duplicateBodyWindowMs,
  };
}
