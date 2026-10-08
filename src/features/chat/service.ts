import { formatMomentAgo } from "@/lib/relativeTime";
import {
  CHAT_BODY_MAX,
  CHAT_TOPIC_MAX,
  type ChatDraft,
  type ChatFilter,
  type ChatMessage,
} from "./types";

/**
 * 현장톡 규칙. 순수 함수만 둔다 — 6단계에서 서버 액션으로 그대로 옮긴다.
 * 병원 상태를 고치는 함수는 여기에 만들지 않는다. (README CI lint 룰 1번)
 */

export const formatChatAgo = formatMomentAgo;

/**
 * 보낼 수 있는 글인가.
 *
 * 본문만 본다. 주제는 선택이고, 분류는 화면에서 고르지 않는다(DEFAULT_CATEGORY).
 * 템플릿 검사도 없앴다 — 채울 템플릿이 더 없다.
 */
export function validateChatDraft(draft: ChatDraft): { ok: true } | { ok: false; reason: string } {
  if (draft.body.trim() === "") {
    return { ok: false, reason: "보낼 내용을 입력해 주세요." };
  }
  /*
   * 주제는 받지만 **요구하지 않는다.** 한 줄 물어보려는 사람에게 칸 두 개를 채우게
   * 하면 첫 글이 안 올라간다. 주제는 목록에서 칩으로 보일 뿐이고, 없으면 칩이
   * 하나 줄어드는 것이 전부다.
   */
  return { ok: true };
}

export function normalizeChatDraft(draft: ChatDraft): ChatDraft {
  return {
    ...draft,
    topic: draft.category === "other" ? (draft.topic ?? "").trim().slice(0, CHAT_TOPIC_MAX) : null,
    body: draft.body.trim().slice(0, CHAT_BODY_MAX),
  };
}

/**
 * 지역·병원 필터.
 *
 * 좁히는 방향으로만 동작한다. 필터에 값이 있으면 그 값과 같은 글만 남는다 —
 * 지역을 특정하지 않은 글은 '전체'에서만 보인다. 관련 있어 보이는 글을
 * 임의로 끌어오면 "이 병원 이야기"인 줄 알고 읽게 된다.
 */
export function matchesFilter(message: ChatMessage, filter: ChatFilter): boolean {
  if (filter.sido && message.scope.sido !== filter.sido) return false;
  if (filter.sigungu && message.scope.sigungu !== filter.sigungu) return false;
  return true;
}

/** 제네릭으로 둔다. 화면에 넘기는 ChatMessageView 를 통과시킬 때 타입이 좁혀지지 않게. */
export function filterMessages<T extends ChatMessage>(messages: T[], filter: ChatFilter): T[] {
  return messages.filter((m) => matchesFilter(m, filter));
}

/**
 * 지역을 좁혀 보고 있는가. **기간은 보지 않는다** — 기본값(최근 1개월)이 '조건을
 * 걸었다'로 읽히면, 글이 0건일 때 "조건을 넓혀 보라"는 안내가 엉뚱하게 나온다.
 */
export function isFilterActive(filter: ChatFilter): boolean {
  return filter.sido !== null || filter.sigungu !== null;
}

/** 필터를 한 줄로 설명한다. 무엇이 걸려 있는지 보이지 않으면 빈 목록을 오해한다. */
export function describeFilter(
  filter: ChatFilter,
  hospitalName: string | null,
): string {
  const parts = [filter.sido, filter.sigungu, hospitalName].filter(Boolean);
  return parts.length === 0 ? "전체" : parts.join(" · ");
}

export function byNewestFirst(a: ChatMessage, b: ChatMessage): number {
  return Date.parse(b.createdAt) - Date.parse(a.createdAt);
}

/**
 * 화면에 그릴 목록을 만든다.
 *
 * 세 곳에서 온 글을 합친다 — 서버가 렌더한 것(initial), 보관소에 있는 것(stored),
 * 데모 시드(seeded). 서버 목록을 **첫 렌더부터** 넣는 것이 중요하다. 마운트 뒤에만
 * 넣으면 서버가 보낸 HTML 이 항상 0건이고, 글이 적은 출시 직후에 첫 그림이
 * "아무 말도 없는 방"이 된다.
 *
 * 규칙 둘:
 *   · 같은 id 면 **보관소 쪽이 이긴다.** '내 글' 표시처럼 서버가 모르는 값이 거기 있다.
 *   · 격리·삭제된 id 는 뺀다. 서버 목록에 남아 있어도 되살리지 않는다 —
 *     신고로 내린 글이 되살아나는 쪽이 훨씬 나쁘다.
 */
export function mergeRoomMessages(parts: {
  stored: ChatMessage[];
  initial: ChatMessage[];
  seeded: ChatMessage[];
  removedIds: Record<string, true>;
}): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  // 뒤에 넣는 쪽이 이긴다. 그래서 stored 를 initial 보다 뒤에 둔다.
  for (const message of [...parts.initial, ...parts.seeded, ...parts.stored]) {
    if (parts.removedIds[message.id]) continue;
    byId.set(message.id, message);
  }
  return [...byId.values()].sort(byNewestFirst);
}
