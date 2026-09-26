"use client";

import { REACTIONS, type ReactionCounts, type ReactionKey } from "@/features/chat/reactions";

/**
 * 원클릭 빠른 반응.
 *
 * 글을 쓰지 않고 터치 한 번으로 현장 상황을 거든다. 누르면 그 자리에서 숫자가 오른다.
 * 한 브라우저가 같은 반응을 한 번만 올릴 수 있고, 다시 누르면 내린다(store 가 판정).
 *
 * 숫자를 크게 쓰지 않는다. 이건 보호자들의 체감이고 병원이 센 값이 아니다.
 * 같은 카드 안에 "사용자 공유 · 미확인" 배지가 붙어 있는 이유와 같다.
 */

const ON: Record<(typeof REACTIONS)[number]["tone"], string> = {
  confirmed: "bg-confirmed-soft text-confirmed-ink ring-confirmed",
  blue: "bg-blue-soft text-blue-deep ring-blue",
  caution: "bg-caution-soft text-caution-ink ring-caution",
};

export function ChatReactions({
  counts,
  mine,
  onToggle,
}: {
  counts: ReactionCounts;
  mine: ReactionKey[];
  onToggle: (key: ReactionKey) => void;
}) {
  return (
    <div role="group" aria-label="빠른 반응" className="mt-2.5 flex flex-wrap gap-1.5">
      {REACTIONS.map((reaction) => {
        const on = mine.includes(reaction.key);
        const count = counts[reaction.key];
        return (
          <button
            key={reaction.key}
            type="button"
            aria-pressed={on}
            aria-label={`${reaction.label}${on ? " 취소" : ""}`}
            onClick={() => onToggle(reaction.key)}
            className={`inline-flex items-center gap-1 rounded-pill px-2.5 py-1.5 text-[12.5px] transition active:scale-[0.96] ${
              on ? `font-bold ring-1 ring-inset ${ON[reaction.tone]}` : "bg-fill font-semibold text-ink-muted"
            }`}
          >
            <span aria-hidden>{reaction.emoji}</span>
            {reaction.label}
            {count > 0 && <span className="tabular-nums">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
