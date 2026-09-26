"use client";

/**
 * 대기 인원 Stepper.
 *
 * 세지 못한 것과 0명은 다른 사실이다. 그래서 null("확인 못 함")을 별도 상태로 둔다.
 * null 에서 + 를 누르면 1명부터 시작하고, 0명에서 - 를 누르면 다시 "확인 못 함"으로 돌아간다.
 * 추정값을 기본값으로 넣지 않는다 — 보호자가 세지 않은 숫자가 피드에 올라가면 안 된다.
 */
export function WaitingStepper({
  value,
  onChange,
  max,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
  max: number;
}) {
  const decrement = () => {
    if (value === null) return;
    onChange(value <= 0 ? null : value - 1);
  };
  const increment = () => {
    onChange(value === null ? 1 : Math.min(max, value + 1));
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-field bg-fill px-4 py-3">
      <div className="min-w-0">
        <p className="text-[14px] font-semibold">대기 인원</p>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-faint">
          직접 센 인원만 입력하세요. 모르면 비워 둡니다.
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={decrement}
          disabled={value === null}
          aria-label="대기 인원 줄이기"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-[20px] font-bold text-ink-muted
                     transition active:scale-[0.95] disabled:text-line disabled:active:scale-100"
        >
          −
        </button>
        <span
          aria-live="polite"
          className="min-w-[68px] text-center text-[16px] font-bold tabular-nums"
        >
          {value === null ? <span className="text-[13.5px] text-ink-faint">확인 못 함</span> : `${value}명`}
        </span>
        <button
          type="button"
          onClick={increment}
          disabled={value !== null && value >= max}
          aria-label="대기 인원 늘리기"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-[20px] font-bold text-blue-deep
                     transition active:scale-[0.95] disabled:text-line disabled:active:scale-100"
        >
          +
        </button>
      </div>
    </div>
  );
}
