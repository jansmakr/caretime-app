import { SIDO_LIST, type Sido } from "@/features/reports/regions";
import { EMPTY_FILTER, type ChatFilter } from "./types";

/**
 * URL 로 들어온 현장톡 조건을 허용값만 통과시킨다.
 *
 * 규칙:
 *  - 허용목록에 없는 값은 **안전하게 무시**한다. 오류 화면을 띄우지 않는다.
 *    잘못된 링크를 타고 온 사람에게 보여줄 것은 에러가 아니라 전체 목록이다.
 *  - 정확한 위치·나이·개인 건강 조건은 받지 않는다. 받을 키 자체를 두지 않는다.
 *    (README 3항 — 건강정보가 URL 에 실리지 않는다)
 *  - 병원 id 는 형식만 검사한다. 존재 여부는 목록을 읽는 화면이 판정한다.
 */

/** URL 에서 읽는 키. 이 셋 외에는 무엇도 조건으로 쓰지 않는다. */
export const CHAT_FILTER_PARAMS = ["sido", "sigungu", "hospital"] as const;

/** 진료 항목. 현장톡 카테고리와 같은 3분할이다. */
export const ALLOWED_CATEGORIES = ["laceration", "burn", "other"] as const;
export type AllowedCategory = (typeof ALLOWED_CATEGORIES)[number];

/** 시/군/구는 자유 문자열이라 길이·문자 범위만 막는다. 한글·영문·숫자·공백만 받는다. */
const SIGUNGU_PATTERN = /^[가-힣A-Za-z0-9 ]{1,20}$/;
/** 병원 id 는 현재 text('h_001') 형식이다. UUID 로 바뀌어도 통과하도록 넉넉히 둔다. */
const HOSPITAL_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

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

export function parseCategory(value: string | string[] | undefined): AllowedCategory | null {
  const raw = first(value);
  if (raw === null) return null;
  return (ALLOWED_CATEGORIES as readonly string[]).includes(raw) ? (raw as AllowedCategory) : null;
}

export function parseHospitalId(value: string | string[] | undefined): string | null {
  const raw = first(value);
  if (raw === null) return null;
  return HOSPITAL_ID_PATTERN.test(raw) ? raw : null;
}

/**
 * 현장톡 초기 필터.
 * 시/도가 없으면 시/군/구도 버린다 — 시/도 없는 구는 어느 지역인지 정할 수 없다.
 */
export function chatFilterFromParams(params: RawParams): ChatFilter {
  const sido = parseSido(params.sido);
  return {
    sido,
    sigungu: sido === null ? null : parseSigungu(params.sigungu),
    hospitalId: parseHospitalId(params.hospital),
  };
}

export function isEmptyFilter(filter: ChatFilter): boolean {
  return filter.sido === null && filter.sigungu === null && filter.hospitalId === null;
}

/**
 * 조건이 실제로 있을 때만 쿼리를 붙인다.
 * 임의 기본 지역을 만들어 넣지 않는다 — 없으면 /chat 으로만 보낸다.
 */
export function chatHref(input: {
  sido?: string | null;
  sigungu?: string | null;
  hospitalId?: string | null;
  category?: string | null;
}): string {
  const query = new URLSearchParams();
  const sido = parseSido(input.sido ?? undefined);
  if (sido) {
    query.set("sido", sido);
    const sigungu = parseSigungu(input.sigungu ?? undefined);
    if (sigungu) query.set("sigungu", sigungu);
  }
  const hospitalId = parseHospitalId(input.hospitalId ?? undefined);
  if (hospitalId) query.set("hospital", hospitalId);
  const category = parseCategory(input.category ?? undefined);
  if (category) query.set("category", category);

  const qs = query.toString();
  return qs === "" ? "/chat" : `/chat?${qs}`;
}

export { EMPTY_FILTER };
