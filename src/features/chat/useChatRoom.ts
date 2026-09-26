"use client";

import { useMemo, useSyncExternalStore } from "react";
import { seedChatMessages } from "./seed";
import { byNewestFirst, filterMessages } from "./service";
import { getSentMessages, getSentMessagesOnServer, subscribeChat } from "./store";
import type { ChatFilter, ChatMessage } from "./types";

/**
 * 현장톡 목록.
 *
 * 데모 대화(renderedAt 기준 고정 오프셋) + 이번 브라우저에서 보낸 글을 합쳐 최신순으로 돌려준다.
 * 보내면 store 가 알려 주므로 새로고침 없이 목록 맨 위에 올라간다.
 * 필터는 목록에만 적용하고, 전체 건수는 따로 돌려준다 — 빈 목록이 "글이 없다"인지
 * "필터에 걸렸다"인지 화면이 구분해서 말할 수 있어야 한다.
 */
export function useChatRoom(renderedAt: string, filter: ChatFilter) {
  const seeded = useMemo(() => seedChatMessages(renderedAt), [renderedAt]);
  const sent = useSyncExternalStore(subscribeChat, getSentMessages, getSentMessagesOnServer);

  const all = useMemo<ChatMessage[]>(
    () => [...sent, ...seeded].sort(byNewestFirst),
    [sent, seeded],
  );
  const visible = useMemo(() => filterMessages(all, filter), [all, filter]);

  return { messages: visible, totalCount: all.length };
}
