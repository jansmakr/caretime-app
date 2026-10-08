import { afterEach, describe, expect, it, vi } from "vitest";
import { isIos, isStandalone, rememberDismissed, wasDismissed } from "./install";

/**
 * 안내를 **언제 보여 주지 않는가**를 고정한다.
 *
 * 보여 주는 쪽이 틀리면 한 번 거슬리고 만다. 보여 주지 않아야 할 때 보여 주는 쪽이
 * 나쁘다 — 이미 설치한 사람에게 또 권하고, 닫은 사람에게 다시 띄운다. 그리고
 * 저장소가 막힌 환경(시크릿 창)에서 **던지면 홈 화면이 통째로 깨진다.**
 */
function withWindow(win: Record<string, unknown>): void {
  vi.stubGlobal("window", win);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("이미 설치돼 있으면 권하지 않는다", () => {
  it("★ display-mode: standalone", () => {
    withWindow({ matchMedia: () => ({ matches: true }), navigator: {} });
    expect(isStandalone()).toBe(true);
  });

  it("★ iOS 사파리의 비표준 플래그도 본다 — display-mode 를 늦게 지원했다", () => {
    withWindow({ matchMedia: () => ({ matches: false }), navigator: { standalone: true } });
    expect(isStandalone()).toBe(true);
  });

  it("브라우저에서 열었으면 false", () => {
    withWindow({ matchMedia: () => ({ matches: false }), navigator: {} });
    expect(isStandalone()).toBe(false);
  });

  it("matchMedia 가 없는 환경에서도 던지지 않는다", () => {
    withWindow({ navigator: {} });
    expect(isStandalone()).toBe(false);
  });
});

describe("iOS 판정 — 버튼 대신 안내만 줄 대상", () => {
  it("★ 아이폰", () => {
    withWindow({ navigator: { userAgent: "… (iPhone; CPU iPhone OS 17_0 …) Safari", maxTouchPoints: 5 } });
    expect(isIos()).toBe(true);
  });

  it("★ 아이패드는 데스크톱 UA 로 온다 — 터치 지원까지 함께 본다", () => {
    withWindow({ navigator: { userAgent: "… (Macintosh; Intel Mac OS X 10_15_7) Safari", maxTouchPoints: 5 } });
    expect(isIos()).toBe(true);
  });

  it("진짜 맥은 iOS 가 아니다 — 터치가 없다", () => {
    withWindow({ navigator: { userAgent: "… (Macintosh; Intel Mac OS X 10_15_7) Safari", maxTouchPoints: 0 } });
    expect(isIos()).toBe(false);
  });

  it("안드로이드는 iOS 가 아니다 — 이쪽은 버튼을 준다", () => {
    withWindow({ navigator: { userAgent: "… (Linux; Android 14) Chrome/120", maxTouchPoints: 5 } });
    expect(isIos()).toBe(false);
  });
});

describe("닫은 선택은 이 기기에만 남는다", () => {
  it("★ 저장되고 읽힌다 — 같은 안내를 다시 띄우지 않는다", () => {
    const store = new Map<string, string>();
    withWindow({
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
    });
    expect(wasDismissed()).toBe(false);
    rememberDismissed();
    expect(wasDismissed()).toBe(true);
    // 서버로 가지 않는다. 키 하나가 이 기기에만 남는다(방침 1-4).
    expect([...store.keys()]).toEqual(["caretime_install_dismissed"]);
  });

  it("★ 저장소가 막혀도 던지지 않는다 — 시크릿 창에서 홈이 깨지면 안 된다", () => {
    withWindow({
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(wasDismissed()).toBe(false);
    expect(() => rememberDismissed()).not.toThrow();
  });
});
