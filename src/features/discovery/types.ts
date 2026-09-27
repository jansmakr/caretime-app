import type { Sido } from "@/features/reports/regions";

/**
 * 탐색 조건 — "이번 검색"의 조건이다.
 *
 * 계정의 고정 정보가 아니다. 그래서 나이·방문 목적·자유입력은 저장소에 자동 저장하지 않고
 * 화면 메모리에서만 다룬다. 지역만 예외로 sessionStorage 에 둔다 —
 * 지역은 URL 로도 나가는 일반 정보이고, 새로고침 때마다 다시 고르게 하면 쓰기 어려워진다.
 *
 * 좌표는 어디에도 저장하지 않는다. URL·sessionStorage·localStorage·분석 로그 전부 금지.
 * 검색 중에만 메모리에 들고 있고, 초기화·수동 지역 전환 때 버린다.
 */

export type CareCategory = "laceration" | "burn" | "other";

export const CARE_CATEGORIES: { value: CareCategory; label: string }[] = [
  { value: "laceration", label: "열상·봉합" },
  { value: "burn", label: "화상" },
  { value: "other", label: "기타" },
];

/** null = 미정. '초진/재진' 대신 사용자 관점의 말을 쓴다. */
export type VisitPurpose = "first" | "followup";

export const VISIT_PURPOSES: { value: VisitPurpose; label: string }[] = [
  { value: "first", label: "처음 진료" },
  { value: "followup", label: "치료 후 방문" },
];

export type FollowupGoal = "dressing" | "suture_removal" | "progress" | "unsure";

export const FOLLOWUP_GOALS: { value: FollowupGoal; label: string }[] = [
  { value: "dressing", label: "소독·드레싱" },
  { value: "suture_removal", label: "실밥 제거 문의" },
  { value: "progress", label: "경과 확인" },
  { value: "unsure", label: "기타·잘 모르겠어요" },
];

export interface RegionSelection {
  sido: Sido | null;
  sigungu: string | null;
}

/**
 * 거리 계산의 출발점.
 *
 * - none   : 아직 없음. 거리를 표시하지 않는다.
 * - device : 사용자가 [내 주변]을 눌러 허용한 실제 위치. 이때만 거리를 보여준다.
 * - region : 수동으로 고른 지역. **거리를 계산하지 않는다** —
 *            지역 중심점과의 거리를 현재 위치에서의 거리처럼 보여주면 안 된다.
 */
export type OriginKind = "none" | "device" | "region";

export interface Origin {
  kind: OriginKind;
  /** device 일 때만 값이 있다. 저장하지 않는다. */
  coords: { lat: number; lng: number } | null;
}

export const NO_ORIGIN: Origin = { kind: "none", coords: null };

export interface DiscoveryConditions {
  region: RegionSelection;
  category: CareCategory | null;
  visitPurpose: VisitPurpose | null;
  followupGoal: FollowupGoal | null;
  /** 소아 여부를 명시적으로 고른 경우에만 true. */
  isChild: boolean;
  /** 만 나이. 소아를 골라도 나이는 선택 입력이다. */
  childAgeYears: number | null;
}

export const EMPTY_CONDITIONS: DiscoveryConditions = {
  region: { sido: null, sigungu: null },
  category: null,
  visitPurpose: null,
  followupGoal: null,
  isChild: false,
  childAgeYears: null,
};

export function categoryLabelOf(category: CareCategory | null): string | null {
  return CARE_CATEGORIES.find((c) => c.value === category)?.label ?? null;
}

export function visitPurposeLabelOf(purpose: VisitPurpose | null): string | null {
  return VISIT_PURPOSES.find((p) => p.value === purpose)?.label ?? null;
}

export function followupGoalLabelOf(goal: FollowupGoal | null): string | null {
  return FOLLOWUP_GOALS.find((g) => g.value === goal)?.label ?? null;
}

/** 조건이 하나라도 골라졌는가. 안 골라도 결과는 보여준다. */
export function hasAnyCondition(c: DiscoveryConditions): boolean {
  return (
    c.region.sido !== null ||
    c.category !== null ||
    c.visitPurpose !== null ||
    c.followupGoal !== null ||
    c.isChild
  );
}

/** 화면 상단에 보여줄 조건 요약 칩. 나이는 사용자가 직접 넣었을 때만 포함한다. */
export function conditionChips(c: DiscoveryConditions): string[] {
  const chips: string[] = [];
  const region = c.region.sigungu ?? c.region.sido;
  if (region) chips.push(region);
  const category = categoryLabelOf(c.category);
  if (category) chips.push(category);
  const purpose = visitPurposeLabelOf(c.visitPurpose);
  if (purpose) chips.push(purpose);
  const goal = followupGoalLabelOf(c.followupGoal);
  if (goal) chips.push(goal);
  if (c.isChild) chips.push(c.childAgeYears !== null ? `소아 만 ${c.childAgeYears}세` : "소아");
  return chips;
}
