/**
 * 원클릭 빠른 반응.
 *
 * 글을 쓰지 않고 터치 한 번으로 현장 상황을 거드는 자리다. 세 개로 고정한다 —
 * 늘리면 "무엇을 누르는 버튼인지" 고민하는 시간이 생기고, 그 순간 원클릭이 아니게 된다.
 *
 * 반응은 사용자 공유 계층이다. 병원이 확인한 값(HospitalWaitingStatus 등)으로
 * 올라가는 경로가 없고, 화면에서도 병원 확인 정보와 같은 자리에 두지 않는다.
 * "대기 3명 이하"는 누군가의 체감일 뿐 병원이 센 숫자가 아니다.
 */

export type ReactionKey = "low_wait" | "doctor_present" | "closed";

export interface ReactionMeta {
  key: ReactionKey;
  label: string;
  emoji: string;
  /** 눌렸을 때의 색. 상태색 4개 안에서만 고른다. (기획안 53항) */
  tone: "confirmed" | "blue" | "caution";
}

export const REACTIONS: ReactionMeta[] = [
  { key: "low_wait", label: "대기 3명 이하", emoji: "👍", tone: "confirmed" },
  { key: "doctor_present", label: "선생님 계심", emoji: "🩺", tone: "blue" },
  { key: "closed", label: "접수 마감됨", emoji: "⚠️", tone: "caution" },
];

export const REACTION_KEYS: ReactionKey[] = REACTIONS.map((r) => r.key);

export type ReactionCounts = Record<ReactionKey, number>;

export const ZERO_REACTIONS: ReactionCounts = { low_wait: 0, doctor_present: 0, closed: 0 };

export function reactionMeta(key: ReactionKey): ReactionMeta {
  return REACTIONS.find((r) => r.key === key) ?? REACTIONS[0];
}

/**
 * 표시용 합계 = 서버가 센 값 + 서버가 아직 모르는 내 반응.
 *
 * "이 브라우저가 누른 것 전부"를 더하면 안 된다. 서버가 돌려준 내 반응은 이미 서버 값에
 * 들어 있어서, 새로고침할 때마다 숫자가 하나씩 부푼다.
 */
export function withPendingReactions(base: ReactionCounts, pending: ReactionKey[]): ReactionCounts {
  const total = { ...base };
  for (const key of pending) total[key] += 1;
  return total;
}

export function totalReactions(counts: ReactionCounts): number {
  return REACTION_KEYS.reduce((sum, key) => sum + counts[key], 0);
}

// ─── 화면 문구 ─────────────────────────────────────────────
/*
 * 칩이 무엇인지 말하는 문구는 방 위쪽에 **한 번만** 둔다(2026-10-22 결정).
 * 카드마다 한 줄씩 붙이면 모든 카드가 한 줄씩 길어진다(원칙 4).
 * 내 글에만 한 줄이 붙는다 — 그 칩은 누를 수 없고, 왜 못 누르는지 말해야 한다.
 */

/** 방 위쪽 안내. 닫을 수 있다(components/chat/ReactionGuide). */
export const ROOM_REACTION_GUIDE =
  "글 아래 버튼은 현장 상황을 알려 주는 빠른 반응이에요. 아시면 눌러 주세요.";

/** 내 글: 받은 반응이 있을 때. */
export const OWN_POST_REACTION_GUIDE = "다른 분들이 눌러 준 반응이에요";

/** 내 글: 받은 반응이 없을 때. 0 을 세 개 늘어놓지 않고 한 줄로 말한다(원칙 8). */
export const OWN_POST_NO_REACTION = "아직 다른 분들의 반응이 없어요";

/** 내 글 칩 위의 한 줄. */
export function ownPostReactionLine(counts: ReactionCounts): string {
  return totalReactions(counts) > 0 ? OWN_POST_REACTION_GUIDE : OWN_POST_NO_REACTION;
}

/**
 * 누른 뒤 칩 아래에 잠깐 보이는 한 줄. 저장되면 말하지 않는다 — 칩이 눌린 것으로 바뀐
 * 것이 대답이다. 안 된 경우에만 무엇을 하면 되는지 말한다.
 */
export function reactionNotice(
  outcome: "saved" | "already" | "own_post" | "rate_limited" | "failed",
): string | null {
  switch (outcome) {
    case "saved":
      return null;
    case "already":
      return "이미 알려 주셨어요";
    case "own_post":
      return "내 글에는 누를 수 없어요";
    case "rate_limited":
      return "너무 자주 누르셨어요. 잠시 후 다시 눌러 주세요.";
    case "failed":
      return "보내지 못했어요. 잠시 후 다시 눌러 주세요.";
  }
}
