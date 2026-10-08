"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getPublicBrowserSupabase } from "@/lib/supabase/browser";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { fetchFieldReports } from "./repository";
import { withMyReactions } from "./reactions";
import { seedChatMessages } from "./seed";
import { showDemoReports } from "@/lib/demoContent";
import { filterMessages, mergeRoomMessages } from "./service";
import {
  connectChat,
  deleteMyMessage,
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
  /**
   * 서버가 읽어 준 '내 글' id. 이것이 없으면 첫 그림에 삭제 버튼이 없다 —
   * 공개 뷰가 guest_id 를 내보내지 않으므로 목록만 보고는 알 수 없다.
   */
  initialMyPostIds: string[] = [],
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
   * 조건이 바뀌면 **서버에서 다시 읽는다.**
   *
   * 화면에서 거르는 것만으로는 안 된다 — 보관소에는 서버가 처음 준 것(기본: 내가 보던
   * 조건의 최근 1개월)만 있다. "이전 글도 보기"를 누르면 그 글은 애초에 받지 않았고,
   * "내 지역 보기"도 전국 최신 100건 밖의 구 글을 못 본다. 그래서 조건마다 읽는다.
   *
   * 받은 글은 **더한다**(hydrateMessages 가 id 로 합친다). 조건을 되돌렸을 때 다시
   * 읽지 않아도 되고, 넓혔다 좁히는 동안 목록이 깜빡이지 않는다.
   *
   * 첫 렌더에서는 돌지 않는다 — 서버가 이미 그 조건으로 읽어 넘겼다.
   */
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!isSupabaseConfigured) return;

    let live = true;
    void fetchFieldReports(getPublicBrowserSupabase(), {
      sido: filter.sido,
      sigungu: filter.sigungu,
      recentOnly: filter.recentOnly,
    })
      .then((rows) => {
        // 조건을 빠르게 두 번 바꾸면 늦게 온 응답이 먼저 온 것을 덮는다. 그래서 버린다.
        if (live) hydrateMessages(rows);
      })
      .catch(() => {
        /*
         * 실패해도 화면을 비우지 않는다. 이미 보고 있던 글은 그대로 두는 것이 맞다 —
         * 조건을 바꿨다고 읽던 것이 사라지면 고장으로 읽힌다.
         */
      });

    return () => {
      live = false;
    };
  }, [filter.sido, filter.sigungu, filter.recentOnly]);

  /*
   * 합치는 규칙은 service.mergeRoomMessages 에 있다(테스트가 그 함수를 붙든다).
   * 서버가 읽어 온 글이 첫 렌더부터 들어가고, 격리된 글은 되살아나지 않는다.
   */
  // 서버 렌더값이라 바뀌지 않는다. 매 렌더마다 Set 을 다시 만들지 않는다.
  const initialMine = useMemo(() => new Set(initialMyPostIds), [initialMyPostIds]);

  const all = useMemo<ChatMessageView[]>(() => {
    const merged = mergeRoomMessages({
      stored: snapshot.messages,
      initial: initialMessages,
      seeded,
      removedIds: snapshot.removedIds,
    });
    return merged.map((message) => {
      const mine = snapshot.myReactions[message.id] ?? [];
      return {
        ...message,
        // 서버에 물어 받은 '내 글' 표시를 얹는다. 새로고침 뒤에도 삭제 버튼이 남는다.
        mine:
          message.mine ||
          snapshot.mineIds[message.id] === true ||
          initialMine.has(message.id),
        myReactions: mine,
        reactions: withMyReactions(message.baseReactions, mine),
      };
    });
    // initialMessages 는 서버 렌더값이라 바뀌지 않는다. 의존성에 넣어도 같은 결과다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    snapshot.messages,
    snapshot.myReactions,
    snapshot.mineIds,
    snapshot.removedIds,
    seeded,
    initialMine,
  ]);

  const messages = useMemo(() => filterMessages(all, filter), [all, filter]);
  const react = useCallback((messageId: string, key: Parameters<typeof toggleReaction>[1]) => {
    toggleReaction(messageId, key);
  }, []);

  /** 내가 쓴 글 지우기. 돌려주는 약속이 깨지면 화면이 알려 준다. */
  const remove = useCallback(async (messageId: string) => {
    await deleteMyMessage(messageId);
  }, []);

  return {
    messages,
    totalCount: all.length,
    nickname: snapshot.nickname,
    lastSentAt: snapshot.lastSentAt,
    react,
    remove,
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
