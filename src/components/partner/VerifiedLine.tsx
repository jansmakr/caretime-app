import { formatAgo, formatClock, minutesSince } from "@/lib/freshness";

/** 병원 직원이 "방금 누른 게 반영됐는지"를 바로 볼 수 있게 확인시각을 항상 보여준다. */
export function VerifiedLine({ verifiedAt, now }: { verifiedAt: string; now: Date }) {
  return (
    <p className="shrink-0 text-[12.5px] font-medium text-ink-faint">
      마지막 확인 {formatAgo(minutesSince(verifiedAt, now))} · {formatClock(verifiedAt)}
    </p>
  );
}
