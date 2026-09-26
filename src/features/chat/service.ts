import { formatMomentAgo } from "@/lib/relativeTime";
import { chatTemplateText } from "./templates";
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

/** 템플릿 질문만 있고 아무것도 덧붙이지 않은 상태. 그대로 보내지 않게 막는다. */
export function isChatTemplateUntouched(body: string, category: ChatDraft["category"]): boolean {
  const template = chatTemplateText(category);
  if (template === "") return false;
  return body === template;
}

export function validateChatDraft(draft: ChatDraft): { ok: true } | { ok: false; reason: string } {
  if (draft.body.trim() === "") {
    return { ok: false, reason: "보낼 내용을 입력해 주세요." };
  }
  if (draft.category === "other" && (draft.topic ?? "").trim() === "") {
    return { ok: false, reason: "증상이나 주제를 입력해 주세요." };
  }
  if (isChatTemplateUntouched(draft.body, draft.category)) {
    return { ok: false, reason: "템플릿에 상황을 한 줄 덧붙여 주세요." };
  }
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
  if (filter.hospitalId && message.scope.hospitalId !== filter.hospitalId) return false;
  if (filter.sido && message.scope.sido !== filter.sido) return false;
  if (filter.sigungu && message.scope.sigungu !== filter.sigungu) return false;
  return true;
}

export function filterMessages(messages: ChatMessage[], filter: ChatFilter): ChatMessage[] {
  return messages.filter((m) => matchesFilter(m, filter));
}

export function isFilterActive(filter: ChatFilter): boolean {
  return filter.sido !== null || filter.sigungu !== null || filter.hospitalId !== null;
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
