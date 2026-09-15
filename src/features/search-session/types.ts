/**
 * Search Session.
 *
 * Release Blocker 5번 — "건강정보가 URL/Analytics에 그대로 노출" — 때문에
 * 이 객체는 절대 query string 이나 path 로 이동하지 않는다.
 * 1단계에서는 sessionStorage, 2단계 이후에는 care_sessions 테이블에 저장한다.
 * user profile 에 영구 저장하지 않는다.
 */

export type Sex = "male" | "female" | "undisclosed";

/**
 * AI(또는 규칙 파서)가 만들어낼 수 있는 유일한 출력 형태.
 *
 * 이 타입에는 판단·추천·권고를 담을 필드가 없다.
 * "응급실에 가세요" 같은 문자열이 들어갈 자리를 타입 단계에서 없앤 것이며,
 * 프롬프트가 아니라 스키마로 Release Blocker 7번을 막는다.
 */
export interface ExtractedFacts {
  ageYears: number | null;
  sex: Sex | null;
  bodyPartId: string | null;
  situationId: string | null;
  hemostasis: "stopped" | "bleeding" | null;
  basicTreatment: "done" | "none" | null;
  priorGuidance: "next_day_opd" | "referred" | "none" | null;
}

export interface SearchSession {
  id: string;
  facts: ExtractedFacts;
  rawInput: string | null;
  createdAt: string;
  /** 추출하지 못해 사용자에게 되물어야 하는 항목. 한 번에 하나씩만 꺼내 쓴다. (기획안 7항) */
  missing: MissingField[];
}

export type MissingField =
  | "ageYears"
  | "bodyPartId"
  | "hemostasis"
  | "basicTreatment"
  | "priorGuidance";

export interface FollowUpQuestion {
  field: MissingField;
  question: string;
  options: { label: string; apply: Partial<ExtractedFacts> }[];
}

export const BODY_PARTS = [
  { id: "forehead", label: "이마", group: "facial" },
  { id: "eyebrow", label: "눈썹", group: "facial" },
  { id: "lip", label: "입술", group: "facial" },
  { id: "nose", label: "코", group: "facial" },
  { id: "ear", label: "귀", group: "facial" },
  { id: "scalp", label: "두피", group: "facial" },
  { id: "chin", label: "턱", group: "facial" },
  { id: "hand", label: "손", group: "hand" },
  { id: "finger", label: "손가락", group: "hand" },
  { id: "nail", label: "손톱", group: "hand" },
  { id: "other", label: "기타", group: "other" },
] as const;

export const SITUATIONS = [
  { id: "laceration", label: "열상(찢어짐)" },
  { id: "burn", label: "화상" },
  { id: "abrasion", label: "찰과상" },
  { id: "skin_loss", label: "피부결손" },
  { id: "bite", label: "교상(물림)" },
  { id: "foreign_body", label: "이물" },
  { id: "deep_laceration", label: "깊은 열상" },
  { id: "other", label: "기타 외상" },
] as const;

/** 홈 화면의 빠른 선택 6개. (기획안 6항) */
export const QUICK_PICKS = [
  { id: "facial", label: "얼굴·이마", bodyPartId: "forehead" },
  { id: "hand", label: "손·손가락", bodyPartId: "finger" },
  { id: "burn", label: "화상", bodyPartId: "other", situationId: "burn" },
  { id: "lip", label: "입술·코·귀", bodyPartId: "lip" },
  { id: "head", label: "머리", bodyPartId: "scalp" },
  { id: "other", label: "기타", bodyPartId: "other" },
] as const;

export function labelForBodyPart(id: string | null): string | null {
  return BODY_PARTS.find((p) => p.id === id)?.label ?? null;
}

export function labelForSituation(id: string | null): string | null {
  return SITUATIONS.find((s) => s.id === id)?.label ?? null;
}
