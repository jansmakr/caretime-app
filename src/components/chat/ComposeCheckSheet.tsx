"use client";

import { useState } from "react";
import { Call119Confirm } from "@/components/common/Call119Confirm";
import type { ComposeCheck } from "@/features/chat/composeCheck";

/**
 * 올리기 직전의 확인 창. **두 경우에만 뜬다** — 전화번호, 진단 요구
 * (features/chat/composeCheck).
 *
 * 119 확인 창(EmergencyCallout)과 같은 아래쪽 시트다. 같은 화면에서 창 모양이
 * 둘이면 "이건 또 뭐지"를 한 번 더 읽는다.
 *
 * 주 버튼은 하나다(원칙 1).
 *   phone      → [번호 지우기]. 지우고 **입력칸으로 돌아간다.** 바로 올리지 않는다 —
 *                지운 뒤 문장이 어색해졌는지 본인이 읽어야 한다.
 *   diagnosis  → [그대로 올리기]. 문 연 곳을 묻는 글이 걸린 것일 수 있어서 막지 않는다.
 *                대신 위급할 때의 길(119)을 같은 창 안에 둔다. 119 는 바로 걸리지 않고
 *                "119에 전화할까요?" 확인을 거친다(Call119Confirm, 머리띠 119 와 같다).
 */
export function ComposeCheckSheet({
  check,
  onStripPhone,
  onSendAnyway,
  onClose,
}: {
  check: ComposeCheck;
  onStripPhone: () => void;
  onSendAnyway: () => void;
  onClose: () => void;
}) {
  const [confirming119, setConfirming119] = useState(false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="compose-check-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-app rounded-t-[28px] bg-surface px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" aria-hidden />

        {check === "phone" ? (
          <>
            <p id="compose-check-title" className="break-keep text-[20px] font-bold">
              전화번호가 적혀 있어요
            </p>
            <p className="mt-2 break-keep text-[16px] leading-relaxed text-ink-muted">
              글은 누구나 읽습니다. 개인 번호는 올라가지 않아요. 병원 이름을 적어 주시면 충분합니다.
            </p>
            <button type="button" onClick={onStripPhone} className="ct-primary mt-5">
              번호 지우기
            </button>
            <button
              type="button"
              onClick={onSendAnyway}
              className="mt-2 flex h-12 w-full items-center justify-center rounded-field text-[16px] font-semibold text-ink-muted active:bg-fill"
            >
              병원 대표번호예요 · 그대로 올리기
            </button>
          </>
        ) : (
          <>
            <p id="compose-check-title" className="break-keep text-[20px] font-bold">
              여기서는 진단을 받을 수 없어요
            </p>
            <p className="mt-2 break-keep text-[16px] leading-relaxed text-ink-muted">
              글을 읽는 분들은 의사가 아닙니다. 증상은 병원에 전화로 물어보세요.
            </p>
            <button
              type="button"
              onClick={() => setConfirming119(true)}
              className="mt-4 flex min-h-[48px] w-full items-center justify-center rounded-field bg-limited-soft px-4 text-[17px] font-bold text-limited-ink active:brightness-95"
            >
              위급하면 지금 119 전화
            </button>
            <button type="button" onClick={onSendAnyway} className="ct-primary mt-3">
              그대로 올리기
            </button>
          </>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-2 flex h-12 w-full items-center justify-center rounded-field text-[16px] font-semibold text-ink-muted active:bg-fill"
        >
          고쳐 쓰기
        </button>
      </div>

      {confirming119 && <Call119Confirm onClose={() => setConfirming119(false)} />}
    </div>
  );
}
