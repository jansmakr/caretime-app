"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getPublicBrowserSupabase } from "@/lib/supabase/browser";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { fetchFieldReports } from "./repository";
import { withPendingReactions, type ReactionKey } from "./reactions";
import { filterMessages, mergeRoomMessages } from "./service";
import {
  connectChat,
  deleteMyMessage,
  getChatSnapshot,
  getChatSnapshotOnServer,
  hydrateMessages,
  hydrateMyReactions,
  hydrateNickname,
  pendingReactionKeys,
  pressReaction,
  remainingCooldownMs,
  subscribeChat,
} from "./store";
import { CHAT_COOLDOWN_MS, type ChatFilter, type ChatMessage, type ChatMessageView } from "./types";

/** 화면을 보고 있는 동안 다시 읽는 간격. 구독이 살아 있으면 대부분 아무것도 바뀌지 않는다. */
export const LIVE_REFRESH_MS = 30_000;
/** 돌아왔을 때 이보다 짧게 지났으면 다시 읽지 않는다. */
const RETURN_MIN_GAP_MS = 5_000;

/**
 * 현장톡 목록 · 반응 · 쿨다운.
 *
 * 서버가 읽어 온 글 + 이번 브라우저에서 보낸 글을 합쳐 최신순으로 돌려준다. 가상 대화는 없다.
 * (renderedAt 은 부르는 쪽 모양을 바꾸지 않으려고 남겨 둔 인자다. 지금은 쓰지 않는다.)
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

  // 저장된 닉네임은 브라우저에만 있다. 첫 렌더가 아니라 마운트 후에 올린다.
  // 내가 누른 반응도 서버에 물어 눌린 표시를 되살린다(새로고침해도 남게).
  useEffect(() => {
    hydrateNickname();
    hydrateMyReactions();
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
    const startedAt = Date.now();
    void fetchFieldReports(getPublicBrowserSupabase(), {
      sido: filter.sido,
      sigungu: filter.sigungu,
      recentOnly: filter.recentOnly,
    })
      .then((rows) => {
        // 조건을 빠르게 두 번 바꾸면 늦게 온 응답이 먼저 온 것을 덮는다. 그래서 버린다.
        if (live) hydrateMessages(rows, startedAt);
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
   * ── 최신 글이 계속 보이게 (2026-10-14) ──────────────────────
   * 새 글은 실시간 구독으로 들어온다. 그런데 휴대폰 화면이 꺼지거나 다른 앱을 보는
   * 동안 연결이 끊기면 **그 사이 글을 놓친다** — 다시 켜도 목록은 끊긴 시점에 멈춰
   * 있고, 화면은 멀쩡해 보인다. "지금 문 연 곳"을 묻는 방에서 그 멈춤은 고장이다.
   *
   * 그래서 구독과 별개로 지금 조건의 최신 목록을 **다시 읽어 합친다.**
   *   · 화면으로 돌아왔을 때(visibilitychange) · 창에 다시 들어왔을 때(focus)
   *   · 인터넷이 다시 연결됐을 때(online)
   *   · 화면을 보고 있는 동안 LIVE_REFRESH_MS 마다(구독이 조용히 죽은 경우 대비)
   * 화면이 가려져 있을 때는 읽지 않는다 — 보지 않는 화면이 데이터를 쓰지 않게.
   * 합치는 것은 hydrateMessages(id 로 합침)라 같은 글이 두 번 보이지 않고, 반응 수도
   * 같이 새로 맞춰진다. 실패하면 조용히 넘긴다 — 보던 글은 그대로다.
   */
  const filterRef = useRef(filter);
  filterRef.current = filter;
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let inFlight = false;
    let lastAt = Date.now();
    const refresh = () => {
      if (document.visibilityState !== "visible" || inFlight) return;
      inFlight = true;
      lastAt = Date.now();
      const startedAt = lastAt;
      const current = filterRef.current;
      void fetchFieldReports(getPublicBrowserSupabase(), {
        sido: current.sido,
        sigungu: current.sigungu,
        recentOnly: current.recentOnly,
      })
        .then((rows) => {
          // 읽는 사이 조건이 바뀌었으면 버린다(조건 effect 가 새로 읽는다).
          if (filterRef.current === current) hydrateMessages(rows, startedAt);
        })
        .catch(() => undefined)
        .finally(() => {
          inFlight = false;
        });
    };
    // 돌아올 때마다 읽되, 방금 읽었으면 건너뛴다(focus·visibilitychange 가 겹쳐 온다).
    const onReturn = () => {
      if (Date.now() - lastAt > RETURN_MIN_GAP_MS) refresh();
    };

    const id = setInterval(refresh, LIVE_REFRESH_MS);
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    window.addEventListener("online", refresh);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
      window.removeEventListener("online", refresh);
    };
  }, []);

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
      // 가상 대화 원본을 저장소에서 지웠다(2026-10-12). 번들에 실리지 않게 하려면
      // 플래그로 막는 것이 아니라 import 자체가 없어야 한다.
      seeded: [],
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
        // 숫자는 서버 값 + 서버가 아직 모르는 내 반응뿐이다. 눌린 표시(mine)를 더하지 않는다.
        reactions: withPendingReactions(
          message.baseReactions,
          pendingReactionKeys(snapshot.pendingReactions, message.id),
        ),
      };
    });
    // initialMessages 는 서버 렌더값이라 바뀌지 않는다. 의존성에 넣어도 같은 결과다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    snapshot.messages,
    snapshot.myReactions,
    snapshot.pendingReactions,
    snapshot.mineIds,
    snapshot.removedIds,
    initialMine,
  ]);

  const messages = useMemo(() => filterMessages(all, filter), [all, filter]);
  const react = useCallback(
    (messageId: string, key: ReactionKey) => pressReaction(messageId, key),
    [],
  );

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
