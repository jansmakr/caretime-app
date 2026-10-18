"use client";

import { useState } from "react";
import { Call119Confirm } from "@/components/common/Call119Confirm";

/**
 * 케타 — 현장톡의 안내 말풍선.
 *
 * ── AI 가 아니다 ────────────────────────────────────────────
 * 말풍선 모양이라 "물어보면 답해 주는 챗봇"으로 읽히기 쉽다. 그렇게 읽히면 보호자가
 * 케타에게 증상을 묻고 답을 기다린다 — 그 사이 시간이 간다. 그래서 이름 옆에
 * **"AI 아님"**을 붙이고, 첫 문장에서 정해진 안내만 한다고 말한다. 대답하는 기능은
 * 없고 앞으로도 이 자리에 붙이지 않는다(의료 판단을 하게 되는 자리다).
 *
 * ── 세 가지만 말한다 ────────────────────────────────────────
 *   1. 이웃 보호자가 답할 수 있지만 **답이 없을 수도 있다** — 급하면 119.
 *      "답해 줘요"로 쓰면 답을 기다리게 된다. 빈 방에서 기다리는 것이 가장 나쁘다
 *   2. 문제 있는 글은 [신고하기] — 신고 경로 고지(docs/LAUNCH-checklist)
 *   3. 위급하면 기다리지 말고 119 — 말이 아니라 **버튼**으로 둔다(원칙 6).
 *      누르면 머리띠 119 와 같은 확인 창을 거친다(Call119Confirm)
 *
 * 문장을 더 늘리지 않는다(원칙 4). 작성창의 안내를 줄이고 남은 말이 여기 왔다.
 * 접지 않는다 — 119 줄이 접혀 있으면 안 된다.
 */
export function KetaGuide() {
  const [confirming, setConfirming] = useState(false);

  return (
    <section aria-label="케타 안내" className="flex items-start gap-2.5">
      <span
        aria-hidden
        className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-soft text-[20px]"
      >
        🧭
      </span>

      <div className="min-w-0 flex-1 rounded-[20px] rounded-tl-[6px] bg-surface px-4 py-3 shadow-sm">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[16px] font-bold text-ink">케타</span>
          <span className="rounded-pill bg-fill px-2 py-0.5 text-[14px] font-semibold text-ink-muted">
            AI 아님 · 정해진 안내만 해요
          </span>
        </p>
        <p className="mt-1.5 break-keep text-[16px] leading-relaxed text-ink">
          이웃 보호자가 답할 수 있지만, 답이 늦거나 달리지 않을 수도 있어요. 급하면 기다리지 말고
          119에 전화하세요. 이상한 글은 글 아래 <b>신고하기</b>를 눌러 주세요.
        </p>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-3 flex min-h-[48px] w-full items-center justify-center gap-1.5 rounded-field bg-limited-soft px-3 text-center text-[16px] font-bold text-limited-ink active:brightness-95"
        >
          <span aria-hidden>🚑</span>
          위급하면 기다리지 말고 119 전화
        </button>
      </div>

      {confirming && <Call119Confirm onClose={() => setConfirming(false)} />}
    </section>
  );
}
