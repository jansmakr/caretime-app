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

/** 표시용 합계 = 글이 들고 있던 값 + 이 브라우저가 누른 것. */
export function withMyReactions(base: ReactionCounts, mine: ReactionKey[]): ReactionCounts {
  const total = { ...base };
  for (const key of mine) total[key] += 1;
  return total;
}

export function totalReactions(counts: ReactionCounts): number {
  return REACTION_KEYS.reduce((sum, key) => sum + counts[key], 0);
}
