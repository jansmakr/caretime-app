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

/**
 * 진료 항목 이름 — **두 벌로 둔다.**
 *
 * 같은 항목이 두 화면에서 다르게 보이는 것은 이상하지 않다. 읽는 사람이 다르다.
 *   보호자  한자어를 피한다. 어르신이 읽는다. (docs/UI-PRINCIPLES.md 원칙 7)
 *   병원    의료 용어가 정확하고, 야간 당직자가 빨리 읽는다.
 *
 * 이름에 어느 화면용인지를 박아 둔다. 섞이면 보호자 화면에 "열상"이 샌다.
 * 보호자 화면에서 PARTNER 표를 쓰지 않는지는 테스트가 감시한다.
 */
export type CareCategory = "laceration" | "burn" | "other";

export const CATEGORY_LABEL_GUARDIAN: Record<CareCategory, string> = {
  laceration: "찢어진 상처",
  burn: "화상",
  other: "그 밖의 상처",
};

export const CATEGORY_LABEL_PARTNER: Record<CareCategory, string> = {
  laceration: "열상",
  burn: "화상",
  other: "기타",
};

/**
 * 항목 한 줄에 붙는 짧은 상태말.
 *
 * p0/status.STATUS_TEXT 는 병원 전체를 설명하는 문장이라("확인 당시 접수 가능") 항목
 * 줄에 붙이면 길어진다. 항목 줄은 "화상 마감 · 찢어진 상처 가능" 처럼 읽혀야 한다.
 */
export const CATEGORY_STATUS_GUARDIAN: Record<
  "AVAILABLE" | "LIMITED" | "PAUSED" | "CLOSED" | "UNKNOWN",
  string
> = {
  AVAILABLE: "가능",
  LIMITED: "일부 제한",
  PAUSED: "잠시 중단",
  CLOSED: "마감",
  UNKNOWN: "확인 필요",
};
