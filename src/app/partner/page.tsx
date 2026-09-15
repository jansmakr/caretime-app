"use client";

import Link from "next/link";
import { ContactStatusCard } from "@/components/partner/ContactStatusCard";
import { IncomingCounter } from "@/components/partner/IncomingCounter";
import { PartnerLoading } from "@/components/partner/PartnerLoading";
import { TodayHoursCard } from "@/components/partner/TodayHoursCard";
import { TodayStatusCard } from "@/components/partner/TodayStatusCard";
import { WaitingCard } from "@/components/partner/WaitingCard";
import { usePartner } from "@/features/partner/PartnerProvider";

export default function PartnerTodayPage() {
  const { state, incoming, now, source } = usePartner();
  if (!state || !incoming) return <PartnerLoading />;

  return (
    <main className="space-y-3 px-4 py-4">
      <TodayStatusCard state={state} now={now} />
      <TodayHoursCard key={state.hours.verifiedAt} state={state} now={now} />
      <ContactStatusCard state={state} now={now} />
      <WaitingCard state={state} now={now} />

      {/* 현재 대기와 다른 카드로 둔다. 두 숫자를 더한 값은 어디에도 표시하지 않는다. */}
      <section className="ct-card p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[16px] font-semibold">내원 예정</h2>
          <Link href="/partner/incoming" className="text-[14px] font-medium text-blue">
            목록 보기 ›
          </Link>
        </div>
        <p className="mt-1 text-[13px] text-ink-muted">
          CareTime에서 도착 예정을 공유한 인원입니다. 현재 대기에 포함되지 않습니다.
        </p>
        {source === "supabase" && (
          <p className="mt-2 rounded-xl bg-canvas px-3 py-2 text-[12px] leading-relaxed text-ink-muted">
            내원예정은 5단계(보호자 공유 기능)에서 실데이터로 연결됩니다. 지금 숫자는 데모 값입니다.
          </p>
        )}
        <IncomingCounter incoming={incoming} />
      </section>
    </main>
  );
}
