import { describe, expect, it } from "vitest";
import { DEFAULT_GUEST_LIMITS } from "@/features/p0/limits";
import { LIMIT_ENV, parseRules, resolveLimits } from "@/features/p0/serverLimits";

/**
 * 제한값을 환경에서 덮어쓰는 규칙.
 *
 * 가장 중요한 성질은 "틀린 설정이 제한을 풀지 않는다"다. 여기서 조용히 무제한이 되면
 * 그게 가장 나쁜 실패다 — 아무도 모르고, 방이 망가진 뒤에야 안다.
 */

describe("parseRules", () => {
  it("창:건수 를 읽는다", () => {
    expect(parseRules("30:1,3600:10")).toEqual([
      { windowMs: 30_000, max: 1 },
      { windowMs: 3_600_000, max: 10 },
    ]);
  });

  it("비어 있으면 null — 기본값을 쓰라는 뜻이다", () => {
    expect(parseRules(undefined)).toBeNull();
    expect(parseRules("")).toBeNull();
    expect(parseRules("   ")).toBeNull();
  });

  it("★ 한 조각이라도 이상하면 전체를 버린다 — 반만 적용하지 않는다", () => {
    expect(parseRules("30:1,이상한값")).toBeNull();
    expect(parseRules("30:1,3600:0")).toBeNull();
    expect(parseRules("0:5")).toBeNull();
    expect(parseRules("-30:1")).toBeNull();
    expect(parseRules("30:1.5")).toBeNull();
  });

  it("★ 터무니없이 큰 수는 받지 않는다 — 실수로 제한을 푸는 경로다", () => {
    expect(parseRules("30:999999")).toBeNull();
  });
});

describe("resolveLimits", () => {
  it("설정이 없으면 PRD 기본값", () => {
    expect(resolveLimits({})).toEqual(DEFAULT_GUEST_LIMITS);
  });

  it("★ 설정이 이상하면 기본값으로 떨어진다 — 무제한이 되지 않는다", () => {
    const limits = resolveLimits({ [LIMIT_ENV.posts]: "망가진 값" });
    expect(limits.posts).toEqual(DEFAULT_GUEST_LIMITS.posts);
  });

  it("조일 수 있다", () => {
    const limits = resolveLimits({ [LIMIT_ENV.posts]: "60:1,3600:5" });
    expect(limits.posts).toEqual([
      { windowMs: 60_000, max: 1 },
      { windowMs: 3_600_000, max: 5 },
    ]);
    // 건드리지 않은 것은 그대로다.
    expect(limits.reactions).toEqual(DEFAULT_GUEST_LIMITS.reactions);
  });

  it("중복 본문 창도 분 단위로 바꿀 수 있다", () => {
    expect(resolveLimits({ [LIMIT_ENV.duplicateBodyMinutes]: "30" }).duplicateBodyWindowMs).toBe(
      30 * 60_000,
    );
    expect(resolveLimits({ [LIMIT_ENV.duplicateBodyMinutes]: "0" }).duplicateBodyWindowMs).toBe(
      DEFAULT_GUEST_LIMITS.duplicateBodyWindowMs,
    );
  });
});
