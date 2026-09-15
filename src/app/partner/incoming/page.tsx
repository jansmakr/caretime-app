"use client";

import { StatusPill } from "@/components/common/StatusPill";
import { IncomingCounter } from "@/components/partner/IncomingCounter";
import { PartnerLoading } from "@/components/partner/PartnerLoading";
import { usePartner } from "@/features/partner/PartnerProvider";
import {
  INCOMING_OVERDUE_GRACE_MINUTES,
  describeVisit,
  isCountable,
  sortVisits,
  summarizeVisit,
} from "@/features/partner/service";
import type { IncomingVisit } from "@/features/partner/types";
import { VISIT_INTENT_DISCLAIMER } from "@/lib/copy";

export default function PartnerIncomingPage() {
  const { state, visits, incoming, now } = usePartner();
  if (!state || !incoming) return <PartnerLoading />;

  const sorted = sortVisits(visits, now);
  const active = sorted.filter((v) => isCountable(v, now));
  const closed = sorted.filter((v) => !isCountable(v, now));

  return (
    <main className="space-y-3 px-4 py-4">
      <section className="ct-card p-4">
        <h2 className="text-[16px] font-semibold">내원 예정 현황</h2>
        <p className="mt-1 text-[13px] text-ink-muted">
          누적 인원입니다. 현재 대기 인원과 합산하지 않습니다.
        </p>
        <IncomingCounter incoming={incoming} />
      </section>

      <VisitList title={`도착 예정 ${active.length}건`} visits={active} now={now} />
      {active.length === 0 && (
        <p className="ct-card p-6 text-center text-[14px] text-ink-muted">
          지금 도착 예정으로 공유된 건이 없습니다.
        </p>
      )}
      {closed.length > 0 && (
        <VisitList title="집계 제외" visits={closed} now={now} muted />
      )}

      <p className="px-1 text-[13px] leading-relaxed text-ink-faint">
        보호자 이름·연락처는 전달되지 않으며 CT 임시코드로만 구분합니다. 상황 요약은 보호자가
        입력한 내용 그대로이며 CareTime의 판단이 아닙니다. 도착 예정 시각이{" "}
        {INCOMING_OVERDUE_GRACE_MINUTES}분 넘게 지나면 집계에서 빠집니다. {VISIT_INTENT_DISCLAIMER}
      </p>
    </main>
  );
}

function VisitList({
  title,
  visits,
  now,
  muted = false,
}: {
  title: string;
  visits: IncomingVisit[];
  now: Date;
  muted?: boolean;
}) {
  if (visits.length === 0) return null;
  return (
    <section>
      <h3 className="px-1 pb-2 text-[14px] font-semibold text-ink-muted">{title}</h3>
      <ul className={`ct-card divide-y divide-line ${muted ? "opacity-80" : ""}`}>
        {visits.map((v) => {
          const d = describeVisit(v, now);
          return (
            <li key={v.code} className="px-4 py-3.5">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[16px] font-bold tracking-wide">{v.code}</span>
                <StatusPill tone={d.tone}>{d.badge}</StatusPill>
              </div>
              <p className="mt-1.5 break-keep text-[15px]">{summarizeVisit(v)}</p>
              <p className="mt-0.5 text-[13px] text-ink-muted">{d.eta}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
