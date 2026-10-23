import { describe, expect, it } from "vitest";
import { DEFAULT_GUEST_LIMITS } from "@/features/p0/limits";
import { LIMIT_ENV, resolveLimits } from "@/features/p0/serverLimits";
import {
  REPLY_SEEN_MAX,
  countNewReplies,
  newRepliesLabel,
  replyButtonLabel,
  withReplySeen,
} from "./replies";

const POST = "p1";
const OTHER_POST = "p2";

function reply(id: string, parentId: string, createdAt: string) {
  return { id, parentId, createdAt };
}

describe("새 답글 — 브라우저에서 센다", () => {
  const times = [
    reply("r1", POST, "2026-10-22T10:00:00Z"),
    reply("r2", POST, "2026-10-22T10:05:00Z"),
    reply("r3", OTHER_POST, "2026-10-22T10:06:00Z"),
  ];

  it("본 기록이 없으면 내 글의 답글은 모두 새 답글이다", () => {
    expect(
      countNewReplies({ times, myPostIds: new Set([POST]), myReplyIds: new Set(), seen: {} }),
    ).toEqual({ [POST]: 2 });
  });

  it("본 시각 이후의 답글만 센다", () => {
    expect(
      countNewReplies({
        times,
        myPostIds: new Set([POST]),
        myReplyIds: new Set(),
        seen: { [POST]: "2026-10-22T10:00:00Z" },
      }),
    ).toEqual({ [POST]: 1 });
  });

  it("남의 글에는 세지 않는다 — 남의 글에 달린 답글은 내 소식이 아니다", () => {
    expect(
      countNewReplies({ times, myPostIds: new Set(), myReplyIds: new Set(), seen: {} }),
    ).toEqual({});
  });

  it("내 글에 내가 단 답글은 세지 않는다", () => {
    expect(
      countNewReplies({ times, myPostIds: new Set([POST]), myReplyIds: new Set(["r2"]), seen: {} }),
    ).toEqual({ [POST]: 1 });
  });

  it("본 시각은 뒤로 가지 않는다", () => {
    const seen = { [POST]: "2026-10-22T10:05:00Z" };
    expect(withReplySeen(seen, POST, "2026-10-22T10:00:00Z")).toBe(seen);
    expect(withReplySeen(seen, POST, "2026-10-22T10:09:00Z")[POST]).toBe("2026-10-22T10:09:00Z");
  });

  it("기억하는 글 수에 상한이 있고, 가장 오래 본 것부터 버린다", () => {
    let seen = {};
    for (let i = 0; i < REPLY_SEEN_MAX + 5; i++) {
      seen = withReplySeen(seen, `p${i}`, new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString());
    }
    expect(Object.keys(seen)).toHaveLength(REPLY_SEEN_MAX);
    expect(seen).not.toHaveProperty("p0");
  });
});

describe("문구", () => {
  it("버튼과 새 답글 표시", () => {
    expect(replyButtonLabel(0)).toBe("답글 0개");
    expect(replyButtonLabel(3)).toBe("답글 3개");
    expect(newRepliesLabel(2)).toBe("새 답글 2개");
  });
});

describe("답글 제한 — 2026-10-22 결정값", () => {
  it("10초 1건 · 1시간 20건 · 하루 60건", () => {
    expect(DEFAULT_GUEST_LIMITS.replies).toEqual([
      { windowMs: 10_000, max: 1 },
      { windowMs: 3_600_000, max: 20 },
      { windowMs: 86_400_000, max: 60 },
    ]);
  });

  it("환경변수로 조정할 수 있고, 이상한 값이면 기본값이다", () => {
    expect(resolveLimits({ [LIMIT_ENV.replies]: "30:1" }).replies).toEqual([
      { windowMs: 30_000, max: 1 },
    ]);
    expect(resolveLimits({ [LIMIT_ENV.replies]: "x" }).replies).toEqual(DEFAULT_GUEST_LIMITS.replies);
  });
});
