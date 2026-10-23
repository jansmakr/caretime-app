import { describe, expect, it } from "vitest";
import { DEFAULT_GUEST_LIMITS } from "./limits";
import { MEMORY_RATE_MAX_KEYS, createMemoryRateBucket, takeMemorySlot } from "./memoryRate";
import { LIMIT_ENV, resolveLimits } from "./serverLimits";

describe("takeMemorySlot — 내 반응 읽기 제한", () => {
  const limits = DEFAULT_GUEST_LIMITS;
  const perMinute = limits.reactionReads[0].max;

  it("1분 창을 넘으면 막고, 막힌 요청은 세지 않는다", () => {
    const bucket = createMemoryRateBucket();
    const now = 1_000_000;
    for (let i = 0; i < perMinute; i++) {
      expect(takeMemorySlot({ bucket, key: "a", action: "reactionReads", limits, now }).allowed).toBe(true);
    }
    const blocked = takeMemorySlot({ bucket, key: "a", action: "reactionReads", limits, now });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(bucket.hits.get("a")).toHaveLength(perMinute);
  });

  it("주체마다 따로 센다", () => {
    const bucket = createMemoryRateBucket();
    for (let i = 0; i < perMinute; i++) {
      takeMemorySlot({ bucket, key: "a", action: "reactionReads", limits, now: 0 });
    }
    expect(takeMemorySlot({ bucket, key: "b", action: "reactionReads", limits, now: 0 }).allowed).toBe(true);
  });

  it("기억하는 주체 수에 상한이 있다", () => {
    const bucket = createMemoryRateBucket();
    for (let i = 0; i < MEMORY_RATE_MAX_KEYS + 10; i++) {
      takeMemorySlot({ bucket, key: `k${i}`, action: "reactionReads", limits, now: 0 });
    }
    expect(bucket.hits.size).toBe(MEMORY_RATE_MAX_KEYS);
    expect(bucket.hits.has("k0")).toBe(false);
  });

  it("환경값으로 조일 수 있고, 이상한 값이면 기본값이다", () => {
    expect(resolveLimits({ [LIMIT_ENV.reactionReads]: "60:5" }).reactionReads).toEqual([
      { windowMs: 60_000, max: 5 },
    ]);
    expect(resolveLimits({ [LIMIT_ENV.reactionReads]: "망가짐" }).reactionReads).toEqual(
      DEFAULT_GUEST_LIMITS.reactionReads,
    );
  });
});
