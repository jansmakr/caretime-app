import { normalizeChatDraft } from "./service";
import type { ChatDraft, ChatMessage } from "./types";

/**
 * 현장톡 보관소 (브라우저 메모리).
 *
 * 6단계(Realtime Feed · 카카오 로그인 · Moderation)에서 Supabase 테이블 + 구독으로 바뀔 자리다.
 * 그래서 지금도 구독 가능한 모양(subscribe/getSnapshot)으로 둔다 — 화면 코드를 고치지 않고 backend 만 교체한다.
 * 지금은 새로고침하면 사라진다. 그 사실을 화면이 문장으로 알린다.
 *
 * 서버 스냅샷은 항상 빈 배열이다. 서버에는 보낸 글이 없으므로 hydration 이 어긋나지 않는다.
 */

let sent: ChatMessage[] = [];
const EMPTY: ChatMessage[] = [];
const listeners = new Set<() => void>();
let sequence = 0;
let handle: string | null = null;

export function subscribeChat(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function getSentMessages(): ChatMessage[] {
  return sent;
}

export function getSentMessagesOnServer(): ChatMessage[] {
  return EMPTY;
}

/**
 * 이 브라우저의 익명 표시명. 첫 글을 보낼 때 한 번 만들고 그 뒤로 유지한다.
 * 계정이 없으므로(카카오 로그인은 6단계) 같은 사람의 글을 묶어 보여주기 위한 표시용이며,
 * 개인을 식별하는 값이 아니다. 저장도 하지 않아 탭을 닫으면 사라진다.
 */
export function currentHandle(): string {
  if (handle === null) {
    const suffix = Math.random().toString(16).slice(2, 6).toUpperCase();
    handle = `보호자 ${suffix}`;
  }
  return handle;
}

export function sendChatMessage(draft: ChatDraft, now: Date = new Date()): ChatMessage {
  const message: ChatMessage = {
    ...normalizeChatDraft(draft),
    id: `cm_${now.getTime().toString(36)}_${(sequence += 1).toString(36)}`,
    handle: currentHandle(),
    mine: true,
    createdAt: now.toISOString(),
  };
  sent = [message, ...sent];
  for (const listener of listeners) listener();
  return message;
}

/** 테스트·데모 초기화용. 화면에서는 쓰지 않는다. */
export function resetChat(): void {
  sent = EMPTY;
  handle = null;
  for (const listener of listeners) listener();
}
