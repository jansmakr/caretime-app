import type { ExtractedFacts } from "@/features/search-session/types";
import { isExpired } from "@/lib/freshness";
import { CAPABILITIES, MOCK_HOSPITALS } from "./mock";
import type { HospitalCapability, HospitalView } from "./types";

/**
 * 검색 정렬 규칙.
 *
 * 정렬축은 '거리' 하나뿐이다. 다른 축을 넣는 순간
 * "CareTime 이 어떤 병원을 위로 올렸다" 가 되고, 그건 추천이 된다. (기획안 3항)
 * 결제·제휴 데이터는 이 모듈이 import 조차 하지 않는다. (Release Blocker 8)
 *
 * 이 파일에서 금지되는 import:
 *   - 과금/정산/제휴 관련 모든 모듈
 * 위반 여부는 8단계에서 CI lint 룰로 자동 검사한다. → README 참고
 */

export interface MatchedHospital {
  hospital: HospitalView;
  /** 사용자의 상황과 연결되는 병원 진료기능. 없으면 빈 배열. */
  matchedCapabilities: HospitalCapability[];
  /** 연령조건에 걸리는지. 걸려도 숨기지 않고 조건을 그대로 보여준다. */
  ageBlocked: boolean;
}

/** 부위 → 표준 Capability 매핑. 2단계에서 DB 테이블로 옮긴다. */
const BODY_PART_TO_CAPABILITY: Record<string, string[]> = {
  forehead: ["cap_facial_laceration"],
  eyebrow: ["cap_facial_laceration"],
  lip: ["cap_facial_laceration"],
  nose: ["cap_facial_laceration"],
  ear: ["cap_facial_laceration"],
  chin: ["cap_facial_laceration"],
  scalp: ["cap_scalp_laceration", "cap_facial_laceration"],
  hand: ["cap_hand_trauma"],
  finger: ["cap_hand_trauma", "cap_nail_injury"],
  nail: ["cap_nail_injury", "cap_hand_trauma"],
  other: [],
};

const SITUATION_TO_CAPABILITY: Record<string, string[]> = {
  burn: ["cap_burn"],
  bite: ["cap_bite"],
  foreign_body: ["cap_foreign_body"],
};

export function relevantCapabilityIds(facts: ExtractedFacts): string[] {
  const ids = new Set<string>();
  if (facts.bodyPartId) {
    for (const id of BODY_PART_TO_CAPABILITY[facts.bodyPartId] ?? []) ids.add(id);
  }
  if (facts.situationId) {
    for (const id of SITUATION_TO_CAPABILITY[facts.situationId] ?? []) ids.add(id);
  }
  return [...ids];
}

function isAgeBlocked(caps: HospitalCapability[], ageYears: number | null): boolean {
  if (ageYears === null || caps.length === 0) return false;
  return caps.every((c) => {
    const belowMin = c.ageMin !== null && ageYears < c.ageMin;
    const aboveMax = c.ageMax !== null && ageYears > c.ageMax;
    return belowMin || aboveMax;
  });
}

/** hospitals 는 Supabase 연결 시 repository 가 읽은 목록, 아니면 Mock 이다. */
export function searchHospitals(
  facts: ExtractedFacts,
  hospitals: HospitalView[] = MOCK_HOSPITALS,
): MatchedHospital[] {
  const wanted = relevantCapabilityIds(facts);

  return hospitals.map((hospital) => {
    const matched = hospital.capabilities.filter(
      (c) => c.capabilityId !== null && wanted.includes(c.capabilityId),
    );
    return {
      hospital,
      matchedCapabilities: matched,
      ageBlocked: isAgeBlocked(matched, facts.ageYears),
    };
  })
    .filter((m) => wanted.length === 0 || m.matchedCapabilities.length > 0)
    .sort((a, b) => a.hospital.distanceKm - b.hospital.distanceKm);
}

export function getHospital(id: string): HospitalView | null {
  return MOCK_HOSPITALS.find((h) => h.id === id) ?? null;
}

export function capabilityLabel(cap: HospitalCapability): string {
  if (cap.capabilityId) {
    return CAPABILITIES.find((c) => c.id === cap.capabilityId)?.label ?? cap.capabilityId;
  }
  return cap.customLabel ?? "직접 입력 항목";
}

export function ageConditionLabel(cap: HospitalCapability): string | null {
  if (cap.ageNote) return cap.ageNote;
  if (cap.ageMin !== null && cap.ageMax !== null) return `만 ${cap.ageMin}~${cap.ageMax}세`;
  if (cap.ageMin !== null) return `만 ${cap.ageMin}세 이상`;
  if (cap.ageMax !== null) return `만 ${cap.ageMax}세 이하`;
  return "연령제한 없음";
}

/**
 * 사용자에게 보여줄 내원예정 표현.
 *
 * 소수 인원일 때 숫자를 그대로 노출하면 그 방의 보호자끼리 서로를 특정할 수 있다.
 * 임계값 미만은 아예 표시하지 않고, 그 이상일 때만 정성 표현으로 바꾼다. (기획안 27항)
 * 병원 화면(/partner)에서는 정확한 숫자를 그대로 보여준다.
 */
export const INCOMING_DISPLAY_THRESHOLD = 5;

export function describeIncomingForUser(within30: number | null): string | null {
  if (within30 === null || within30 < INCOMING_DISPLAY_THRESHOLD) return null;
  return "내원 예정자가 증가하고 있습니다";
}

/** 현재 대기와 내원예정을 합산해 하나의 숫자로 만들지 않는다. (기획안 26항) */
export function describeWaitingForUser(hospital: HospitalView, now: Date = new Date()): string | null {
  const w = hospital.waiting;
  if (!w || (hospital.liveStatus && isExpired(hospital.liveStatus, now))) return null;
  if (w.headcount !== null) return `현재 대기 ${w.headcount}명`;
  switch (w.level) {
    case "light":
      return "현재 여유";
    case "normal":
      return "현재 보통";
    case "crowded":
      return "현재 혼잡";
    case "very_crowded":
      return "현재 매우 혼잡";
    case "check_needed":
      return "신규환자 확인 필요";
  }
}
