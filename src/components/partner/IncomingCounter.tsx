import type { IncomingAggregate } from "@/features/hospitals/types";

/**
 * 내원예정 카운터. 병원 화면이므로 정확한 숫자를 그대로 쓴다.
 * 현재 대기 인원과 같은 카드에 두지 않고, 합계 칸도 만들지 않는다. (기획안 26항)
 */
export function IncomingCounter({ incoming }: { incoming: IncomingAggregate }) {
  const cells = [
    { label: "10분 이내", value: incoming.within10 },
    { label: "30분 이내", value: incoming.within30 },
    { label: "1시간 이내", value: incoming.within60 },
  ];

  return (
    <dl className="mt-3 grid grid-cols-3 gap-2">
      {cells.map((c) => (
        <div key={c.label} className="rounded-xl bg-blue-soft px-2 py-3 text-center">
          <dt className="text-[13px] text-ink-muted">{c.label}</dt>
          <dd className="mt-1 text-[26px] font-bold leading-none text-blue">
            {c.value}
            <span className="ml-0.5 text-[14px] font-medium">명</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
