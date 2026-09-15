import type { ContactStatusCode, LimitReasonCode } from "./types";

/**
 * 상태 문구 단일 지점.
 * 병원이 누른 버튼의 이름과 보호자가 보는 문구가 달라지면 안 되므로
 * /partner 입력 화면과 병원 상세 화면이 같은 표를 쓴다.
 */

export const REASON_TEXT: Record<LimitReasonCode, string> = {
  staff: "의료진 사정",
  specialist_absent: "담당 전문의 부재",
  in_procedure: "수술·처치 중",
  emergency: "응급환자 대응 중",
  crowded: "환자 과밀",
  equipment: "장비 문제",
  space: "병상·처치공간 부족",
  custom: "의료기관 직접 입력",
};

export const CONTACT_TEXT: Record<ContactStatusCode, string> = {
  available: "전화문의 가능",
  busy: "통화량 많음",
  difficult: "현재 전화문의 어려움",
  prefer_app: "앱 확인 요청 권장",
};
