"use client";

import { useEffect, useId, useRef } from "react";
import { LocateButton } from "@/components/chat/LocateButton";
import { SIDO_LIST } from "@/features/reports/regions";
import { type MyRegion } from "@/features/regions/sigungu";
import { type ViewSido } from "@/features/chat/viewRegion";

/**
 * 보는 지역 고르기 — 휴대폰에서는 아래에서 올라오는 시트, 넓은 화면에서는 가운데 창.
 *
 * 맨 위 "전국", 그 아래 시·도 17개. 고르면 **바로 닫히고** 목록이 바뀐다 — 확인 버튼을
 * 두면 결정을 두 번 하게 된다(원칙 1). 구는 여기서 묻지 않는다(features/chat/viewRegion).
 *
 * 접근성: 열리면 지금 고른 줄로 포커스가 간다. Tab 은 시트 안에서만 돈다. Esc 와
 * 바깥 누르기로 닫힌다. 닫히면 연 버튼으로 포커스를 돌려준다(부모가 한다).
 * 움직임은 넣지 않았다(원칙 9).
 */
export function RegionSheet({
  current,
  onSelect,
  onLocate,
  onClose,
}: {
  current: ViewSido;
  onSelect: (sido: ViewSido) => void;
  /** "내 위치로 다시 선택"으로 찾은 지역. */
  onLocate: (region: MyRegion) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 지금 고른 줄로 포커스. 스크린리더가 "선택됨"부터 읽는다.
    panel.current?.querySelector<HTMLElement>('[aria-current="true"]')?.focus();

    // 뒤 화면이 같이 굴러가지 않게.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !panel.current) return;
    const focusable = panel.current.querySelectorAll<HTMLElement>("button:not([disabled])");
    if (focusable.length === 0) return;
    const firstEl = focusable[0];
    const lastEl = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === firstEl) {
      event.preventDefault();
      lastEl.focus();
    } else if (!event.shiftKey && document.activeElement === lastEl) {
      event.preventDefault();
      firstEl.focus();
    }
  }

  const options: { sido: ViewSido; label: string }[] = [
    { sido: null, label: "전국" },
    ...SIDO_LIST.map((sido) => ({ sido, label: sido })),
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-[480px] flex-col rounded-t-[24px] bg-surface sm:rounded-[24px]"
      >
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
          <h2 id={titleId} className="text-[18px] font-bold">
            어느 지역 글을 볼까요?
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] px-2 text-[16px] font-semibold text-ink-muted"
          >
            닫기
          </button>
        </div>

        <div className="px-5">
          <LocateButton
            label="내 위치로 다시 선택"
            onPick={(region) => {
              onLocate(region);
              onClose();
            }}
          />
        </div>

        <ul aria-label="시·도 목록" className="mt-3 overflow-y-auto px-3 pb-5">
          {options.map((option) => {
            const selected = option.sido === current;
            return (
              <li key={option.label}>
                <button
                  type="button"
                  aria-current={selected ? "true" : undefined}
                  onClick={() => {
                    onSelect(option.sido);
                    onClose();
                  }}
                  className={`flex min-h-[48px] w-full items-center justify-between rounded-field px-3 text-left text-[17px] ${
                    selected ? "bg-blue-soft font-bold text-blue-deep" : "font-semibold text-ink"
                  }`}
                >
                  <span>{option.label}</span>
                  {selected && (
                    <span className="text-[16px]">
                      ✓<span className="sr-only"> 지금 보는 지역</span>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
