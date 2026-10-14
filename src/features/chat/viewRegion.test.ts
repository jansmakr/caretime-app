import { afterEach, describe, expect, it, vi } from "vitest";
import {
  emptyListCopy,
  readViewChoice,
  resolveInitialView,
  writeViewChoice,
} from "./viewRegion";

/** node 환경이라 window 가 없다. 테스트마다 저장소를 새로 세운다. */
function stubStorage(store: Map<string, string> = new Map()) {
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  });
  return store;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("(1) 저장된 수동 선택이 먼저다", () => {
  it("직접 고른 시·도가 있으면 내 지역·위치를 보지 않는다", async () => {
    const autoLocate = vi.fn(async () => ({ sido: "부산" as const, sigungu: null }));
    const view = await resolveInitialView({
      saved: "대구",
      myRegion: { sido: "서울", sigungu: "강서구" },
      autoLocate,
    });
    expect(view).toEqual({ sido: "대구", source: "saved" });
    expect(autoLocate).not.toHaveBeenCalled();
  });

  it("'전국'을 직접 고른 것도 선택이다 — 위치로 덮지 않는다", async () => {
    const autoLocate = vi.fn(async () => ({ sido: "부산" as const, sigungu: null }));
    const view = await resolveInitialView({ saved: null, myRegion: null, autoLocate });
    expect(view).toEqual({ sido: null, source: "saved" });
    expect(autoLocate).not.toHaveBeenCalled();
  });

  it("직접 고른 것이 없으면 내 지역의 시·도, 그것도 없으면 위치", async () => {
    expect(
      await resolveInitialView({
        saved: undefined,
        myRegion: { sido: "서울", sigungu: "강서구" },
        autoLocate: async () => null,
      }),
    ).toEqual({ sido: "서울", source: "my-region" });

    expect(
      await resolveInitialView({
        saved: undefined,
        myRegion: null,
        autoLocate: async () => ({ sido: "부산", sigungu: null }),
      }),
    ).toEqual({ sido: "부산", source: "located", region: { sido: "부산", sigungu: null } });
  });
});

describe("(2) 위치 거부·실패·시간 초과는 조용히 전국", () => {
  const base = { saved: undefined, myRegion: null } as const;

  it("권한이 없으면(찾기가 null) 전국", async () => {
    expect(await resolveInitialView({ ...base, autoLocate: async () => null })).toEqual({
      sido: null,
      source: "nationwide",
    });
  });

  it("찾기가 던져도 전국 — 오류로 막지 않는다", async () => {
    const view = await resolveInitialView({
      ...base,
      autoLocate: async () => {
        throw new Error("denied");
      },
    });
    expect(view).toEqual({ sido: null, source: "nationwide" });
  });

  it("5초 안에 못 찾으면 전국", async () => {
    vi.useFakeTimers();
    const pending = resolveInitialView({ ...base, autoLocate: () => new Promise(() => {}) });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await pending).toEqual({ sido: null, source: "nationwide" });
  });
});

describe("(3) 시·도 선택 저장", () => {
  it("고른 시·도와 '전국'이 저장되고 다시 읽힌다", () => {
    stubStorage();
    expect(readViewChoice()).toBeUndefined();
    writeViewChoice("광주");
    expect(readViewChoice()).toBe("광주");
    writeViewChoice(null);
    expect(readViewChoice()).toBeNull();
  });

  it("목록에 없는 값·깨진 값은 고른 적 없는 것으로 읽는다", () => {
    const store = stubStorage();
    store.set("caretime_chat_view", JSON.stringify({ sido: "아틀란티스" }));
    expect(readViewChoice()).toBeUndefined();
    store.set("caretime_chat_view", "{not json");
    expect(readViewChoice()).toBeUndefined();
  });

  it("저장소가 막혀도 던지지 않는다", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(() => writeViewChoice("서울")).not.toThrow();
    expect(readViewChoice()).toBeUndefined();
  });
});

describe("(4) 빈 상태 문구", () => {
  it("고른 지역에 글이 없으면 '이 지역엔 아직 글이 없어요'", () => {
    expect(emptyListCopy({ loadFailed: false, regionFiltered: true, recentOnly: true })).toBe(
      "이 지역엔 아직 글이 없어요",
    );
  });

  it("조회 실패는 '글이 없다'고 말하지 않는다", () => {
    const copy = emptyListCopy({ loadFailed: true, regionFiltered: true, recentOnly: true });
    expect(copy).toContain("불러오지 못했습니다");
    expect(copy).not.toBe("이 지역엔 아직 글이 없어요");
  });
});
