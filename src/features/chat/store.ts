import { getPublicBrowserSupabase } from "@/lib/supabase/browser";
import {
  fetchGuestNickname,
  insertFieldReport,
  insertReaction,
  subscribeFieldReports,
} from "./repository";
import { ZERO_REACTIONS, type ReactionKey } from "./reactions";
import { normalizeChatDraft } from "./service";
import { CHAT_COOLDOWN_MS, type ChatDraft, type ChatMessage } from "./types";

/**
 * 현장톡 보관소.
 *
 * 글은 이제 **서버에 있다**(public.field_reports). 새로고침해도 남고, 다른 사람에게 간다.
 * 브라우저에만 남는 것은 두 가지다 — 닉네임과, 이 브라우저가 누른 반응.
 *
 * 화면 코드는 그대로다. 밖으로 내보내는 모양(subscribe/getSnapshot/sendChatMessage)을
 * 바꾸지 않았다. 안쪽만 갈아 끼웠다.
 *
 * 스냅샷은 객체 하나로 둔다. useSyncExternalStore 는 같은 참조를 돌려줘야 무한 렌더에
 * 빠지지 않으므로, 바뀔 때만 새 객체로 교체한다.
 * 서버 스냅샷은 고정된 빈 값이다 — 서버 렌더가 읽은 글은 hydrate() 로 들어오고,
 * 그 시점은 마운트 뒤다. 여기서 값을 만들면 서버와 브라우저가 달라진다.
 */

export interface ChatSnapshot {
  /**
   * 방에 있는 글. 최신이 앞이다.
   *
   * 서버가 읽어 준 것 + 구독으로 들어온 것 + 이 브라우저가 방금 보낸 것이 한 목록이다.
   * 출처를 나눠 두면 같은 글이 두 번 보이는 순간이 생긴다(보내자마자 구독으로 되돌아온다).
   */
  messages: ChatMessage[];
  /** 글 id → 이 브라우저가 누른 반응. */
  myReactions: Record<string, ReactionKey[]>;
  /** 마지막으로 보낸 시각(ms). 연속 등록 차단에 쓴다. */
  lastSentAt: number | null;
  /** 이번 브라우저의 익명 닉네임. 첫 글을 쓸 때 정해진다. */
  nickname: string | null;
}

const SERVER_SNAPSHOT: ChatSnapshot = Object.freeze({
  messages: Object.freeze([]) as unknown as ChatMessage[],
  myReactions: Object.freeze({}) as Record<string, ReactionKey[]>,
  lastSentAt: null,
  nickname: null,
});

let snapshot: ChatSnapshot = SERVER_SNAPSHOT;
const listeners = new Set<() => void>();
/** 구독 해제 함수. 화면이 사라지면 끊는다. */
let unsubscribeRealtime: (() => void) | null = null;

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
 * 이 브라우저의 닉네임. **서버가 정한다.**
 *
 * 전에는 브라우저가 만들어 localStorage 에 뒀다. 그러면 누구나 바꿀 수 있고, 같은 이름을
 * 여러 사람이 쓸 수도 있어 "아까 그 사람"이 성립하지 않는다. 이제 게스트 세션(httpOnly
 * 쿠키)에 묶여 있고, 화면은 표시용으로 받아만 온다.
 *
 * 돌려주는 값이 없다. 이름을 알기 전에 글을 쓸 수 있어야 하고(글에 붙는 이름도 서버가
 * 정한다), 화면은 받아오는 대로 보여 주면 된다.
 */
export function hydrateNickname(): void {
  if (snapshot.nickname) return;
  void fetchGuestNickname().then((nickname) => {
    if (nickname && !snapshot.nickname) commit({ nickname });
  });
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
export async function sendChatMessage(
  draft: ChatDraft,
  now: Date = new Date(),
): Promise<ChatMessage | null> {
  if (!canSend(now.getTime())) return null;

  const normalized = normalizeChatDraft(draft);

  /*
   * 쿨다운은 저장 **전에** 찍는다. 저장이 오래 걸리는 동안 연타로 여러 번 들어가는 것을
   * 막으려는 것이다. 실패하면 되돌린다 — 못 보낸 글 때문에 기다리게 하지 않는다.
   */
  const previousSentAt = snapshot.lastSentAt;
  commit({ lastSentAt: now.getTime() });

  try {
    const saved = await insertFieldReport(normalized);
    // 구독으로도 같은 글이 돌아온다. id 로 합치므로 두 번 보이지 않는다.
    commit({ messages: mergeMessage(snapshot.messages, saved) });
    return saved;
  } catch (e) {
    commit({ lastSentAt: previousSentAt });
    throw e;
  }
}

/** 같은 id 면 갈아 끼우고, 없으면 최신 자리에 넣는다. */
function mergeMessage(list: ChatMessage[], message: ChatMessage): ChatMessage[] {
  const existing = list.find((m) => m.id === message.id);
  // 내가 보낸 글이라는 표시는 서버가 모른다. 한 번 붙은 표시를 구독 값이 지우지 않게 한다.
  const merged = existing ? { ...message, mine: existing.mine || message.mine } : message;
  const rest = list.filter((m) => m.id !== message.id);
  return [merged, ...rest].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id),
  );
}

/**
 * 서버가 읽어 온 글을 올린다. 마운트 직후 한 번 부른다.
 *
 * 이미 들어 있는 글은 덮지 않는다 — 구독으로 먼저 들어온 최신 글이 서버 렌더 시점의
 * 목록으로 되돌아가면 방금 본 글이 사라진다.
 */
export function hydrateMessages(initial: ChatMessage[]): void {
  if (initial.length === 0) return;
  let next = snapshot.messages;
  for (const message of initial) next = mergeMessage(next, message);
  commit({ messages: next });
}

/**
 * 실시간 구독을 연다. 이미 열려 있으면 그대로 둔다.
 * 돌려주는 함수를 부르면 끊는다. 화면이 여럿이어도 구독은 하나다.
 */
export function connectChat(): () => void {
  if (unsubscribeRealtime) return () => undefined;

  unsubscribeRealtime = subscribeFieldReports(getPublicBrowserSupabase(), (signal) => {
    if (signal.kind === "remove") {
      // 격리·삭제된 글. 읽고 있던 사람 화면에서도 사라져야 한다.
      commit({ messages: snapshot.messages.filter((m) => m.id !== signal.id) });
      return;
    }
    commit({ messages: mergeMessage(snapshot.messages, signal.message) });
  });

  return () => {
    unsubscribeRealtime?.();
    unsubscribeRealtime = null;
  };
}

/**
 * 반응 켜기/끄기.
 *
 * 한 브라우저가 같은 글의 같은 반응을 한 번만 올릴 수 있다. 다시 누르면 내린다.
 * 연타로 숫자를 부풀릴 수 있으면 그 숫자는 아무 뜻이 없어진다.
 */
export function toggleReaction(messageId: string, key: ReactionKey): void {
  const current = snapshot.myReactions[messageId] ?? [];
  const pressing = !current.includes(key);
  const next = pressing ? [...current, key] : current.filter((k) => k !== key);
  commit({ myReactions: { ...snapshot.myReactions, [messageId]: next } });

  /*
   * 켤 때만 서버로 간다. 취소는 아직 서버에 보낼 수 없다 — 누른 사람을 증명할 방법이
   * 없어 삭제 정책을 만들지 않았다(migration 20260929 주석). 게스트 세션이 생기는 턴에 연다.
   * 그때까지 취소는 이 브라우저 안에서만 반영된다.
   *
   * 실패해도 화면을 되돌리지 않는다. 반응 하나가 안 올라간 것으로 사용자를 붙잡지 않는다.
   */
  if (!pressing) return;
  void insertReaction(messageId, key);
}

export function myReactionsFor(messageId: string): ReactionKey[] {
  return snapshot.myReactions[messageId] ?? [];
}

/** 테스트·데모 초기화용. 화면에서는 쓰지 않는다. */
export function resetChat(): void {
  unsubscribeRealtime?.();
  unsubscribeRealtime = null;
  snapshot = SERVER_SNAPSHOT;
  for (const listener of listeners) listener();
}
