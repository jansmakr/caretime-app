"use client";

import { useState } from "react";

/**
 * 119 버튼.
 *
 * 상단 우측은 모바일에서 오탭이 가장 잦은 위치인데 결과가 119 발신이다.
 * tel: 직결 대신 확인 한 단계를 둔다.
 *
 * ── 숫자만 있으면 눌러서 뭐가 되는지 모른다 ─────────────────
 * 전에는 "119" 세 글자뿐이었다. 누르면 전화가 걸리는 자리인데 그렇게 보이지
 * 않았다 — 안내로도, 목록으로도 읽힌다. 수화기 그림을 붙여서 **전화라는 것을
 * 그림으로** 말한다(원칙 7: 급할 때 글자를 읽지 않는다).
 *
 * 글자를 "119 전화"로 늘리지 않았다. 머리띠가 좁고, 늘리면 제목이 밀린다.
 * 대신 aria-label 에 전체를 적어서 읽어 주는 쪽에는 말로 전한다.
 */
export function EmergencyCallout() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="119 전화 걸기"
        className="flex h-11 min-w-[44px] shrink-0 items-center gap-1.5 rounded-pill bg-limited-soft px-3.5 text-[14px] font-bold text-limited-ink active:brightness-95"
      >
        {/* 수화기. 글자를 못 읽는 상태에서도 전화로 읽힌다. */}
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M6.6 10.8c1.1 2.2 2.9 4 5.1 5.1l1.7-1.7c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.5.6.6 0 1 .4 1 1V19c0 .6-.4 1-1 1-8.3 0-15-6.7-15-15 0-.6.4-1 1-1h3.4c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.5.1.4 0 .8-.2 1l-2.1 1.3z" />
        </svg>
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
