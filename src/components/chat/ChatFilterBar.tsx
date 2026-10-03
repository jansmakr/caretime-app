"use client";

import { useState } from "react";
import { RegionPicker } from "@/components/chat/RegionPicker";
import { regionLabel, type MyRegion } from "@/features/regions/sigungu";
import { type ChatFilter } from "@/features/chat/types";

/**
 * 어디를 볼까 · 언제까지 볼까.
 *
 * 방은 하나다(전국). 여기서 **좁혀 본다**.
 *   · 전국 / 내 지역    — 지역
 *   · 최근 1개월 / 전체 — 기간
 *
 * 두 줄로 끝낸다. 전에는 시/도·시/군/구·병원 드롭다운 셋이 있었고, 무엇이 걸려
 * 있는지 읽어야 알 수 있었다. 토글은 눌린 것이 보인다(원칙 4·10).
 *
 * "지역 바꾸기"는 평소 접혀 있다. 한 번 고르면 거의 바꾸지 않는 값이라, 늘 펼쳐
 * 두면 화면의 결정이 하나 늘어난다.
 */
export function ChatFilterBar({
  filter,
  myRegion,
  onChange,
  onChangeRegion,
}: {
  filter: ChatFilter;
  /** 브라우저에 기억된 내 지역. 없으면 "내 지역 보기"를 그리지 않는다. */
  myRegion: MyRegion | null;
  onChange: (next: ChatFilter) => void;
  onChangeRegion: (next: MyRegion) => void;
}) {
  const [editing, setEditing] = useState(false);
  const mine = filter.sido !== null;

  return (
    <section className="ct-card p-4">
      {myRegion && (
        <div role="group" aria-label="보는 지역" className="grid grid-cols-2 gap-1 rounded-[16px] bg-fill p-1">
          <Toggle
            on={!mine}
            onClick={() => onChange({ ...filter, sido: null, sigungu: null })}
            label="전국"
          />
          <Toggle
            on={mine}
            onClick={() =>
              onChange({ ...filter, sido: myRegion.sido, sigungu: myRegion.sigungu })
            }
            label={regionLabel(myRegion)}
          />
        </div>
      )}

      <div
        role="group"
        aria-label="보는 기간"
        className={`grid grid-cols-2 gap-1 rounded-[16px] bg-fill p-1 ${myRegion ? "mt-2" : ""}`}
      >
        <Toggle
          on={filter.recentOnly}
          onClick={() => onChange({ ...filter, recentOnly: true })}
          label="최근 1개월"
        />
        <Toggle
          on={!filter.recentOnly}
          onClick={() => onChange({ ...filter, recentOnly: false })}
          label="이전 글도 보기"
        />
      </div>

      <div className="mt-2.5">
        {editing ? (
          <>
            <RegionPicker
              region={myRegion}
              onChange={(next) => {
                onChangeRegion(next);
                // 바꾸는 중에 보고 있던 것이 '내 지역'이면 새 지역으로 따라간다.
                if (mine) onChange({ ...filter, sido: next.sido, sigungu: next.sigungu });
              }}
            />
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="mt-2 min-h-[44px] w-full text-[13.5px] font-semibold text-ink-muted"
            >
              닫기
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="min-h-[44px] text-[13.5px] font-semibold text-blue"
          >
            {myRegion ? "내 지역 바꾸기" : "내 지역 고르기"}
          </button>
        )}
      </div>
    </section>
  );
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`flex min-h-[48px] items-center justify-center break-keep rounded-field px-2 text-center text-[14.5px] transition active:scale-[0.98] ${
        on ? "bg-blue-soft font-bold text-blue-deep ring-1 ring-inset ring-blue" : "font-semibold text-ink-muted"
      }`}
    >
      {label}
    </button>
  );
}
