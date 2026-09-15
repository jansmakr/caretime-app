import type { AdmissionWindow } from "@/lib/hours";

const TONE = {
  confirmed: "bg-[#E8F6F0] text-[#14704B]",
  caution: "bg-[#FDF2E4] text-[#9C5C13]",
  limited: "bg-[#FBEBEA] text-[#93302B]",
  unverified: "bg-canvas text-ink-muted",
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
    <div className={`mt-3 rounded-xl px-3.5 py-3 ${TONE[headline.tone]}`}>
      <p className="text-[18px] font-bold leading-tight">{headline.big}</p>
      <p className="mt-1 text-[13px] leading-relaxed opacity-90">{headline.sub}</p>

      {w.closeLabel && (
        <div className="mt-2 flex justify-between gap-3 border-t border-black/[.07] pt-2 text-[13px]">
          <span>
            진료 종료 {w.closeLabel}
            {w.shortenedToday && (
              <span className="ml-1.5 rounded-pill bg-black/[.06] px-2 py-0.5 text-[12px] font-semibold">
                오늘 단축
              </span>
            )}
          </span>
          {w.shortenedToday && <span className="opacity-75">평소 {w.regularLabel}</span>}
        </div>
      )}
    </div>
  );
}
