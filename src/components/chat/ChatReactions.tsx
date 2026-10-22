"use client";

import { useEffect, useState } from "react";
import {
  REACTIONS,
  ownPostReactionLine,
  reactionNotice,
  totalReactions,
  type ReactionCounts,
  type ReactionKey,
} from "@/features/chat/reactions";
import type { ReactionOutcome } from "@/features/chat/repository";

/**
 * 원클릭 빠른 반응.
 *
 * 글을 쓰지 않고 터치 한 번으로 현장 상황을 거든다. 누르면 그 자리에서 숫자가 오른다.
 * 한 브라우저가 같은 반응을 한 번만 올릴 수 있고 **취소는 없다** — 다시 누르면
 * "이미 알려 주셨어요"라고만 말한다(store.pressReaction).
 *
 * 누르는 버튼으로 보여야 한다. 전에는 테두리 없는 회색 칩이라 옆의 주제 표시와
 * 구분이 안 됐고, 눌러 보는 사람이 없었다(2026-10-22). 그래서
 *   · 안 눌린 칩에도 테두리를 둔다
 *   · 눌린 칩은 색과 ✓ 로 표시한다 — 색만으로 말하지 않는다
 *   · 높이 44px, 칩 사이 8px(원칙 3), 글자 14px(원칙 2)
 *
 * 내 글에서는 누를 수 없다. 버튼이 아니라 글자로 그린다 — 눌러지는 것처럼 생겼는데
 * 안 눌리면 고장으로 읽힌다. 받은 반응만 보여 주고, 없으면 한 줄로 말한다.
 *
 * 숫자를 크게 쓰지 않는다. 이건 보호자들의 체감이고 병원이 센 값이 아니다.
 * 같은 카드 안에 "사용자 공유 · 미확인" 배지가 붙어 있는 이유와 같다.
 */

const ON: Record<(typeof REACTIONS)[number]["tone"], string> = {
  confirmed: "bg-confirmed-soft text-confirmed-ink ring-confirmed",
  blue: "bg-blue-soft text-blue-deep ring-blue",
  caution: "bg-caution-soft text-caution-ink ring-caution",
};

/** 누른 뒤 안내 한 줄이 남아 있는 시간. */
const NOTICE_MS = 4_000;

export function ChatReactions({
  counts,
  mine,
  readOnly = false,
  onPress,
}: {
  counts: ReactionCounts;
  mine: ReactionKey[];
  /** 내 글인가. 그러면 누를 수 없고 받은 반응만 보여 준다. */
  readOnly?: boolean;
  onPress: (key: ReactionKey) => Promise<ReactionOutcome>;
}) {
  if (readOnly) return <OwnPostReactions counts={counts} />;
  return <ReactionButtons counts={counts} mine={mine} onPress={onPress} />;
}

function OwnPostReactions({ counts }: { counts: ReactionCounts }) {
  const received = REACTIONS.filter((r) => counts[r.key] > 0);
  return (
    <div className="mt-2.5">
      <p className="text-[14px] leading-relaxed text-ink-muted">{ownPostReactionLine(counts)}</p>
      {totalReactions(counts) > 0 && (
        <ul aria-label="받은 반응" className="mt-1.5 flex flex-wrap gap-2">
          {received.map((reaction) => (
            <li
              key={reaction.key}
              className="inline-flex items-center gap-1.5 rounded-pill bg-fill px-3 py-1.5 text-[14px] font-semibold text-ink-muted"
            >
              <span aria-hidden>{reaction.emoji}</span>
              {reaction.label}
              <span className="tabular-nums">{counts[reaction.key]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReactionButtons({
  counts,
  mine,
  onPress,
}: {
  counts: ReactionCounts;
  mine: ReactionKey[];
  onPress: (key: ReactionKey) => Promise<ReactionOutcome>;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<ReactionKey | null>(null);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(id);
  }, [notice]);

  const press = async (key: ReactionKey) => {
    // 저장 중에 또 눌러도 한 번만 보낸다.
    if (busy === key) return;
    setBusy(key);
    try {
      setNotice(reactionNotice(await onPress(key)));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-2.5">
      <div role="group" aria-label="현장 상황 알리기" className="flex flex-wrap gap-2">
        {REACTIONS.map((reaction) => {
          const on = mine.includes(reaction.key);
          const count = counts[reaction.key];
          return (
            <button
              key={reaction.key}
              type="button"
              aria-pressed={on}
              aria-label={`${reaction.label}${count > 0 ? `, ${count}명이 알려 줌` : ""}`}
              onClick={() => void press(reaction.key)}
              className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-pill border px-3.5 text-[14px] transition active:scale-[0.96] ${
                on
                  ? `border-transparent font-bold ring-2 ring-inset ${ON[reaction.tone]}`
                  : "border-ink-faint bg-surface font-semibold text-ink active:bg-fill"
              }`}
            >
              <span aria-hidden>{on ? "✓" : reaction.emoji}</span>
              {reaction.label}
              {count > 0 && <span className="tabular-nums">{count}</span>}
            </button>
          );
        })}
      </div>
      <p
        role="status"
        aria-live="polite"
        className={notice ? "mt-1.5 text-[14px] font-semibold text-ink-muted" : "sr-only"}
      >
        {notice}
      </p>
    </div>
  );
}
