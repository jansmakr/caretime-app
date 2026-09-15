"use client";

import { VerifiedLine } from "@/components/partner/VerifiedLine";
import { usePartner } from "@/features/partner/PartnerProvider";
import { WAITING_MAX } from "@/features/partner/service";
import type { PartnerState } from "@/features/partner/types";

/** 현재 대기 스테퍼. 원내 대기 인원만 센다. 내원예정은 별도 카드다. (기획안 26항) */
export function WaitingCard({ state, now }: { state: PartnerState; now: Date }) {
  const { stepWaitingHeadcount } = usePartner();
  const count = state.waiting.headcount ?? 0;

  return (
    <section className="ct-card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="ct-section-title">현재 대기</h2>
        <VerifiedLine verifiedAt={state.waiting.verifiedAt} now={now} />
      </div>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-faint">
        지금 원내에서 기다리는 환자 수입니다. 내원예정 인원은 포함하지 않습니다.
      </p>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => stepWaitingHeadcount(-1)}
          disabled={count <= 0}
          aria-label="대기 1명 줄이기"
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-fill text-[26px] font-medium text-ink transition active:scale-95 active:bg-line disabled:text-line disabled:active:scale-100"
        >
          −
        </button>
        <output aria-live="polite" className="flex-1 text-center">
          <span className="text-[40px] font-extrabold leading-none tracking-tight">{count}</span>
          <span className="ml-1 text-[17px] font-semibold text-ink-faint">명</span>
        </output>
        <button
          type="button"
          onClick={() => stepWaitingHeadcount(1)}
          disabled={count >= WAITING_MAX}
          aria-label="대기 1명 늘리기"
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-fill text-[26px] font-medium text-ink transition active:scale-95 active:bg-line disabled:text-line disabled:active:scale-100"
        >
          +
        </button>
      </div>
    </section>
  );
}
