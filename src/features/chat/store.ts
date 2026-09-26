import { createNickname, loadStoredNickname, storeNickname } from "./nickname";
import { ZERO_REACTIONS, type ReactionKey } from "./reactions";
import { normalizeChatDraft } from "./service";
import { CHAT_COOLDOWN_MS, type ChatDraft, type ChatMessage } from "./types";

/**
 * 현장톡 보관소 (브라우저 메모리 + 닉네임만 localStorage).
 *
 * 6단계(Realtime Feed · 카카오 로그인 · Moderation)에서 Supabase 테이블 + 구독으로 바뀔 자리다.
 * 그래서 지금도 구독 가능한 모양(subscribe/getSnapshot)으로 둔다 — 화면 코드를 고치지 않고 backend 만 교체한다.
 * 글은 새로고침하면 사라진다. 그 사실을 화면이 문장으로 알린다.
 *
 * 스냅샷은 객체 하나로 둔다. useSyncExternalStore 는 같은 참조를 돌려줘야 무한 렌더에 빠지지 않으므로,
 * 바뀔 때만 새 객체로 교체한다.
 * 서버 스냅샷은 고정된 빈 값이다. 서버에는 보낸 글도 누른 반응도 없어 hydration 이 어긋나지 않는다.
 */

export interface ChatSnapshot {
  /** 이 브라우저에서 보낸 글. 최신이 앞이다. */
  sent: ChatMessage[];
  /** 글 id → 이 브라우저가 누른 반응. */
  myReactions: Record<string, ReactionKey[]>;
  /** 마지막으로 보낸 시각(ms). 연속 등록 차단에 쓴다. */
  lastSentAt: number | null;
  /** 이번 브라우저의 익명 닉네임. 첫 글을 쓸 때 정해진다. */
  nickname: string | null;
}

const SERVER_SNAPSHOT: ChatSnapshot = Object.freeze({
  sent: Object.freeze([]) as unknown as ChatMessage[],
  myReactions: Object.freeze({}) as Record<string, ReactionKey[]>,
  lastSentAt: null,
  nickname: null,
});

let snapshot: ChatSnapshot = SERVER_SNAPSHOT;
const listeners = new Set<() => void>();
let sequence = 0;

function commit(patch: Partial<ChatSnapshot>): void {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener();
}

export function subscribeChat(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function getChatSnapshot(): ChatSnapshot {
  return snapshot;
}

export function getChatSnapshotOnServer(): ChatSnapshot {
  return SERVER_SNAPSHOT;
}

/**
 * 이 브라우저의 닉네임. 저장된 것이 있으면 그대로 쓰고, 없으면 만든다.
 * regionHint 는 보호자가 직접 고른 지역일 때만 넘긴다. (→ nickname.ts 의 주석)
 * 브라우저에서만 부른다 — 서버 렌더 중에 만들면 화면마다 다른 닉네임이 찍힌다.
 */
export function ensureNickname(regionHint: string | null = null): string {
  if (snapshot.nickname) return snapshot.nickname;
  const nickname = loadStoredNickname() ?? createNickname(regionHint);
  storeNickname(nickname);
  commit({ nickname });
  return nickname;
}

/** 저장된 닉네임을 스냅샷에 올린다. 마운트 직후 한 번 부른다(없으면 만들지 않는다). */
export function hydrateNickname(): void {
  if (snapshot.nickname) return;
  const stored = loadStoredNickname();
  if (stored) commit({ nickname: stored });
}

export function remainingCooldownMs(now: number = Date.now()): number {
  if (snapshot.lastSentAt === null) return 0;
  return Math.max(0, CHAT_COOLDOWN_MS - (now - snapshot.lastSentAt));
}

export function canSend(now: number = Date.now()): boolean {
  return remainingCooldownMs(now) === 0;
}

/**
 * 글 보내기. 쿨다운 중이면 아무 것도 하지 않고 null 을 돌려준다.
 * 화면에서 버튼을 잠그지만, 그 판정을 화면 하나에만 맡기지 않는다 —
 * 홈과 /chat 두 곳에서 보낼 수 있으므로 한쪽에서 잠근 것이 다른 쪽에 통해야 한다.
 */
export function sendChatMessage(draft: ChatDraft, now: Date = new Date()): ChatMessage | null {
  if (!canSend(now.getTime())) return null;

  const regionHint = draft.scope.sigungu ?? draft.scope.sido ?? null;
  const message: ChatMessage = {
    ...normalizeChatDraft(draft),
    id: `cm_${now.getTime().toString(36)}_${(sequence += 1).toString(36)}`,
    handle: ensureNickname(regionHint),
    mine: true,
    baseReactions: ZERO_REACTIONS,
    createdAt: now.toISOString(),
  };
  commit({ sent: [message, ...snapshot.sent], lastSentAt: now.getTime() });
  return message;
}

/**
 * 반응 켜기/끄기.
 *
 * 한 브라우저가 같은 글의 같은 반응을 한 번만 올릴 수 있다. 다시 누르면 내린다.
 * 연타로 숫자를 부풀릴 수 있으면 그 숫자는 아무 뜻이 없어진다.
 */
export function toggleReaction(messageId: string, key: ReactionKey): void {
  const current = snapshot.myReactions[messageId] ?? [];
  const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
  commit({ myReactions: { ...snapshot.myReactions, [messageId]: next } });
}

export function myReactionsFor(messageId: string): ReactionKey[] {
  return snapshot.myReactions[messageId] ?? [];
}

/** 테스트·데모 초기화용. 화면에서는 쓰지 않는다. */
export function resetChat(): void {
  snapshot = SERVER_SNAPSHOT;
  for (const listener of listeners) listener();
}
