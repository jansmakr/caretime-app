import { describe, expect, it } from "vitest";
import { mergeRoomMessages } from "./service";
import { ZERO_REACTIONS } from "./reactions";
import { EMPTY_SCOPE, type ChatMessage } from "./types";

/**
 * 첫 렌더에 글이 보이는가.
 *
 * 서버가 읽어 온 글을 마운트 뒤에만 올리면, 서버가 보낸 HTML 은 **항상 0건**이다.
 * 느린 기기에서 첫 그림이 "아무 말도 없는 방"이고, 글이 적은 출시 직후에 그 한 순간이
 * 제일 중요하다. 그래서 합치는 규칙을 함수로 떼어 테스트가 붙든다.
 */

function msg(id: string, createdAt: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id,
    category: "other",
    topic: null,
    body: `본문 ${id}`,
    scope: EMPTY_SCOPE,
    handle: "익명",
    mine: false,
    baseReactions: ZERO_REACTIONS,
    createdAt,
    ...extra,
  };
}

const NONE: Record<string, true> = {};

describe("방 목록 합치기", () => {
  it("★ 보관소가 비어 있어도 서버가 읽어 온 글이 보인다 — 첫 HTML 이 0건이면 안 된다", () => {
    const merged = mergeRoomMessages({
      stored: [],
      initial: [msg("a", "2026-10-01T10:00:00Z")],
      seeded: [],
      removedIds: NONE,
    });
    expect(merged.map((m) => m.id)).toEqual(["a"]);
  });

  it("★ 같은 글이 두 번 보이지 않는다", () => {
    const merged = mergeRoomMessages({
      stored: [msg("a", "2026-10-01T10:00:00Z")],
      initial: [msg("a", "2026-10-01T10:00:00Z")],
      seeded: [],
      removedIds: NONE,
    });
    expect(merged).toHaveLength(1);
  });

  it("★ 같은 id 면 보관소 쪽이 이긴다 — '내 글' 표시는 서버가 모른다", () => {
    const merged = mergeRoomMessages({
      stored: [msg("a", "2026-10-01T10:00:00Z", { mine: true })],
      initial: [msg("a", "2026-10-01T10:00:00Z", { mine: false })],
      seeded: [],
      removedIds: NONE,
    });
    expect(merged[0].mine).toBe(true);
  });

  it("★ 격리·삭제된 글은 서버 목록에 남아 있어도 되살아나지 않는다", () => {
    const merged = mergeRoomMessages({
      stored: [],
      initial: [msg("a", "2026-10-01T10:00:00Z"), msg("b", "2026-10-01T09:00:00Z")],
      seeded: [],
      removedIds: { a: true },
    });
    expect(merged.map((m) => m.id)).toEqual(["b"]);
  });

  it("최신이 앞이다", () => {
    const merged = mergeRoomMessages({
      stored: [msg("old", "2026-10-01T08:00:00Z")],
      initial: [msg("new", "2026-10-01T12:00:00Z")],
      seeded: [msg("mid", "2026-10-01T10:00:00Z")],
      removedIds: NONE,
    });
    expect(merged.map((m) => m.id)).toEqual(["new", "mid", "old"]);
  });
});
