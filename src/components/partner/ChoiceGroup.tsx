"use client";

type Tone = "confirmed" | "caution" | "limited";

const SELECTED: Record<Tone, string> = {
  confirmed: "bg-confirmed-soft text-confirmed-ink ring-confirmed",
  caution: "bg-caution-soft text-caution-ink ring-caution",
  limited: "bg-limited-soft text-limited-ink ring-limited",
};

export interface Choice<T extends string> {
  value: T;
  label: string;
  tone: Tone;
}

/**
 * 원탭 선택 버튼 묶음. 누르는 즉시 반영되고 저장 버튼이 없다.
 * 회색 트랙 위에 선택된 칸만 상태색으로 채운다.
 * 선택 여부를 색에만 맡기지 않고 체크 표시·굵은 글씨·테두리를 같이 쓴다.
 */
export function ChoiceGroup<T extends string>({
  label,
  choices,
  selected,
  onSelect,
}: {
  label: string;
  choices: Choice<T>[];
  selected: T | null;
  onSelect: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="mt-3.5 grid grid-cols-3 gap-1 rounded-[18px] bg-fill p-1">
      {choices.map((c) => {
        const on = c.value === selected;
        return (
          <button
            key={c.value}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(c.value)}
            className={`flex min-h-[56px] items-center justify-center break-keep rounded-field px-1.5 text-center text-[15px] leading-tight transition active:scale-[0.97] ${
              on ? `font-bold ring-1 ring-inset ${SELECTED[c.tone]}` : "font-semibold text-ink-muted"
            }`}
          >
            {on && (
              <span aria-hidden className="mr-1 shrink-0">
                ✓
              </span>
            )}
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
