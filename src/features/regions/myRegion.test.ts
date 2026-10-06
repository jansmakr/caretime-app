import { afterEach, describe, expect, it, vi } from "vitest";
import { readMyRegion } from "./myRegion";

/**
 * 저장소에 남아 있는 "덜 고른 값"을 안 고른 것으로 읽는가.
 *
 * 화면만 고치면 안 된다 — 이미 브라우저에 `{"sido":"서울","sigungu":null}` 이
 * 저장된 사람이 있고, 그 사람에게는 고친 화면이 여전히 "내 지역 서울"을 보여 준다.
 * 그래서 읽는 자리에서 걸러 다시 묻는다.
 */
function withStore(value: string | null): void {
  vi.stubGlobal("window", {
    localStorage: {
      getItem: () => value,
      setItem: () => {},
      removeItem: () => {},
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("저장된 내 지역 읽기", () => {
  it("★ 시/도만 저장된 값은 null 로 읽는다 — 다시 묻는다", () => {
    withStore(JSON.stringify({ sido: "서울", sigungu: null }));
    expect(readMyRegion()).toBeNull();
  });

  it("구까지 저장된 값은 그대로 읽는다", () => {
    withStore(JSON.stringify({ sido: "서울", sigungu: "강서구" }));
    expect(readMyRegion()).toEqual({ sido: "서울", sigungu: "강서구" });
  });

  it("구 목록이 없는 시도는 시/도만으로도 읽는다", () => {
    withStore(JSON.stringify({ sido: "부산", sigungu: null }));
    expect(readMyRegion()).toEqual({ sido: "부산", sigungu: null });
  });

  it("목록에 없는 구 · 없는 시도 · 깨진 JSON 은 전부 null", () => {
    withStore(JSON.stringify({ sido: "서울", sigungu: "없는구" }));
    expect(readMyRegion()).toBeNull();
    withStore(JSON.stringify({ sido: "경기남부", sigungu: null }));
    expect(readMyRegion()).toBeNull();
    withStore("{깨짐");
    expect(readMyRegion()).toBeNull();
    withStore(null);
    expect(readMyRegion()).toBeNull();
  });

  it("★ 저장소 접근이 던져도 화면이 죽지 않는다 — 시크릿 창·차단", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(readMyRegion()).toBeNull();
  });
});
