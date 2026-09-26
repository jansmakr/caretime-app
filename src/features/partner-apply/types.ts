import type { Sido } from "@/features/reports/regions";

/**
 * 의료기관 무료 입점 신청.
 *
 * 병원 계정은 운영자가 직접 발급한다(README 2단계 — 가입은 열어 두지 않는다).
 * 그래서 이 폼은 계정을 만들지 않는다. 운영팀이 연락할 수 있을 만큼의 정보만 받는다.
 *
 * 받지 않는 것: 사업자번호 · 요양기관번호 · 결제수단.
 *   심사·정산 항목을 여기서 받기 시작하면 "돈 낸 병원"을 구분할 데이터가 생긴다.
 *   검색 정렬이 접근할 수 있는 값을 만들지 않는다. (Release Blocker 8)
 */

export interface PartnerApplicationDraft {
  hospitalName: string;
  sido: Sido | null;
  sigungu: string;
  contactName: string;
  /** 전화 또는 이메일. 형식을 하나로 강제하지 않는다. */
  contactPoint: string;
  /** 주요 진료분야. 자유 입력 — 표준 Capability 매핑은 운영팀이 뒤에서 한다. */
  specialty: string;
}

export interface PartnerApplication extends PartnerApplicationDraft {
  id: string;
  submittedAt: string; // ISO8601
}

export const APPLY_NAME_MAX = 40;
export const APPLY_SIGUNGU_MAX = 20;
export const APPLY_CONTACT_NAME_MAX = 20;
export const APPLY_CONTACT_POINT_MAX = 60;
export const APPLY_SPECIALTY_MAX = 80;

export const EMPTY_APPLICATION: PartnerApplicationDraft = {
  hospitalName: "",
  sido: null,
  sigungu: "",
  contactName: "",
  contactPoint: "",
  specialty: "",
};
