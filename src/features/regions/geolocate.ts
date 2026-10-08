"use client";

import { SIDO_LIST, type Sido } from "@/features/reports/regions";
import { SIGUNGU_BY_SIDO, hasSigunguList, type MyRegion } from "./sigungu";

/**
 * "내 위치로 선택" — 좌표를 **지역 이름으로 바꾸고 바로 버린다.**
 *
 * ── 좌표는 우리 서버에 가지 않는다 ──────────────────────────
 * 이 파일이 지키는 약속은 하나다. 위도·경도는
 *   ① `getCurrentPosition` 의 콜백 안에서 꺼내
 *   ② 카카오 SDK 의 변환 함수에 넘기고
 *   ③ 그 함수가 끝나면 사라진다.
 *
 * 좌표가 들어가지 않는 곳: 우리 서버로 가는 요청(본문·쿼리·헤더), 쿠키,
 * localStorage, 콘솔, 에러 메시지. **React 상태에도 넣지 않는다** —
 * 상태에 넣는 순간 화면이 다시 그려질 때까지 메모리에 남고, 다음 사람이
 * "이미 있으니 보내자"고 쓰기 쉬워진다. 그래서 아예 바깥으로 내보내지 않는다.
 *
 * 돌려주는 값에 좌표가 없다는 것이 이 약속의 전부다. 타입이 그것을 강제한다 —
 * `LocateOutcome` 어디에도 숫자가 없다.
 *
 * 변환은 **브라우저에서 카카오로 직접** 간다. 우리 서버를 거치지 않으므로
 * 좌표가 우리 쪽을 지나갈 길 자체가 없다.
 *
 * ── 추측하지 않는다 ─────────────────────────────────────────
 * 카카오가 준 이름이 우리 목록과 맞지 않으면 **아무것도 고르지 않는다.**
 * 가까운 구를 골라 주면 그 글이 엉뚱한 동네에 붙고, 그걸 읽은 사람이 헛걸음한다.
 * "덜 보이는 손해"보다 "잘못 보내는 손해"가 크다(CLAUDE.md).
 */

/** 카카오가 돌려준 지역 이름. 여기까지가 바깥으로 나오는 전부다. */
export interface RegionNames {
  /** 시·도 이름. "서울특별시" 처럼 긴 표기로 온다. */
  sido: string;
  /** 시·군·구 이름. "강서구". 없을 수도 있다. */
  sigungu: string | null;
}

export type LocateOutcome =
  /** 시·도와 구까지 찾았다. 사용자 확인을 받고 적용한다. */
  | { kind: "matched"; region: MyRegion }
  /** 시·도만 찾았다(구 목록이 없는 시도). 그대로가 끝난 값이다. */
  | { kind: "sido-only"; region: MyRegion }
  /** 이름이 우리 목록과 맞지 않는다. **고르지 않는다.** */
  | { kind: "unmatched"; reason: string }
  /** 못 찾았다. 이유를 한 줄로 보여 준다. */
  | { kind: "failed"; reason: string };

/**
 * 카카오 이름 → 우리 지역. **순수 함수다.** 브라우저가 없어도 돈다.
 *
 * 긴 이름("서울특별시")을 짧은 표기("서울")로 맞춘다. 맞추는 규칙은
 * `features/reports/regions` 의 별칭 표 하나를 쓴다 — 여기에 또 적으면 갈라진다.
 */
export function matchRegion(names: RegionNames): LocateOutcome {
  const sido = normalizeSido(names.sido);
  if (sido === null) {
    return { kind: "unmatched", reason: "지역 이름을 알아보지 못했습니다. 직접 골라 주세요." };
  }

  /*
   * 구 목록이 없는 시도(서울 밖)는 시·도까지가 끝난 값이다. 없는 구를 고르게
   * 만들지 않는다(features/regions/sigungu 의 isRegionComplete 와 같은 규칙).
   */
  if (!hasSigunguList(sido)) {
    return { kind: "sido-only", region: { sido, sigungu: null } };
  }

  const sigungu = names.sigungu?.trim() ?? "";
  if (sigungu !== "" && SIGUNGU_BY_SIDO[sido].includes(sigungu)) {
    return { kind: "matched", region: { sido, sigungu } };
  }

  /*
   * 시·도는 서울인데 구 이름이 목록에 없다. 가까운 구로 **추측하지 않는다.**
   * 서울만 목록이 있으므로 이 길은 거의 안 지나가지만, 지나갈 때 틀리면
   * 그 글이 엉뚱한 동네에 붙는다.
   */
  return { kind: "unmatched", reason: "동네 이름을 알아보지 못했습니다. 직접 골라 주세요." };
}

/** 긴 표기·짧은 표기를 모두 받아 우리 표기로. 모르면 null. */
export function normalizeSido(name: string): Sido | null {
  const trimmed = name.trim();
  const exact = SIDO_LIST.find((s) => s === trimmed);
  if (exact) return exact;
  // "서울특별시" · "경기도" · "강원특별자치도" 처럼 꼬리가 붙은 표기.
  return SIDO_LIST.find((s) => trimmed.startsWith(s)) ?? null;
}

/* ────────────────────────────────────────────────────────────
 * 여기서부터는 브라우저가 필요한 부분이다.
 * ──────────────────────────────────────────────────────────── */

/** 카카오 JS 키. **REST 키를 쓰지 않는다** — 브라우저에 두면 그대로 새어 나간다. */
export const KAKAO_JS_KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY ?? "";

/** 키가 없으면 버튼 자체를 그리지 않는다. 눌러도 안 되는 버튼을 만들지 않는다. */
export function canLocate(): boolean {
  return KAKAO_JS_KEY.trim() !== "";
}

const SCRIPT_ID = "kakao-maps-sdk";
const GEO_TIMEOUT_MS = 10_000;

interface KakaoGeocoder {
  coord2RegionCode: (
    lng: number,
    lat: number,
    callback: (
      result: { region_type: string; region_1depth_name: string; region_2depth_name: string }[],
      status: string,
    ) => void,
  ) => void;
}

interface KakaoMaps {
  load: (cb: () => void) => void;
  services: { Geocoder: new () => KakaoGeocoder; Status: { OK: string } };
}

function kakao(): { maps?: KakaoMaps } | undefined {
  return (window as unknown as { kakao?: { maps?: KakaoMaps } }).kakao;
}

/**
 * SDK 를 **버튼을 누른 뒤에** 불러온다.
 *
 * 페이지를 열 때 같이 불러오면, 위치를 쓸 생각이 없는 사람의 브라우저도 카카오에
 * 접속한다. 그건 우리가 하지 않기로 한 일이다(추적 스크립트를 안 붙이는 것과
 * 같은 이유). `autoload=false` 로 받아서 우리가 부를 때만 초기화한다.
 */
function loadSdk(): Promise<KakaoMaps> {
  return new Promise((resolve, reject) => {
    const ready = kakao()?.maps;
    if (ready?.services) return resolve(ready);

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");

    const onReady = () => {
      const maps = kakao()?.maps;
      if (!maps) return reject(new Error("sdk"));
      maps.load(() => resolve(maps));
    };

    if (existing) {
      // 이미 받아 둔 것이 있으면 초기화만 한 번 더 부른다(두 번 불러도 안전하다).
      onReady();
      return;
    }

    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(
      KAKAO_JS_KEY,
    )}&libraries=services&autoload=false`;
    script.onload = onReady;
    script.onerror = () => reject(new Error("sdk"));
    document.head.appendChild(script);
  });
}

/** 브라우저에게 좌표를 묻는다. **버튼을 눌렀을 때만 불린다.** */
function askPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("unsupported"));
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false, // 구 단위면 충분하다. 정밀도를 올리면 더 오래 걸리고 더 정확한 좌표가 생긴다.
      timeout: GEO_TIMEOUT_MS,
      maximumAge: 0,
    });
  });
}

/** 좌표 → 이름. 좌표는 이 함수 안에서만 산다. */
function toNames(maps: KakaoMaps, lat: number, lng: number): Promise<RegionNames> {
  return new Promise((resolve, reject) => {
    const geocoder = new maps.services.Geocoder();
    // 카카오는 (경도, 위도) 순서다. 뒤집으면 엉뚱한 지역이 나온다.
    geocoder.coord2RegionCode(lng, lat, (result, status) => {
      if (status !== maps.services.Status.OK || result.length === 0) return reject(new Error("geocode"));
      /*
       * 법정동(B)을 고른다. 우리 구 목록이 법정동코드에서 나왔으므로 같은 기준이어야
       * 이름이 맞는다. 행정동(H)만 오면 그것이라도 쓴다.
       */
      const row = result.find((r) => r.region_type === "B") ?? result[0];
      resolve({
        sido: row.region_1depth_name,
        sigungu: row.region_2depth_name || null,
      });
    });
  });
}

/**
 * 전체 흐름. **좌표를 돌려주지 않는다.**
 *
 * 실패는 전부 한 줄짜리 이유로 바뀐다. 어떤 실패에서도 글쓰기는 막히지 않는다 —
 * 이 함수가 하는 일은 선택지 하나를 채워 주는 것뿐이고, 직접 고르는 길은 그대로다.
 */
export async function locateMyRegion(): Promise<LocateOutcome> {
  let position: GeolocationPosition;
  try {
    position = await askPosition();
  } catch (e) {
    return { kind: "failed", reason: describeGeoError(e) };
  }

  let maps: KakaoMaps;
  try {
    maps = await loadSdk();
  } catch {
    return { kind: "failed", reason: "지도 서비스를 불러오지 못했습니다. 직접 골라 주세요." };
  }

  try {
    /*
     * 좌표를 꺼내 쓰고 바로 버린다. 지역 변수 둘이 전부이고, 이 블록을 벗어나면
     * 참조가 남지 않는다. 바깥으로 나가는 것은 names 뿐이다.
     */
    const names = await toNames(maps, position.coords.latitude, position.coords.longitude);
    return matchRegion(names);
  } catch {
    return { kind: "failed", reason: "지역 이름을 찾지 못했습니다. 직접 골라 주세요." };
  }
}

/**
 * 왜 못 받았는지 한 줄로. **좌표도, 원문 오류도 담지 않는다.**
 * 원문에는 기기 정보가 섞여 들어올 수 있고, 그걸 화면에 그리면 그대로 남는다.
 */
function describeGeoError(e: unknown): string {
  const code = (e as GeolocationPositionError | undefined)?.code;
  if (code === 1) return "위치 권한이 꺼져 있습니다. 직접 골라 주세요.";
  if (code === 2) return "지금은 위치를 알 수 없습니다. 직접 골라 주세요.";
  if (code === 3) return "위치를 찾는 데 너무 오래 걸립니다. 직접 골라 주세요.";
  return "위치를 쓸 수 없는 기기입니다. 직접 골라 주세요.";
}
