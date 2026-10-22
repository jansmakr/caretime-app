"use client";

import { useEffect, useState } from "react";
import { ROOM_REACTION_GUIDE } from "@/features/chat/reactions";

/**
 * 방 위쪽에 한 번만 두는 빠른 반응 안내.
 *
 * 글 아래 칩이 누르는 것인지 몰라 아무도 누르지 않았다(2026-10-22). 카드마다 한 줄씩
 * 붙이면 모든 카드가 길어지므로(원칙 4) 방에 한 번 말하고, 읽은 사람은 닫을 수 있게 한다.
 *
 * 닫은 것은 이 브라우저에만 기억한다(localStorage). 화면 편의일 뿐이라 서버에 두지 않는다.
 * 저장소를 못 쓰면(사생활 보호 모드 등) 다시 보일 뿐이다 — 안내가 한 번 더 나오는 것은
 * 손해가 없다.
 *
 * 첫 그림에서는 그리지 않는다. 서버는 닫았는지 모르고, 닫은 사람에게 잠깐 보였다가
 * 사라지면 화면이 튄다. 마운트 뒤에 판단한다.
 */

export const REACTION_GUIDE_KEY = "caretime_reaction_guide_closed";

function readClosed(): boolean {
  try {
    return window.localStorage.getItem(REACTION_GUIDE_KEY) === "1";
  } catch {
    return false;
  }
}

function saveClosed(): void {
  try {
    window.localStorage.setItem(REACTION_GUIDE_KEY, "1");
  } catch {
    // 기억하지 못해도 이번 화면에서는 닫힌다.
  }
}

export function ReactionGuide() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(!readClosed());
  }, []);

  if (!visible) return null;
  return (
    <ReactionGuideCard
      onClose={() => {
        saveClosed();
        setVisible(false);
      }}
    />
  );
}

/** 그리는 부분만. 테스트가 저장소 없이 문구를 확인한다. */
export function ReactionGuideCard({ onClose }: { onClose: () => void }) {
  return (
    <div className="mt-2 flex items-start gap-2 rounded-field bg-blue-soft py-1.5 pl-3.5 pr-1">
      <p className="flex-1 py-1.5 text-[16px] leading-relaxed text-blue-deep">{ROOM_REACTION_GUIDE}</p>
      <button
        type="button"
        aria-label="안내 닫기"
        onClick={onClose}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-pill text-[18px] font-bold text-blue-deep active:bg-surface"
      >
        <span aria-hidden>✕</span>
      </button>
    </div>
  );
}
