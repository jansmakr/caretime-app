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
 * ── 세 가지만 말한다 (2026-10-24 문구 교체) ─────────────────
 *   1. 상황은 주변 분들이 눌러 준 **빠른 반응**(글 아래 칩)으로 알 수 있다.
 *      "이웃이 글로 답해 준다"는 사실과 달라 뺐다 — 답글은 아직 없고, 있어도 달린다는 보장이 없다
 *   2. **답이 없을 수도 있다** — 빈 방에서 기다리는 것이 가장 나쁘다
 *   3. 급하면 119 — 말이 아니라 **버튼**으로 둔다(원칙 6).
 *      누르면 머리띠 119 와 같은 확인 창을 거친다(Call119Confirm)
 *
 * 신고 안내 문장은 이 교체로 빠졌다. 신고 경로는 글마다 붙은 [신고하기] 버튼이 보여 준다.
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
          주변 분들이 눌러 준 빠른 반응으로 상황을 알 수 있어요. 답이 없을 수도 있어요. 급하면 119.
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
