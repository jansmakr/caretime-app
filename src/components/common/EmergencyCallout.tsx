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
        className="rounded-pill border border-limited/30 px-3 py-1 text-[14px] font-semibold text-limited"
      >
        119
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-6"
          role="dialog"
          aria-modal="true"
          aria-label="119 전화 확인"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-app rounded-card bg-surface p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[17px] font-semibold">119에 전화할까요?</p>
            <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
              응급 상황이라고 판단되면 지금 바로 연락하세요. CareTime은 응급 여부를 판단하지
              않습니다.
            </p>
            <a href="tel:119" className="ct-primary mt-4 bg-limited active:bg-[#A93630]">
              119 전화 걸기
            </a>
            <button type="button" onClick={() => setOpen(false)} className="ct-secondary mt-2 w-full">
              닫기
            </button>
          </div>
        </div>
      )}
    </>
  );
}
