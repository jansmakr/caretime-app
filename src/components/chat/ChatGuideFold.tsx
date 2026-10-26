"use client";

import { useEffect, useId, useState } from "react";
import { StageNotice } from "@/components/common/StageNotice";
import { LiveInfoNotice } from "@/components/common/LiveInfoNotice";
import { KetaGuide } from "@/components/chat/KetaGuide";

/**
 * 현장톡 맨 위 안내 세 덩어리(베타 · 유의 · 케타)를 한 줄로 접는다. **기본은 접힘.**
 *
 * 세 덩어리가 펼쳐져 있으면 360px 첫 화면을 다 차지해서 올라온 글이 한 줄도 안
 * 보였다(2026-10-24). 들어온 사람이 먼저 보려는 것은 글이다(원칙 1·4).
 *
 * 문구는 바꾸지 않는다 — 펼치면 세 컴포넌트를 **그대로** 그린다.
 * 119 는 접힌 안에만 있지 않다. 머리띠의 119 버튼(EmergencyCallout)이 항상 보이고,
 * 확인 창("119에 전화할까요?")도 그대로다. 그래서 케타의 119 줄을 접을 수 있다.
 *
 * 처음 온 사람에게만 줄 옆에 작은 점을 찍는다. 한 번 열면 이 브라우저에 기억하고
 * 지운다(localStorage). 저장소를 못 쓰면 점이 다시 보일 뿐이다 — 손해가 없다.
 * 점은 첫 그림에서 그리지 않는다(서버는 연 적이 있는지 모른다). 마운트 뒤에 판단한다.
 */

export const CHAT_GUIDE_OPENED_KEY = "caretime_chat_guide_opened";

function readOpened(): boolean {
  try {
    return window.localStorage.getItem(CHAT_GUIDE_OPENED_KEY) === "1";
  } catch {
    return false;
  }
}

function saveOpened(): void {
  try {
    window.localStorage.setItem(CHAT_GUIDE_OPENED_KEY, "1");
  } catch {
    // 기억하지 못해도 이번 화면에서는 점이 사라진다.
  }
}

export function ChatGuideFold() {
  const [open, setOpen] = useState(false);
  const [unseen, setUnseen] = useState(false);

  useEffect(() => {
    setUnseen(!readOpened());
  }, []);

  return (
    <ChatGuideFoldView
      open={open}
      unseen={unseen}
      onToggle={() => {
        if (!open) {
          saveOpened();
          setUnseen(false);
        }
        setOpen(!open);
      }}
    />
  );
}

/** 그리는 부분만. 테스트가 저장소 없이 접힘·펼침을 확인한다. */
export function ChatGuideFoldView({
  open,
  unseen,
  onToggle,
}: {
  open: boolean;
  unseen: boolean;
  onToggle: () => void;
}) {
  const panelId = useId();

  return (
    <section>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`안내 ${open ? "접기" : "보기"} — 베타 안내, 유의사항, 케타 안내${unseen ? " (아직 안 읽음)" : ""}`}
        className="flex min-h-[44px] w-full items-center gap-2 rounded-field bg-surface px-3.5 text-left text-[16px] font-semibold text-ink-muted active:brightness-95"
      >
        <span aria-hidden>ℹ️</span>
        <span className="flex-1">안내 {open ? "접기" : "보기"}</span>
        {unseen && <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-blue" />}
        <span aria-hidden>{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div id={panelId} className="mt-3 space-y-3">
          {/* StageNotice 는 머리띠 아래 자리용 여백(px-4)을 갖고 있다. 이 안에서는 빼 준다. */}
          <div className="-mx-4 -mt-1">
            <StageNotice />
          </div>
          <LiveInfoNotice />
          <KetaGuide />
        </div>
      )}
    </section>
  );
}
