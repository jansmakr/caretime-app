import { SIDO_LIST, type Sido } from "@/features/reports/regions";
import { isKnownRegion } from "@/features/regions/sigungu";
import { EMPTY_FILTER, type ChatFilter } from "./types";

/**
 * URL 로 들어온 현장톡 조건을 허용값만 통과시킨다.
 *
 * 규칙:
 *  - 허용목록에 없는 값은 **안전하게 무시**한다. 오류 화면을 띄우지 않는다.
 *    잘못된 링크를 타고 온 사람에게 보여줄 것은 에러가 아니라 전국 목록이다.
 *  - 정확한 위치·나이·개인 건강 조건은 받지 않는다. 받을 키 자체를 두지 않는다.
 *    (README 3항 — 건강정보가 URL 에 실리지 않는다)
 *
 * 왜 URL 에 지역을 남겨 두는가: "강서구 글 보기"를 링크로 보낼 수 있어야 한다.
 * 내 지역은 브라우저에 기억하지만(features/regions/myRegion), 공유한 링크는 받는
 * 사람의 기억값과 무관하게 같은 화면을 열어야 한다.
 *
 * 병원 조건과 카테고리는 **받지 않는다.** 1차에 병원을 고르는 자리가 없고, 글 종류는
 * 기간이 나눠 준다. 받는 키를 남겨 두면 "어딘가 쓰이고 있나?"를 찾아야 한다.
 */

/** URL 에서 읽는 키. 이 셋 외에는 무엇도 조건으로 쓰지 않는다. */
export const CHAT_FILTER_PARAMS = ["sido", "sigungu", "all"] as const;

/** 시/군/구는 자유 문자열이라 길이·문자 범위를 먼저 막고, 그다음 목록과 맞춘다. */
const SIGUNGU_PATTERN = /^[가-힣A-Za-z0-9 ]{1,20}$/;

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | null {
  if (value === undefined) return null;
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

export function parseSido(value: string | string[] | undefined): Sido | null {
  const raw = first(value);
  if (raw === null) return null;
  return (SIDO_LIST as readonly string[]).includes(raw) ? (raw as Sido) : null;
}

export function parseSigungu(value: string | string[] | undefined): string | null {
  const raw = first(value);
  if (raw === null) return null;
  return SIGUNGU_PATTERN.test(raw) ? raw : null;
}

/**
 * 현장톡 초기 필터.
 *
 * 시/도가 없으면 시/군/구도 버린다 — 시/도 없는 구는 어느 지역인지 정할 수 없다.
 * 그다음 **목록에 있는 지역인지** 본다. 없는 구로 좁히면 영원히 0건인 화면이 열린다.
 *
 * `all=1` 이면 전체 기간이다. 없으면 최근 1개월(기본).
 */
export function chatFilterFromParams(params: RawParams): ChatFilter {
  const sido = parseSido(params.sido);
  const sigungu = sido === null ? null : parseSigungu(params.sigungu);
  const region = sido === null ? null : { sido, sigungu };

  const known = region !== null && isKnownRegion(region);
  const recentOnly = first(params.all) !== "1";

  if (!known) return { ...EMPTY_FILTER, recentOnly };
  return { sido, sigungu, recentOnly };
}

export function isEmptyFilter(filter: ChatFilter): boolean {
  return filter.sido === null && filter.sigungu === null;
}

/**
 * 조건이 실제로 있을 때만 쿼리를 붙인다.
 * 임의 기본 지역을 만들어 넣지 않는다 — 없으면 /chat 으로만 보낸다.
 */
export function chatHref(input: {
  sido?: string | null;
  sigungu?: string | null;
  allTime?: boolean;
}): string {
  const query = new URLSearchParams();
  const sido = parseSido(input.sido ?? undefined);
  if (sido) {
    query.set("sido", sido);
    const sigungu = parseSigungu(input.sigungu ?? undefined);
    if (sigungu) query.set("sigungu", sigungu);
  }
  if (input.allTime === true) query.set("all", "1");

  const qs = query.toString();
  return qs === "" ? "/chat" : `/chat?${qs}`;
}

export { EMPTY_FILTER };
