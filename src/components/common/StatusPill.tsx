type Tone = "confirmed" | "caution" | "limited" | "unverified";

const TONE: Record<Tone, string> = {
  confirmed: "bg-[#E8F6F0] text-confirmed",
  caution: "bg-[#FDF2E4] text-caution",
  limited: "bg-[#FBEBEA] text-limited",
  unverified: "bg-canvas text-ink-muted",
};

/** 상태 표현은 4개 톤만 쓴다. 색을 늘리지 않는다. (기획안 53항) */
export function StatusPill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex rounded-pill px-2.5 py-1 text-[13px] font-medium ${TONE[tone]}`}>
      {children}
    </span>
  );
}
