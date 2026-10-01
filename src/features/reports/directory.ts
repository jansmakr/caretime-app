import type { HospitalView } from "@/features/hospitals/types";
import { parseRegion, type Sido } from "./regions";

/**
 * 제보 대상 병원 자동완성.
 *
 * 목록은 features/hospitals 가 읽어 온 그대로다(Mock 이면 Mock, Supabase 면 Supabase).
 * 여기서 별도 병원 목록을 들고 있지 않다 — 두 곳에 두면 언젠가 서로 달라진다.
 */

export interface DirectoryEntry {
  id: string;
  name: string;
  address: string;
  sido: Sido | null;
  sigungu: string | null;
}

export const DIRECTORY_SUGGESTION_LIMIT = 6;

export function toDirectory(hospitals: HospitalView[]): DirectoryEntry[] {
  return hospitals.map((h) => {
    const region = parseRegion(h.publicData.address);
    return {
      id: h.id,
      name: h.publicData.name,
      address: h.publicData.address,
      sido: region.sido,
      sigungu: region.sigungu,
    };
  });
}

/** 공백·대소문자 차이로 같은 병원을 다르게 세지 않도록 비교용 키를 만든다. */
export function normalizeName(name: string): string {
  return name.replace(/\s+/g, "").toLowerCase();
}

/**
 * 지역으로 먼저 좁히고, 이름은 부분일치로 찾는다.
 * 질의가 비어 있어도 지역이 골라져 있으면 그 지역 병원을 보여준다(둘러보기).
 */
export function searchDirectory(
  directory: DirectoryEntry[],
  filter: { sido: Sido | null; sigungu: string | null; query: string },
): DirectoryEntry[] {
  const q = normalizeName(filter.query);
  return directory
    .filter((e) => (filter.sido ? e.sido === filter.sido : true))
    .filter((e) => (filter.sigungu ? e.sigungu === filter.sigungu : true))
    .filter((e) => (q === "" ? true : normalizeName(e.name).includes(q)))
    .slice(0, DIRECTORY_SUGGESTION_LIMIT);
}
