import type { AdmissionWindow } from "@/lib/hours";

const TONE = {
  confirmed: "bg-confirmed-soft text-confirmed-ink",
  caution: "bg-caution-soft text-caution-ink",
  limited: "bg-limited-soft text-limited-ink",
  unverified: "bg-unverified-soft text-ink-muted",
} as const;

/**
 * 카드에서 가장 눈에 띄는 자리.
 * 진료 종료 시각은 아래 줄에 작게, 내원 마감은 위에 크게 둔다.
 */
export function AdmissionBlock({
  window: w,
  headline,
}: {
  window: AdmissionWindow;
  headline: { tone: keyof typeof TONE; big: string; sub: string };
}) {
  return (
    <div className={`mt-3 rounded-2xl px-4 py-3.5 ${TONE[headline.tone]}`}>
      <p className="text-[20px] font-bold leading-tight tracking-tight">{headline.big}</p>
      <p className="mt-1 text-[13.5px] leading-relaxed">{headline.sub}</p>

      {w.closeLabel && (
        <div className="mt-2.5 flex items-center justify-between gap-3 text-[13px] opacity-90">
          <span className="flex items-center gap-1.5">
            진료 종료 {w.closeLabel}
            {w.shortenedToday && (
              <span className="rounded-md bg-black/[.06] px-1.5 py-0.5 text-[11.5px] font-bold">오늘 단축</span>
            )}
          </span>
          {w.shortenedToday && <span>평소 {w.regularLabel}</span>}
        </div>
      )}
    </div>
  );
}
