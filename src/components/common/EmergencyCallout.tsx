"use client";

import { useState } from "react";

/**
 * 119 버튼.
 *
 * 상단 우측은 모바일에서 오탭이 가장 잦은 위치인데 결과가 119 발신이다.
 * tel: 직결 대신 확인 한 단계를 둔다.
 */
export function EmergencyCallout() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 shrink-0 items-center rounded-pill bg-limited-soft px-3 text-[14px] font-bold text-limited-ink active:brightness-95"
      >
        119
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-label="119 전화 확인"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-app rounded-t-[28px] bg-surface px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" aria-hidden />
            <p className="text-[20px] font-bold">119에 전화할까요?</p>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">
              응급 상황이라고 판단되면 지금 바로 연락하세요. CareTime은 응급 여부를 판단하지
              않습니다.
            </p>
            <a href="tel:119" className="ct-primary mt-5 bg-limited active:bg-limited-ink">
              119 전화 걸기
            </a>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-2 flex h-12 w-full items-center justify-center rounded-field text-[15px] font-semibold text-ink-muted active:bg-fill"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </>
  );
}
