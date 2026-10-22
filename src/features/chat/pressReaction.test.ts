import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withPendingReactions, ZERO_REACTIONS } from "./reactions";
import {
  getChatSnapshot,
  hydrateMessages,
  hydrateMyReactions,
  pendingReactionKeys,
  pressReaction,
  resetChat,
} from "./store";
import type { ChatMessage } from "./types";

/**
 * 반응 숫자는 서버 기준이다.
 *
 * 전에는 (1) 새로고침하면 눌린 표시가 사라지고 (2) 다시 누르면 화면 숫자만 1 올랐다
 * (서버는 중복이라 받지 않았다). (3) 다시 누르면 화면에서만 내려가는 취소도 있었다.
 * 셋 다 서버에 없는 숫자를 보여 준다.
 */

const ID = "11111111-1111-4111-8111-111111111111";

function message(low_wait: number): ChatMessage {
  return {
    id: ID,
    category: "other",
    topic: null,
    body: "지금 대기 어때요",
    scope: { sido: "서울", sigungu: null, hospitalId: null, hospitalName: null },
    handle: "보호자",
    createdAt: new Date().toISOString(),
    mine: false,
    baseReactions: { ...ZERO_REACTIONS, low_wait },
  } as ChatMessage;
}

function shownCount(): number {
  const snap = getChatSnapshot();
  const m = snap.messages.find((x) => x.id === ID)!;
  return withPendingReactions(m.baseReactions, pendingReactionKeys(snap.pendingReactions, ID))
    .low_wait;
}

function respond(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

beforeEach(() => {
  resetChat();
  hydrateMessages([message(2)]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pressReaction", () => {
  it("저장되면 하나 오르고, 그 뒤에 시작한 읽기가 서버 값을 가져오면 두 번 세지 않는다", async () => {
    vi.stubGlobal("fetch", respond(200, { ok: true, already: false }));
    expect(await pressReaction(ID, "low_wait")).toBe("saved");
    expect(shownCount()).toBe(3);

    hydrateMessages([message(3)], Date.now() + 1);
    expect(shownCount()).toBe(3);
  });

  it("저장 전에 시작한 읽기는 내 반응을 못 셌을 수 있다 — 대기 몫을 지우지 않는다", async () => {
    vi.stubGlobal("fetch", respond(200, { ok: true, already: false }));
    const startedBefore = Date.now() - 10_000;
    await pressReaction(ID, "low_wait");
    hydrateMessages([message(2)], startedBefore);
    expect(shownCount()).toBe(3);
  });

  it("이미 누른 칩을 다시 누르면 서버로 가지 않고 숫자도 그대로 — 취소가 없다", async () => {
    const fetch = respond(200, { ok: true, already: false });
    vi.stubGlobal("fetch", fetch);
    await pressReaction(ID, "low_wait");
    expect(await pressReaction(ID, "low_wait")).toBe("already");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(shownCount()).toBe(3);
    expect(getChatSnapshot().myReactions[ID]).toEqual(["low_wait"]);
  });

  it("서버가 '이미 누름'이라고 하면 표시는 남기고 숫자는 올리지 않는다", async () => {
    vi.stubGlobal("fetch", respond(200, { ok: true, already: true }));
    expect(await pressReaction(ID, "low_wait")).toBe("already");
    expect(shownCount()).toBe(2);
    expect(getChatSnapshot().myReactions[ID]).toEqual(["low_wait"]);
  });

  it("내 글이라고 거절되면 표시·숫자를 되돌리고 그 글을 내 글로 표시한다", async () => {
    vi.stubGlobal("fetch", respond(403, { error: "own_post" }));
    expect(await pressReaction(ID, "low_wait")).toBe("own_post");
    expect(shownCount()).toBe(2);
    expect(getChatSnapshot().myReactions[ID]).toEqual([]);
    expect(getChatSnapshot().mineIds[ID]).toBe(true);
  });

  it("제한·실패면 되돌린다 — 저장되지 않은 반응을 숫자에 남기지 않는다", async () => {
    vi.stubGlobal("fetch", respond(429, { error: "rate_limited" }));
    expect(await pressReaction(ID, "low_wait")).toBe("rate_limited");
    expect(shownCount()).toBe(2);

    vi.stubGlobal("fetch", respond(500, {}));
    expect(await pressReaction(ID, "low_wait")).toBe("failed");
    expect(shownCount()).toBe(2);
    expect(getChatSnapshot().myReactions[ID]).toEqual([]);
  });
});

describe("hydrateMyReactions", () => {
  it("새로고침 뒤 서버가 알려 준 내 반응은 눌린 표시만 되살리고 숫자에 더하지 않는다", async () => {
    vi.stubGlobal("fetch", respond(200, { mine: { [ID]: ["low_wait", "bogus"] } }));
    hydrateMyReactions();
    await vi.waitFor(() => expect(getChatSnapshot().myReactions[ID]).toEqual(["low_wait"]));
    expect(shownCount()).toBe(2);
  });
});
