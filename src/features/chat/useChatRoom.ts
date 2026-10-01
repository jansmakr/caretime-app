"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { withMyReactions } from "./reactions";
import { seedChatMessages } from "./seed";
import { showDemoReports } from "@/lib/demoContent";
import { filterMessages, mergeRoomMessages } from "./service";
import {
  connectChat,
  getChatSnapshot,
  getChatSnapshotOnServer,
  hydrateMessages,
  hydrateNickname,
  remainingCooldownMs,
  subscribeChat,
  toggleReaction,
} from "./store";
import { CHAT_COOLDOWN_MS, type ChatFilter, type ChatMessage, type ChatMessageView } from "./types";

/**
 * 현장톡 목록 · 반응 · 쿨다운.
 *
 * 데모 대화(renderedAt 기준 고정 오프셋) + 이번 브라우저에서 보낸 글을 합쳐 최신순으로 돌려준다.
 * 보내거나 반응을 누르면 store 가 알려 주므로 새로고침 없이 반영된다.
 *
 * 필터는 목록에만 적용하고 전체 건수는 따로 돌려준다 — 빈 목록이 "글이 없다"인지
 * "필터에 걸렸다"인지 화면이 구분해서 말할 수 있어야 한다.
 */
export function useChatRoom(
  renderedAt: string,
  filter: ChatFilter,
  /** 서버가 읽어 온 글. 첫 화면부터 글이 보이게 하려면 이 값이 있어야 한다. */
  initialMessages: ChatMessage[] = [],
) {
  const snapshot = useSyncExternalStore(subscribeChat, getChatSnapshot, getChatSnapshotOnServer);
  // 운영에서는 가상 대화를 렌더하지 않는다. 빈 상태를 0건으로 꾸미지 않기 위해 목록만 비운다.
  const seeded = useMemo(
    () => (showDemoReports ? seedChatMessages(renderedAt) : []),
    [renderedAt],
  );

  // 저장된 닉네임은 브라우저에만 있다. 첫 렌더가 아니라 마운트 후에 올린다.
  useEffect(() => {
    hydrateNickname();
  }, []);

  /*
   * 서버가 읽어 온 글을 store 에 올리고 구독을 연다.
   * hydrate 가 먼저다 — 구독이 먼저 열리면 그 사이 들어온 글을 서버 목록이 덮는다.
   */
  useEffect(() => {
    hydrateMessages(initialMessages);
    return connectChat();
    // initialMessages 는 서버 렌더값이라 한 번만 쓴다. 매 렌더마다 다시 올리지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * 합치는 규칙은 service.mergeRoomMessages 에 있다(테스트가 그 함수를 붙든다).
   * 서버가 읽어 온 글이 첫 렌더부터 들어가고, 격리된 글은 되살아나지 않는다.
   */
  const all = useMemo<ChatMessageView[]>(() => {
    const merged = mergeRoomMessages({
      stored: snapshot.messages,
      initial: initialMessages,
      seeded,
      removedIds: snapshot.removedIds,
    });
    return merged.map((message) => {
      const mine = snapshot.myReactions[message.id] ?? [];
      return { ...message, myReactions: mine, reactions: withMyReactions(message.baseReactions, mine) };
    });
    // initialMessages 는 서버 렌더값이라 바뀌지 않는다. 의존성에 넣어도 같은 결과다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.messages, snapshot.myReactions, snapshot.removedIds, seeded]);

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

/**
 * 이 브라우저의 표시 이름. 서버가 정한 값을 받아 온다.
 *
 * 첫 렌더에서는 null 이다 — 서버 렌더에는 이 브라우저의 세션이 없고, 여기서 값을
 * 만들면 서버와 브라우저가 달라진다. 마운트 뒤에 채운다.
 */
export function useChatNickname(): string | null {
  const snapshot = useSyncExternalStore(subscribeChat, getChatSnapshot, getChatSnapshotOnServer);

  useEffect(() => {
    hydrateNickname();
  }, []);

  return snapshot.nickname;
}
