"use client";

type Tone = "confirmed" | "caution" | "limited";

const SELECTED: Record<Tone, string> = {
  confirmed: "border-confirmed bg-[#E8F6F0] text-[#14704B]",
  caution: "border-caution bg-[#FDF2E4] text-[#9C5C13]",
  limited: "border-limited bg-[#FBEBEA] text-[#93302B]",
};

export interface Choice<T extends string> {
  value: T;
  label: string;
  tone: Tone;
}

/**
 * 원탭 선택 버튼 묶음. 누르는 즉시 반영되고 저장 버튼이 없다.
 * 선택 여부를 색에만 맡기지 않고 체크 표시와 굵은 글씨를 같이 쓴다.
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
    <div role="group" aria-label={label} className="mt-3 grid grid-cols-3 gap-2">
      {choices.map((c) => {
        const on = c.value === selected;
        return (
          <button
            key={c.value}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(c.value)}
            className={`flex min-h-[56px] items-center justify-center break-keep rounded-card border px-1.5 text-center text-[15px] leading-tight transition-colors ${
              on
                ? `font-semibold ${SELECTED[c.tone]}`
                : "border-line bg-surface text-ink active:bg-canvas"
            }`}
          >
            {on && <span aria-hidden className="mr-1">✓</span>}
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
