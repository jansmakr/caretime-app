type Tone = "confirmed" | "caution" | "limited" | "unverified";

const TONE: Record<Tone, string> = {
  confirmed: "bg-confirmed-soft text-confirmed-ink",
  caution: "bg-caution-soft text-caution-ink",
  limited: "bg-limited-soft text-limited-ink",
  unverified: "bg-unverified-soft text-unverified-ink",
};

/** 상태 표현은 4개 톤만 쓴다. 색을 늘리지 않는다. (기획안 53항) */
export function StatusPill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex rounded-pill px-2.5 py-1 text-[13px] font-semibold ${TONE[tone]}`}>
      {children}
    </span>
  );
}
