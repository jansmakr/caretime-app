import type { HospitalCapability, HospitalView } from "@/features/hospitals/types";
import { capabilityLabel } from "@/features/hospitals/service";
import { distanceKm } from "@/features/hospitals/location";
import { parseRegion } from "@/features/reports/regions";
import {
  categoryLabelOf,
  followupGoalLabelOf,
  type CareCategory,
  type DiscoveryConditions,
  type Origin,
} from "./types";

/**
 * 선택 조건과 병원 정보를 맞춰 본다.
 *
 * 이 파일이 지키는 것 — "모르는 것을 안다고 하지 않는다":
 *  - 정보가 없으면 `unknown`("전화 확인 필요")이다. 불가도, 가능도 아니다.
 *  - 명시적으로 조건이 어긋나는 것만 `mismatch` 다.
 *  - `mismatch` 병원을 숨기지는 않는다. 다만 관련 결과처럼 위로 올리지 않는다.
 *
 * 기존 `service.isAgeBlocked()` 는 ageMin·ageMax 가 둘 다 null 이면 "차단 아님"을 돌려준다.
 * 그건 조건을 확인한 것이 아니라 모르는 것이므로, 여기서는 그 경로를 쓰지 않고
 * 3값(confirmed / unknown / mismatch)으로 따로 판정한다.
 */

/** 카테고리 → 표준 진료기능. 진료과목만으로 가능 여부를 추정하지 않는다(등록된 기능만 본다). */
const CATEGORY_CAPABILITIES: Record<CareCategory, string[]> = {
  laceration: ["cap_facial_laceration", "cap_scalp_laceration", "cap_hand_trauma", "cap_nail_injury"],
  burn: ["cap_burn"],
  other: ["cap_bite", "cap_foreign_body"],
};

export type ConditionState = "confirmed" | "unknown" | "mismatch";

export interface ConditionView {
  label: string;
  state: ConditionState;
  /** 사용자에게 보여줄 한 줄. unknown 이면 '전화 확인 필요'로 끝난다. */
  detail: string;
}

export interface DiscoveryMatch {
  hospital: HospitalView;
  /** 선택한 카테고리와 연결된, 병원이 등록한 진료기능. */
  relatedCapabilities: HospitalCapability[];
  conditions: ConditionView[];
  hasRelated: boolean;
  hasMismatch: boolean;
  /**
   * 실제 위치 기준 직선거리(km). 다음 조건이 모두 맞을 때만 값이 있다.
   *  - 사용자가 [내 주변]을 눌러 허용한 좌표가 있다 (origin.kind === "device")
   *  - 병원에 유효한 좌표가 있다
   * 수동 지역 선택으로는 계산하지 않는다.
   */
  straightLineKm: number | null;
}

function hasValidCoords(h: HospitalView): boolean {
  const { lat, lng } = h.publicData;
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
}

export function straightLineKmFor(hospital: HospitalView, origin: Origin): number | null {
  if (origin.kind !== "device" || origin.coords === null) return null;
  const { lat, lng } = hospital.publicData;
  if (lat === null || lng === null || !hasValidCoords(hospital)) return null;
  return distanceKm(origin.coords, { lat, lng });
}

/** "직선거리 약 1.2km". 이동 시간은 쓰지 않는다. */
export function straightLineLabel(km: number): string {
  return `직선거리 약 ${km < 10 ? km.toFixed(1) : Math.round(km)}km`;
}

function relatedFor(hospital: HospitalView, category: CareCategory | null): HospitalCapability[] {
  if (category === null) return [];
  const wanted = CATEGORY_CAPABILITIES[category];
  return hospital.capabilities.filter((c) => c.capabilityId !== null && wanted.includes(c.capabilityId));
}

/**
 * 소아 연령 판정.
 *
 * confirmed 는 **양쪽 경계가 모두 등록되어 있고** 나이가 그 안에 들 때만 준다.
 * 한쪽만 등록된 범위는 연령 정책을 밝힌 것이 아니라 절반만 밝힌 것이다 —
 * 예를 들어 "만 15세 이하"만 등록한 화상 기능에 만 1세를 넣으면 상한은 지키지만
 * 영아를 받는지는 어디에도 없다. 그걸 '확인됨'으로 적으면 없는 정보를 만들어 낸다.
 * 세부 진료 정보가 없으면 전화 확인 필요다.
 *
 * 배제(mismatch)는 한쪽 경계만으로도 판정할 수 있다. "만 3세 이상"에 만 1세는
 * 분명히 벗어난다. 확인은 어렵고 배제는 쉽다 — 비대칭이 맞다.
 */
function ageState(caps: HospitalCapability[], age: number | null): ConditionState {
  if (age === null || caps.length === 0) return "unknown";
  let sawExplicit = false;
  let allExcluded = true;
  let confirmed = false;

  for (const cap of caps) {
    const hasAnyBound = cap.ageMin !== null || cap.ageMax !== null;
    if (!hasAnyBound) {
      allExcluded = false; // 모르는 것은 배제가 아니다
      continue;
    }
    sawExplicit = true;
    const belowMin = cap.ageMin !== null && age < cap.ageMin;
    const aboveMax = cap.ageMax !== null && age > cap.ageMax;
    if (belowMin || aboveMax) continue; // 이 기능은 배제

    allExcluded = false;
    // 양쪽이 다 등록되어 있을 때만 확인으로 본다.
    if (cap.ageMin !== null && cap.ageMax !== null) confirmed = true;
  }

  if (confirmed) return "confirmed";
  if (sawExplicit && allExcluded) return "mismatch";
  return "unknown";
}

function buildConditions(
  hospital: HospitalView,
  conditions: DiscoveryConditions,
  related: HospitalCapability[],
): ConditionView[] {
  const views: ConditionView[] = [];

  // ① 진료 항목
  const categoryLabel = categoryLabelOf(conditions.category);
  if (categoryLabel) {
    views.push(
      related.length > 0
        ? {
            label: categoryLabel,
            state: "confirmed",
            detail: `${categoryLabel} 관련 진료 정보 있음 · ${related.map(capabilityLabel).join(", ")}`,
          }
        : {
            label: categoryLabel,
            state: "unknown",
            detail: `${categoryLabel} 관련 등록 정보 없음 · 전화 확인 필요`,
          },
    );
  }

  // ② 소아 연령 — 미확인을 가능·불가로 단정하지 않는다
  if (conditions.isChild) {
    const state = ageState(related, conditions.childAgeYears);
    const ageText = conditions.childAgeYears !== null ? `만 ${conditions.childAgeYears}세` : "소아";
    views.push({
      label: "소아 연령",
      state,
      detail:
        state === "confirmed"
          ? `소아 ${ageText} 조건 확인됨`
          : state === "mismatch"
            ? `등록된 연령 조건과 맞지 않음 (${ageText}) · 전화 확인 필요`
            : `소아 ${ageText} 연령 조건 미확인 · 전화 확인 필요`,
    });
  }

  // ③ 치료 후 방문 목적 — 이 정보를 가진 병원 데이터가 아직 없다. 항상 미확인이다.
  if (conditions.visitPurpose === "followup") {
    const goalLabel = followupGoalLabelOf(conditions.followupGoal);
    views.push({
      label: "치료 후 방문",
      state: "unknown",
      detail: `치료 후 방문${goalLabel ? ` · ${goalLabel}` : ""}: 전화 확인 필요`,
    });
  }

  return views;
}

/**
 * 지역 필터.
 * 시/도만 고르면 그 시/도 전체, 시/군/구까지 고르면 그 구만.
 * 주소를 읽을 수 없는 병원은 지역을 고른 상태에서는 제외한다 —
 * 어느 지역인지 모르는 병원을 고른 지역의 결과로 보여줄 수 없다.
 */
export function inRegion(hospital: HospitalView, region: DiscoveryConditions["region"]): boolean {
  if (region.sido === null) return true;
  const parsed = parseRegion(hospital.publicData.address);
  if (parsed.sido !== region.sido) return false;
  if (region.sigungu === null) return true;
  return parsed.sigungu === region.sigungu;
}

/**
 * 결과 조립.
 *
 * 조건을 하나도 고르지 않아도 전체 목록을 돌려준다. 결과를 막지 않는다.
 * 정렬: 관련 정보 있음 → 불일치 아님 → (실제 위치가 있으면) 직선거리 → 이름 → id.
 * 제보 수·구독 등급은 인자에 없다. 정렬이 그 값에 접근할 경로를 만들지 않는다.
 */
export function matchHospitals(
  hospitals: HospitalView[],
  conditions: DiscoveryConditions,
  origin: Origin,
): DiscoveryMatch[] {
  return hospitals
    .filter((h) => inRegion(h, conditions.region))
    .map((hospital) => {
      const related = relatedFor(hospital, conditions.category);
      const views = buildConditions(hospital, conditions, related);
      return {
        hospital,
        relatedCapabilities: related,
        conditions: views,
        hasRelated: related.length > 0,
        hasMismatch: views.some((v) => v.state === "mismatch"),
        straightLineKm: straightLineKmFor(hospital, origin),
      };
    })
    .sort((a, b) => {
      if (a.hasMismatch !== b.hasMismatch) return a.hasMismatch ? 1 : -1;
      if (a.hasRelated !== b.hasRelated) return a.hasRelated ? -1 : 1;
      if (a.straightLineKm !== null && b.straightLineKm !== null && a.straightLineKm !== b.straightLineKm) {
        return a.straightLineKm - b.straightLineKm;
      }
      const byName = a.hospital.publicData.name.localeCompare(b.hospital.publicData.name, "ko");
      return byName !== 0 ? byName : a.hospital.id.localeCompare(b.hospital.id);
    });
}
