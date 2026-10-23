"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getPublicBrowserSupabase } from "@/lib/supabase/browser";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { fetchReplyCounts, fetchReplyTimes } from "./repository";
import {
  countNewReplies,
  readReplySeen,
  saveReplySeen,
  withReplySeen,
  type ReplySeen,
} from "./replies";
import { LIVE_REFRESH_MS } from "./useChatRoom";

/**
 * 보고 있는 글들의 답글 수 + 내 글의 새 답글 수.
 *
 * ── 읽기가 실패하면 답글 영역을 숨긴다 ──────────────────────
 * 화면이 migration 20261022 보다 먼저 배포되면 답글 뷰가 없다. 그때 "답글 0개"를
 * 그리면 없는 숫자이고, 눌러 쓰면 503 이다. 그래서 **한 번이라도 읽기에 성공하기 전까지,
 * 그리고 실패하는 동안** enabled 는 false 이고 화면은 답글 버튼을 그리지 않는다.
 * 첫 그림(서버 렌더)에도 없다 — 숫자를 모르는 채로 버튼을 그리지 않는다.
 *
 * ── 새로 읽는 때 ──────────────────────────────────────────
 * 새 구독은 없다(2026-10-22 결정). 글 목록과 같은 간격(LIVE_REFRESH_MS)으로, 화면을
 * 보고 있을 때만 다시 읽는다. 답글을 올린 직후에는 부르는 쪽이 refresh() 를 부른다.
 */
export function useReplies(
  messages: { id: string; mine: boolean }[],
  /** 이 브라우저가 쓴 글·답글 id. 내가 단 답글은 새 답글로 세지 않는다. */
  myIds: ReadonlySet<string>,
) {
  const [enabled, setEnabled] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [times, setTimes] = useState<{ id: string; parentId: string; createdAt: string }[]>([]);
  const [seen, setSeen] = useState<ReplySeen>({});

  // 본 기록은 브라우저에만 있다. 마운트 뒤에 읽는다.
  useEffect(() => {
    setSeen(readReplySeen());
  }, []);

  const ids = useMemo(() => messages.map((m) => m.id), [messages]);
  const myPostIds = useMemo(() => messages.filter((m) => m.mine).map((m) => m.id), [messages]);
  const idsKey = ids.join(",");
  const mineKey = myPostIds.join(",");

  const latest = useRef({ ids, myPostIds });
  latest.current = { ids, myPostIds };
  // 늦게 온 응답이 새 응답을 덮지 않게.
  const sequence = useRef(0);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setEnabled(false);
      return;
    }
    const mySeq = ++sequence.current;
    const { ids: currentIds, myPostIds: currentMine } = latest.current;
    const client = getPublicBrowserSupabase();
    try {
      const [nextCounts, nextTimes] = await Promise.all([
        fetchReplyCounts(client, currentIds),
        currentMine.length > 0 ? fetchReplyTimes(client, currentMine) : Promise.resolve([]),
      ]);
      if (mySeq !== sequence.current) return;
      setCounts(nextCounts);
      setTimes(nextTimes);
      setEnabled(true);
    } catch {
      if (mySeq !== sequence.current) return;
      setEnabled(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [idsKey, mineKey, load]);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, LIVE_REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  /** 이 글의 답글을 latestAt(가장 늦은 답글의 서버 시각)까지 봤다. */
  const markSeen = useCallback((postId: string, latestAt: string) => {
    setSeen((previous) => {
      const next = withReplySeen(previous, postId, latestAt);
      if (next !== previous) saveReplySeen(next);
      return next;
    });
  }, []);

  const newCounts = useMemo(
    () =>
      countNewReplies({
        times,
        myPostIds: new Set(myPostIds),
        myReplyIds: myIds,
        seen,
      }),
    // myPostIds 는 mineKey 로 대표된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [times, mineKey, myIds, seen],
  );

  return { enabled, counts, newCounts, refresh: load, markSeen };
}
