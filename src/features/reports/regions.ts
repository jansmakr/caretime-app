import type { HospitalView } from "@/features/hospitals/types";

/**
 * 지역(시/도 · 시/군/구) 선택.
 *
 * 시/도는 행정구역이라 고정 목록을 둔다. 시/군/구는 고정하지 않고
 * 실제 목록에 있는 의료기관 주소에서 뽑는다 — 없는 구를 골라 놓고
 * "검색 결과 0건"을 보게 만들지 않으려는 것이다.
 * 목록에 없는 병원은 시/군/구까지 수기 입력으로 받는다.
 */

/** 표기는 짧은 이름으로 통일한다. 주소 문자열이 어떤 형태로 와도 이 값으로 정규화한다. */
export const SIDO_LIST = [
  "서울",
  "부산",
  "대구",
  "인천",
  "광주",
  "대전",
  "울산",
  "세종",
  "경기",
  "강원",
  "충북",
  "충남",
  "전북",
  "전남",
  "경북",
  "경남",
  "제주",
] as const;

export type Sido = (typeof SIDO_LIST)[number];

/** 주소에 실제로 쓰이는 표기들. 긴 이름이 먼저 걸리도록 순서를 유지한다. */
const SIDO_ALIASES: { sido: Sido; aliases: string[] }[] = [
  { sido: "서울", aliases: ["서울특별시", "서울시", "서울"] },
  { sido: "부산", aliases: ["부산광역시", "부산시", "부산"] },
  { sido: "대구", aliases: ["대구광역시", "대구시", "대구"] },
  { sido: "인천", aliases: ["인천광역시", "인천시", "인천"] },
  { sido: "광주", aliases: ["광주광역시", "광주시", "광주"] },
  { sido: "대전", aliases: ["대전광역시", "대전시", "대전"] },
  { sido: "울산", aliases: ["울산광역시", "울산시", "울산"] },
  { sido: "세종", aliases: ["세종특별자치시", "세종시", "세종"] },
  { sido: "경기", aliases: ["경기도", "경기"] },
  { sido: "강원", aliases: ["강원특별자치도", "강원도", "강원"] },
  { sido: "충북", aliases: ["충청북도", "충북"] },
  { sido: "충남", aliases: ["충청남도", "충남"] },
  { sido: "전북", aliases: ["전북특별자치도", "전라북도", "전북"] },
  { sido: "전남", aliases: ["전라남도", "전남"] },
  { sido: "경북", aliases: ["경상북도", "경북"] },
  { sido: "경남", aliases: ["경상남도", "경남"] },
  { sido: "제주", aliases: ["제주특별자치도", "제주도", "제주"] },
];

export interface Region {
  sido: Sido | null;
  sigungu: string | null;
}

/**
 * 주소 문자열 → 지역. 못 읽으면 추측하지 않고 null 을 남긴다.
 * "수원시 팔달구" 처럼 시 아래 구가 있으면 둘을 묶어서 하나로 본다.
 */
export function parseRegion(address: string): Region {
  const tokens = address.trim().split(/\s+/);
  if (tokens.length === 0) return { sido: null, sigungu: null };

  const matched = SIDO_ALIASES.find((entry) => entry.aliases.includes(tokens[0]));
  if (!matched) return { sido: null, sigungu: null };

  const rest = tokens.slice(1);
  const firstIndex = rest.findIndex((t) => /(시|군|구)$/.test(t));
  if (firstIndex === -1) return { sido: matched.sido, sigungu: null };

  let sigungu = rest[firstIndex];
  const next = rest[firstIndex + 1];
  if (sigungu.endsWith("시") && next && next.endsWith("구")) sigungu = `${sigungu} ${next}`;
  return { sido: matched.sido, sigungu };
}

/** 목록에 있는 의료기관에서 실제로 쓰이는 시/도만 추린다. */
export function sidoOptions(hospitals: HospitalView[]): Sido[] {
  const found = new Set<Sido>();
  for (const h of hospitals) {
    const { sido } = parseRegion(h.publicData.address);
    if (sido) found.add(sido);
  }
  return SIDO_LIST.filter((s) => found.has(s));
}

export function sigunguOptions(hospitals: HospitalView[], sido: Sido | null): string[] {
  const found = new Set<string>();
  for (const h of hospitals) {
    const region = parseRegion(h.publicData.address);
    if (!region.sigungu) continue;
    if (sido && region.sido !== sido) continue;
    found.add(region.sigungu);
  }
  return [...found].sort((a, b) => a.localeCompare(b, "ko"));
}
