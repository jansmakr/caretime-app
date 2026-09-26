import {
  APPLY_CONTACT_NAME_MAX,
  APPLY_CONTACT_POINT_MAX,
  APPLY_NAME_MAX,
  APPLY_SIGUNGU_MAX,
  APPLY_SPECIALTY_MAX,
  type PartnerApplicationDraft,
} from "./types";

/**
 * 입점 신청 규칙. 순수 함수만 둔다 — 서버 액션으로 그대로 옮길 자리다.
 *
 * 검증은 "연락이 닿는가"까지만 본다. 형식을 촘촘하게 막으면
 * 실제로 연락 가능한 표기(내선, 담당 시간 메모 등)를 거절하게 된다.
 */

export type ApplyField = keyof PartnerApplicationDraft;

/** 비어 있으면 안 되는 항목과 화면에 쓸 이름. 순서가 폼의 순서다. */
export const REQUIRED_FIELDS: { field: ApplyField; label: string }[] = [
  { field: "hospitalName", label: "의료기관명" },
  { field: "sido", label: "지역(시/도)" },
  { field: "contactName", label: "담당자명" },
  { field: "contactPoint", label: "연락처" },
  { field: "specialty", label: "주요 진료분야" },
];

export function validateApplication(
  draft: PartnerApplicationDraft,
): { ok: true } | { ok: false; field: ApplyField; reason: string } {
  for (const { field, label } of REQUIRED_FIELDS) {
    const value = draft[field];
    if (value === null || String(value).trim() === "") {
      return { ok: false, field, reason: `${label}을 입력해 주세요.` };
    }
  }
  // 전화번호든 이메일이든 최소한 숫자나 @ 는 있어야 연락할 수 있다.
  if (!/[0-9]/.test(draft.contactPoint) && !draft.contactPoint.includes("@")) {
    return {
      ok: false,
      field: "contactPoint",
      reason: "연락 가능한 전화번호 또는 이메일을 입력해 주세요.",
    };
  }
  return { ok: true };
}

export function normalizeApplication(draft: PartnerApplicationDraft): PartnerApplicationDraft {
  const cut = (value: string, max: number) => value.trim().replace(/\s+/g, " ").slice(0, max);
  return {
    hospitalName: cut(draft.hospitalName, APPLY_NAME_MAX),
    sido: draft.sido,
    sigungu: cut(draft.sigungu, APPLY_SIGUNGU_MAX),
    contactName: cut(draft.contactName, APPLY_CONTACT_NAME_MAX),
    contactPoint: cut(draft.contactPoint, APPLY_CONTACT_POINT_MAX),
    specialty: cut(draft.specialty, APPLY_SPECIALTY_MAX),
  };
}

/** 접수 확인 화면에 그대로 보여줄 요약. 보낸 내용을 사용자가 다시 확인할 수 있게. */
export function summarize(draft: PartnerApplicationDraft): { label: string; value: string }[] {
  return [
    { label: "의료기관명", value: draft.hospitalName },
    { label: "지역", value: [draft.sido, draft.sigungu].filter(Boolean).join(" ") },
    { label: "담당자", value: draft.contactName },
    { label: "연락처", value: draft.contactPoint },
    { label: "주요 진료분야", value: draft.specialty },
  ].filter((row) => row.value !== "");
}
