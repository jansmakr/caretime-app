/**
 * 답글 — 화면 문구와 "새 답글" 판정.
 *
 * "새 답글"은 **브라우저에서** 센다(2026-10-22 결정). 서버에 "언제 읽었나"를 두지 않는다 —
 * 그건 이용 기록을 새로 보관하는 일이다. 쓰는 값은 셋뿐이다:
 *   · 내 글 id     — /api/guest 가 본인에게만 준다(이미 있던 값)
 *   · 답글 시각    — 답글 공개 뷰에 있는 값
 *   · 마지막으로 본 답글 시각 — 이 브라우저의 localStorage
 *
 * 마지막으로 본 시각은 **서버 시각(답글의 created_at)** 으로 적는다. 휴대폰 시계가 늦으면
 * 지금 시각으로 적은 값이 방금 본 답글보다 앞서서, 본 답글이 다시 "새 답글"이 된다.
 *
 * 저장소가 지워지면 모든 답글이 새 답글로 보인다. 반대(못 본 답글을 본 것으로)보다 낫다.
 */

export const REPLY_SEEN_KEY = "caretime_reply_seen";

/** 기억하는 글 수. 넘치면 가장 오래 본 것부터 버린다. */
export const REPLY_SEEN_MAX = 300;

export type ReplySeen = Record<string, string>;

export function readReplySeen(): ReplySeen {
  try {
    const raw = window.localStorage.getItem(REPLY_SEEN_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const seen: ReplySeen = {};
    for (const [id, at] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof at === "string" && !Number.isNaN(Date.parse(at))) seen[id] = at;
    }
    return seen;
  } catch {
    return {};
  }
}

/** 이 글의 답글을 latestAt 까지 봤다. 더 이른 값으로 되돌리지 않는다. */
export function withReplySeen(seen: ReplySeen, postId: string, latestAt: string): ReplySeen {
  const previous = seen[postId];
  if (previous && Date.parse(previous) >= Date.parse(latestAt)) return seen;
  const next: ReplySeen = { ...seen, [postId]: latestAt };
  const ids = Object.keys(next);
  if (ids.length > REPLY_SEEN_MAX) {
    ids
      .sort((a, b) => Date.parse(next[a]) - Date.parse(next[b]))
      .slice(0, ids.length - REPLY_SEEN_MAX)
      .forEach((id) => delete next[id]);
  }
  return next;
}

export function saveReplySeen(seen: ReplySeen): void {
  try {
    window.localStorage.setItem(REPLY_SEEN_KEY, JSON.stringify(seen));
  } catch {
    // 기억하지 못하면 다음에 다시 새 답글로 보일 뿐이다.
  }
}

/**
 * 내 글별 새 답글 수. 내가 쓴 답글은 세지 않는다(내 글에 내가 단 답은 새 소식이 아니다).
 * 0 인 글은 결과에 넣지 않는다.
 */
export function countNewReplies(input: {
  times: { id: string; parentId: string; createdAt: string }[];
  myPostIds: ReadonlySet<string>;
  myReplyIds: ReadonlySet<string>;
  seen: ReplySeen;
}): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const reply of input.times) {
    if (!input.myPostIds.has(reply.parentId)) continue;
    if (input.myReplyIds.has(reply.id)) continue;
    const seenAt = input.seen[reply.parentId];
    if (seenAt && Date.parse(reply.createdAt) <= Date.parse(seenAt)) continue;
    counts[reply.parentId] = (counts[reply.parentId] ?? 0) + 1;
  }
  return counts;
}

// ─── 문구 ──────────────────────────────────────────────────

/** 카드 아래쪽 줄의 버튼. 새 줄을 만들지 않고 신고·공유와 같은 줄에 둔다(원칙 4). */
export function replyButtonLabel(count: number): string {
  return `답글 ${count}개`;
}

export function newRepliesLabel(count: number): string {
  return `새 답글 ${count}개`;
}

/** 펼쳤는데 답글이 없을 때. 카드에는 붙이지 않는다 — 펼친 뒤에만. */
export const NO_REPLIES = "첫 답글을 남겨 주세요";
export const REPLIES_LOADING = "답글을 불러오는 중이에요";
export const REPLIES_FAILED = "답글을 불러오지 못했어요. 잠시 후 다시 열어 주세요.";
