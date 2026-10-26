import { afterEach, describe, expect, it, vi } from "vitest";
import {
  IN_APP_NOTICE,
  LOCATE_FAIL,
  isInAppBrowser,
  autoLocateNotice,
  locateMyRegion,
  matchRegion,
  normalizeSido,
  shouldAutoLocate,
  withTimeout,
} from "./geolocate";

/**
 * 추측하지 않는다는 것을 고정한다.
 *
 * 위치로 지역을 채워 주는 기능에서 가장 나쁜 실패는 "못 찾는 것"이 아니라
 * **틀린 곳을 조용히 고르는 것**이다. 그 글은 엉뚱한 동네에 붙고, 읽은 사람이
 * 헛걸음한다. 그래서 맞지 않으면 아무것도 고르지 않는 쪽을 테스트가 붙든다.
 */
describe("카카오 이름 → 우리 지역", () => {
  it("★ 서울은 구까지 맞춘다", () => {
    const out = matchRegion({ sido: "서울특별시", sigungu: "강서구" });
    expect(out).toEqual({ kind: "matched", region: { sido: "서울", sigungu: "강서구" } });
  });

  it("★ 구 목록이 없는 시도는 시·도까지가 끝이다 — 없는 구를 만들지 않는다", () => {
    expect(matchRegion({ sido: "부산광역시", sigungu: "강서구" })).toEqual({
      kind: "sido-only",
      region: { sido: "부산", sigungu: null },
    });
    expect(matchRegion({ sido: "경기도", sigungu: "수원시" })).toEqual({
      kind: "sido-only",
      region: { sido: "경기", sigungu: null },
    });
  });

  it("★ 서울인데 구 이름이 목록에 없으면 **아무것도 고르지 않는다**", () => {
    const out = matchRegion({ sido: "서울특별시", sigungu: "없는구" });
    expect(out.kind).toBe("unmatched");
    // 가까운 구를 골라 주지 않는다. region 자체가 없다.
    expect(out).not.toHaveProperty("region");
  });

  it("★ 서울인데 구가 비어 있어도 고르지 않는다", () => {
    expect(matchRegion({ sido: "서울특별시", sigungu: null }).kind).toBe("unmatched");
    expect(matchRegion({ sido: "서울특별시", sigungu: "  " }).kind).toBe("unmatched");
  });

  it("★ 시·도를 못 알아보면 고르지 않는다 — 바다 위·국외", () => {
    expect(matchRegion({ sido: "", sigungu: null }).kind).toBe("unmatched");
    expect(matchRegion({ sido: "Tokyo", sigungu: "Shibuya" }).kind).toBe("unmatched");
  });

  it("실패에도 이유가 한 줄 붙는다 — 무엇을 하라는지까지", () => {
    const out = matchRegion({ sido: "Tokyo", sigungu: null });
    expect(out.kind === "unmatched" && out.reason).toContain("직접 골라 주세요");
  });
});

describe("시·도 표기 맞추기", () => {
  it("긴 표기와 짧은 표기를 모두 받는다", () => {
    for (const [input, expected] of [
      ["서울특별시", "서울"],
      ["서울", "서울"],
      ["경기도", "경기"],
      ["강원특별자치도", "강원"],
      ["전북특별자치도", "전북"],
      ["제주특별자치도", "제주"],
      ["세종특별자치시", "세종"],
    ] as const) {
      expect(normalizeSido(input), input).toBe(expected);
    }
  });

  it("모르는 이름은 null — 비슷한 것을 고르지 않는다", () => {
    expect(normalizeSido("경기남부")).toBe("경기"); // 접두사가 같으면 받는다
    expect(normalizeSido("Seoul")).toBeNull();
    expect(normalizeSido("")).toBeNull();
  });
});

/**
 * ★ 좌표가 밖으로 나갈 수 있는가 — **타입과 소스로 함께 본다.**
 *
 * 이 기능의 약속은 "위도·경도가 우리 서버·저장소·로그 어디에도 안 간다" 하나다.
 * 그 약속은 코드를 고치면 조용히 깨진다. 그래서 두 가지를 고정한다.
 */
describe("좌표는 밖으로 나가지 않는다", () => {
  /*
   * **주석을 걷어내고 본다.** 걷어내지 않으면 "localStorage 에 넣지 않는다"는
   * 설명 문장이 검사에 걸린다 — 약속을 적어 둔 것이 약속을 어긴 증거가 되는
   * 우스운 일이 생긴다. 보려는 것은 실제로 도는 코드다.
   */
  const SOURCE = codeOf("src/features/regions/geolocate.ts");
  const BUTTON = codeOf("src/components/chat/LocateButton.tsx");

  it("★ 돌려주는 값에 좌표가 없다 — 타입에 숫자가 없다", () => {
    /*
     * matchRegion 이 돌려주는 것은 지역 이름뿐이다. 좌표를 돌려주려면 타입을
     * 고쳐야 하고, 그러면 이 테스트가 먼저 깨진다.
     */
    const out = matchRegion({ sido: "서울특별시", sigungu: "강서구" });
    expect(JSON.stringify(out)).not.toMatch(/\d+\.\d+/);
    expect(out).not.toHaveProperty("lat");
    expect(out).not.toHaveProperty("lng");
    expect(out).not.toHaveProperty("coords");
  });

  it("★ 좌표를 저장소·쿠키에 넣는 코드가 없다", () => {
    for (const source of [SOURCE, BUTTON]) {
      expect(source).not.toMatch(/localStorage/);
      expect(source).not.toMatch(/sessionStorage/);
      expect(source).not.toMatch(/document\.cookie/);
    }
  });

  it("★ 우리 서버로 보내는 코드가 없다 — fetch 도 없다", () => {
    /*
     * 변환은 브라우저가 카카오로 **직접** 간다(SDK 가 한다). 우리 쪽으로 가는
     * 요청이 하나도 없으므로 좌표가 우리를 지나갈 길 자체가 없다.
     * 누가 여기에 fetch 를 적으면 이 테스트가 깨지고, 그때 좌표를 싣는지 본다.
     */
    for (const source of [SOURCE, BUTTON]) {
      expect(source).not.toMatch(/\bfetch\s*\(/);
      expect(source).not.toMatch(/XMLHttpRequest/);
      expect(source).not.toMatch(/navigator\.sendBeacon/);
    }
  });

  it("★ 좌표를 콘솔에 찍지 않는다", () => {
    for (const source of [SOURCE, BUTTON]) {
      expect(source).not.toMatch(/console\.(log|warn|error|info|debug)/);
    }
  });

  it("★ 좌표가 React 상태에 들어가지 않는다 — 버튼은 결과만 들고 있다", () => {
    // useState 로 들고 있는 것은 busy(boolean)와 outcome(지역 이름)뿐이다.
    const states = [...BUTTON.matchAll(/useState<?([^>]*)>?\(/g)].map((m) => m[1]);
    for (const t of states) {
      expect(t).not.toMatch(/Position|coords|number/i);
    }
  });

  it("★ REST 키를 쓰지 않는다 — 브라우저에 두면 그대로 샌다", () => {
    expect(SOURCE).not.toMatch(/KAKAO_REST/);
    expect(SOURCE).toMatch(/NEXT_PUBLIC_KAKAO_MAP_KEY/);
  });
});

/** 소스에서 주석을 걷어낸 것. 테스트가 보는 것은 도는 코드다. */
function codeOf(path: string): string {
  const raw = require("node:fs").readFileSync(path, "utf8") as string;
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, " ") // 블록 주석
    .replace(/(^|[^:])\/\/.*$/gm, "$1"); // 줄 주석 (URL 의 // 는 건드리지 않는다)
}

describe("shouldAutoLocate — 접속하면 묻되, 거부한 사람·고른 값은 건드리지 않는다", () => {
  const base = {
    regionLoaded: true,
    hasRegion: false,
    keyConfigured: true,
    permission: "prompt" as const,
    alreadyAsked: false,
  };

  it("★ 처음 온 사람(권한 미정)에게도 바로 묻는다", () => {
    expect(shouldAutoLocate(base)).toBe(true);
  });
  it("권한 조회를 못 하는 브라우저도 묻는다", () => {
    expect(shouldAutoLocate({ ...base, permission: "unknown" })).toBe(true);
  });
  it("이미 허락했으면 찾는다", () => {
    expect(shouldAutoLocate({ ...base, permission: "granted" })).toBe(true);
  });
  it("★ 거부한 사람에게는 다시 묻지 않는다", () => {
    expect(shouldAutoLocate({ ...base, permission: "denied" })).toBe(false);
  });
  it("★ 한 탭에서 두 번 묻지 않는다 — 창을 닫은 사람을 화면마다 막지 않는다", () => {
    expect(shouldAutoLocate({ ...base, alreadyAsked: true })).toBe(false);
    expect(shouldAutoLocate({ ...base, permission: "unknown", alreadyAsked: true })).toBe(false);
  });
  it("허락한 사람은 창이 뜨지 않으므로 이미 물었어도 찾는다", () => {
    expect(shouldAutoLocate({ ...base, permission: "granted", alreadyAsked: true })).toBe(true);
  });
  it("저장된 지역이 있으면 덮지 않는다", () => {
    expect(shouldAutoLocate({ ...base, hasRegion: true, permission: "granted" })).toBe(false);
  });
  it("저장소를 읽기 전에는 판단하지 않는다", () => {
    expect(shouldAutoLocate({ ...base, regionLoaded: false })).toBe(false);
  });
  it("지도 키가 없으면 찾지 않는다", () => {
    expect(shouldAutoLocate({ ...base, keyConfigured: false })).toBe(false);
  });
});

describe("못 찾으면 막지 않고 직접 고르게 넘긴다", () => {
  it("★ 실패 문구는 전부 '직접 골라 주세요.'로 끝난다", () => {
    for (const text of Object.values(LOCATE_FAIL)) {
      expect(text.endsWith("직접 골라 주세요.")).toBe(true);
    }
  });

  it("★ 거부는 알리지 않는다 — 방금 스스로 고른 것이다", () => {
    expect(autoLocateNotice({ kind: "failed", reason: LOCATE_FAIL.denied })).toBeNull();
  });

  it("★ 시간 초과·지도 도구 로드 실패·변환 실패·목록 불일치는 한 줄로 알린다", () => {
    for (const reason of [LOCATE_FAIL.timeout, LOCATE_FAIL.sdk, LOCATE_FAIL.geocode]) {
      expect(autoLocateNotice({ kind: "failed", reason })).toBe(reason);
    }
    const unmatched = matchRegion({ sido: "Tokyo", sigungu: null });
    expect(autoLocateNotice(unmatched)).toContain("직접 골라 주세요");
  });

  it("찾았으면 알릴 실패가 없다", () => {
    expect(autoLocateNotice(matchRegion({ sido: "부산광역시", sigungu: null }))).toBeNull();
  });

  it("한도 안에 끝나지 않으면 실패로 본다", async () => {
    vi.useFakeTimers();
    const pending = withTimeout(new Promise<never>(() => {}), 100);
    const caught = pending.catch((e: Error) => e.message);
    await vi.advanceTimersByTimeAsync(100);
    expect(await caught).toBe("timeout");
    vi.useRealTimers();
  });
});

/**
 * 지도 도구(카카오 SDK)를 못 받았을 때 실제 흐름이 무엇을 돌려주는가.
 * 브라우저 대신 navigator·document 를 붙여 두고 locateMyRegion 을 그대로 돌린다.
 */
describe("지도 도구 로드 실패 — 흐름 전체", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function stubBrowser(onAppend: (script: { onerror?: () => void }) => void) {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (ok: (p: unknown) => void) =>
          ok({ coords: { latitude: 37.55, longitude: 126.85 } }),
      },
    });
    vi.stubGlobal("document", {
      getElementById: () => null,
      createElement: () => ({}),
      head: { appendChild: onAppend },
    });
  }

  it("★ 스크립트가 오류를 내면 '직접 골라 주세요.'로 끝나는 문구를 돌려준다", async () => {
    stubBrowser((script) => script.onerror?.());
    const out = await locateMyRegion();
    expect(out).toEqual({ kind: "failed", reason: LOCATE_FAIL.sdk });
    expect(autoLocateNotice(out)).toMatch(/직접 골라 주세요\.$/);
  });

  it("★ 스크립트가 아무 응답 없이 멈춰도 끝없이 기다리지 않는다", async () => {
    vi.useFakeTimers();
    stubBrowser(() => {});
    const out = locateMyRegion();
    await vi.advanceTimersByTimeAsync(8_000);
    expect(await out).toEqual({ kind: "failed", reason: LOCATE_FAIL.sdk });
  });

  it("좌표를 돌려주지 않는다", async () => {
    stubBrowser((script) => script.onerror?.());
    const out = await locateMyRegion();
    expect(JSON.stringify(out)).not.toMatch(/37\.55|126\.85/);
  });
});

describe("인앱 브라우저 — 권한 창이 안 뜨는 곳에서는 다른 브라우저로 여는 길을 알린다", () => {
  const ANDROID_CHROME =
    "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";
  const IOS_SAFARI =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1";
  const SAMSUNG =
    "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36";

  it("★ 카카오톡 인앱(안드로이드·아이폰)을 알아본다", () => {
    expect(isInAppBrowser(`${ANDROID_CHROME} KAKAOTALK 10.8.5`)).toBe(true);
    expect(isInAppBrowser(`${IOS_SAFARI} KAKAOTALK 10.8.5`)).toBe(true);
  });

  it("네이버·인스타그램·페이스북·라인 인앱도", () => {
    expect(isInAppBrowser(`${ANDROID_CHROME} NAVER(inapp; search; 2000; 12.8.1)`)).toBe(true);
    expect(isInAppBrowser(`${IOS_SAFARI} Instagram 350.0.0`)).toBe(true);
    expect(isInAppBrowser(`${IOS_SAFARI} [FBAN/FBIOS;FBAV/480.0]`)).toBe(true);
    expect(isInAppBrowser(`${ANDROID_CHROME} Line/14.16.0`)).toBe(true);
  });

  it("★ 크롬·사파리·삼성 인터넷은 인앱이 아니다", () => {
    for (const ua of [ANDROID_CHROME, IOS_SAFARI, SAMSUNG]) expect(isInAppBrowser(ua)).toBe(false);
  });

  it("★ 안내는 한 줄이고 '크롬 등으로 열어 주세요'로 끝난다", () => {
    expect(IN_APP_NOTICE).not.toContain("\n");
    expect(IN_APP_NOTICE.endsWith("크롬 등으로 열어 주세요.")).toBe(true);
  });
});
