"use client";

import { useRef, useState } from "react";
import { LocateButton } from "@/components/chat/LocateButton";
import { RegionSheet } from "@/components/chat/RegionSheet";
import { type MyRegion } from "@/features/regions/sigungu";
import { type ViewSido } from "@/features/chat/viewRegion";

/**
 * 현장톡 맨 위 한 줄 — "📍 서울 · 지역 바꾸기 ›" (2026-10-15).
 *
 * 전에는 지역 탭(전국 / 서울 강서구)과 기간 탭(최근 1개월 / 이전 글도 보기)이 두 줄로
 * 있었다. 글을 읽으러 온 사람이 먼저 두 번 판단해야 했다(원칙 1·4). 지금은 지금 보는
 * 지역 한 줄이고, 바꾸고 싶을 때만 누른다. 기간은 목록 맨 아래 "이전 글 더 보기"다.
 *
 * 전국으로 시작했으면 바로 아래에 "📍 내 위치로 보기"를 눈에 띄게 한 번 더 둔다 —
 * 처음 온 사람도 시트를 열지 않고 한 번에 내 지역을 본다. 권한 창은 **이 버튼을
 * 누른 뒤에만** 뜬다(방침 1-5).
 */
export function ChatRegionBar({
  label,
  current,
  showLocate,
  onSelect,
  onLocate,
}: {
  /** 지금 보는 지역 이름. "전국" · "서울" · (링크로 들어온 경우) "서울 강서구". */
  label: string;
  current: ViewSido;
  /** 전국으로 시작했는가. 그때만 "내 위치로 보기"를 꺼내 둔다. */
  showLocate: boolean;
  onSelect: (sido: ViewSido) => void;
  onLocate: (region: MyRegion) => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  function close() {
    setOpen(false);
    // 시트를 닫으면 연 자리로 포커스를 돌려준다. 키보드 사용자가 길을 잃지 않게.
    requestAnimationFrame(() => trigger.current?.focus());
  }

  return (
    <section className="ct-card px-4 py-2">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`지금 보는 지역 ${label}. 지역 바꾸기`}
        onClick={() => setOpen(true)}
        className="flex min-h-[48px] w-full items-center gap-1.5 text-left text-[17px]"
      >
        <span aria-hidden>📍</span>
        <span className="font-bold text-ink">{label}</span>
        <span className="text-ink-muted">·</span>
        <span className="font-semibold text-blue">지역 바꾸기 ›</span>
      </button>

      {showLocate && (
        <div className="pb-2">
          <LocateButton label="📍 내 위치로 보기" variant="prominent" onPick={onLocate} />
        </div>
      )}

      {open && (
        <RegionSheet current={current} onSelect={onSelect} onLocate={onLocate} onClose={close} />
      )}
    </section>
  );
}
