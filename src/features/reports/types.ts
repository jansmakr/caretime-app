/**
 * 보호자 공유 계층의 공통 타입.
 *
 * 설계 규칙: 이 타입은 병원 직접확인 계층과 절대 합쳐지지 않는다.
 *   보호자가 쓴 글이 HospitalLiveStatus / HospitalWaitingStatus 로 승격되는 경로가 없다.
 *   (README 「8단계 CI lint 룰」 1번 — 사용자 입력이 hospital_live_status 에 write 하는 경로 금지)
 *
 * 전에는 여기에 제보 작성 폼이 쓰는 타입(ReportDraft·UserReport·ReportTarget)이 함께
 * 있었다. 그 폼과 보관소는 현장톡(features/chat)과 **다른 저장소**였고, 그래서
 * 같은 사람이 같은 병원에 대해 쓴 글이 어디에 썼느냐로 남는지가 갈렸다.
 * 하나로 합치면서 그 타입들을 지웠다 — 남겨 두면 두 번째 저장소를 다시 만들게 된다.
 * 지금 글의 타입은 features/chat/types 하나다(ChatDraft·ChatMessage).
 */

/** 글 카테고리 3분할. 늘리기 전에 "정말 이 칩이 필요한가"를 먼저 본다. */
export type ReportCategory = "laceration" | "burn" | "other";
