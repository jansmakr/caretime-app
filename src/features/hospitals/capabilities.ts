import type { Capability } from "./types";

/**
 * 진료 항목 목록. **가상 데이터가 아니다** — 화면이 쓰는 이름표다.
 *
 * 전에는 mock.ts 안에 있었다. 그래서 이름표 하나를 읽으려고 가상 병원 목록까지
 * 클라이언트 번들에 따라 들어갔다(2026-10-12 번들 grep 으로 확인). 떼어 냈다.
 */
export const CAPABILITIES: Capability[] = [
  { id: "cap_facial_laceration", label: "소아 안면열상", group: "facial" },
  { id: "cap_scalp_laceration", label: "두피 열상", group: "facial" },
  { id: "cap_hand_trauma", label: "손가락 외상", group: "hand" },
  { id: "cap_nail_injury", label: "손톱 손상", group: "hand" },
  { id: "cap_burn", label: "소아 화상", group: "burn" },
  { id: "cap_bite", label: "교상", group: "other" },
  { id: "cap_foreign_body", label: "이물 제거", group: "other" },
];
