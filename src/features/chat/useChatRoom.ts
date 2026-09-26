"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { withMyReactions } from "./reactions";
import { seedChatMessages } from "./seed";
import { byNewestFirst, filterMessages } from "./service";
import {
  getChatSnapshot,
  getChatSnapshotOnServer,
  hydrateNickname,
  remainingCooldownMs,
  subscribeChat,
  toggleReaction,
} from "./store";
import { CHAT_COOLDOWN_MS, type ChatFilter, type ChatMessageView } from "./types";

/**
 * 현장톡 목록 · 반응 · 쿨다운.
 *
 * 데모 대화(renderedAt 기준 고정 오프셋) + 이번 브라우저에서 보낸 글을 합쳐 최신순으로 돌려준다.
 * 보내거나 반응을 누르면 store 가 알려 주므로 새로고침 없이 반영된다.
 *
 * 필터는 목록에만 적용하고 전체 건수는 따로 돌려준다 — 빈 목록이 "글이 없다"인지
 * "필터에 걸렸다"인지 화면이 구분해서 말할 수 있어야 한다.
 */
export function useChatRoom(renderedAt: string, filter: ChatFilter) {
  const snapshot = useSyncExternalStore(subscribeChat, getChatSnapshot, getChatSnapshotOnServer);
  const seeded = useMemo(() => seedChatMessages(renderedAt), [renderedAt]);

  // 저장된 닉네임은 브라우저에만 있다. 첫 렌더가 아니라 마운트 후에 올린다.
  useEffect(() => {
    hydrateNickname();
  }, []);

  const all = useMemo<ChatMessageView[]>(() => {
    const merged = [...snapshot.sent, ...seeded].sort(byNewestFirst);
    return merged.map((message) => {
      const mine = snapshot.myReactions[message.id] ?? [];
      return { ...message, myReactions: mine, reactions: withMyReactions(message.baseReactions, mine) };
    });
  }, [snapshot.sent, snapshot.myReactions, seeded]);

  const messages = useMemo(() => filterMessages(all, filter), [all, filter]);
  const react = useCallback((messageId: string, key: Parameters<typeof toggleReaction>[1]) => {
    toggleReaction(messageId, key);
  }, []);

  return {
    messages,
    totalCount: all.length,
    nickname: snapshot.nickname,
    lastSentAt: snapshot.lastSentAt,
    react,
  };
}

export const COOLDOWN_SECONDS = Math.ceil(CHAT_COOLDOWN_MS / 1000);

/**
 * 남은 연속 등록 차단 시간(초). 0 이면 보낼 수 있다.
 *
 * 마지막 전송 시각은 store 에 있으므로 홈에서 보낸 것이 /chat 에도 통한다.
 * 첫 렌더에서는 항상 0 이다 — 서버에는 전송 기록이 없어 hydration 이 어긋나지 않는다.
 * 0 이 되면 타이머를 멈춘다. 쓰지 않는 화면에서 1초마다 렌더하지 않게.
 */
export function useCooldownSeconds(lastSentAt: number | null): number {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (lastSentAt === null) {
      setSeconds(0);
      return;
    }
    setSeconds(Math.ceil(remainingCooldownMs() / 1000));
    const id = setInterval(() => {
      const left = remainingCooldownMs();
      setSeconds(Math.ceil(left / 1000));
      if (left === 0) clearInterval(id);
    }, 250);
    return () => clearInterval(id);
  }, [lastSentAt]);

  return seconds;
}
