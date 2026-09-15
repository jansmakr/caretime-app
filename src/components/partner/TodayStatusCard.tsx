"use client";

import { StatusPill } from "@/components/common/StatusPill";
import { ChoiceGroup, type Choice } from "@/components/partner/ChoiceGroup";
import { VerifiedLine } from "@/components/partner/VerifiedLine";
import { REASON_TEXT } from "@/features/hospitals/labels";
import type { LimitReasonCode } from "@/features/hospitals/types";
import { usePartner } from "@/features/partner/PartnerProvider";
import type { PartnerState, TodayMode } from "@/features/partner/types";
import { describeStatus, formatClock, isExpired } from "@/lib/freshness";

const MODES: Choice<TodayMode>[] = [
  { value: "same_as_yesterday", label: "어제와 동일", tone: "confirmed" },
  { value: "limited", label: "일부 제한", tone: "caution" },
  { value: "difficult", label: "오늘 어려움", tone: "limited" },
];

/** "직접 입력"은 자유문구 검수가 필요해 2단계 이후에 연다. */
const REASONS = (Object.keys(REASON_TEXT) as LimitReasonCode[]).filter((c) => c !== "custom");

export function TodayStatusCard({ state, now }: { state: PartnerState; now: Date }) {
  const { confirmSameAsYesterday, setTodayMode, setLimitReason } = usePartner();
  const live = state.liveStatus;
  const expired = isExpired(live, now);
  const shown = describeStatus(live, now);
  const restricted = state.mode === "limited" || state.mode === "difficult";

  const select = (mode: TodayMode) => {
    if (mode === "same_as_yesterday") confirmSameAsYesterday();
    else setTodayMode(mode);
  };

  return (
    <section className="ct-card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="ct-section-title">오늘 진료상태</h2>
        <VerifiedLine verifiedAt={live.verifiedAt} now={now} />
      </div>

      {expired && (
        <p className="mt-3 flex gap-2 rounded-field bg-caution-soft px-3.5 py-3 text-[14px] leading-relaxed text-caution-ink">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="mt-0.5 shrink-0">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
            <path d="M12 7.5v5.5M12 16.2v.3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          <span>
            오늘 상태를 아직 확인하지 않았습니다. 보호자 화면에는 &lsquo;현재 상태 확인 필요&rsquo;로
            표시되고 있습니다.
          </span>
        </p>
      )}

      <ChoiceGroup label="오늘 진료상태" choices={MODES} selected={state.mode} onSelect={select} />

      {state.mode === "same_as_yesterday" && (
        <p className="mt-3 text-[14px] leading-relaxed text-ink-muted">
          어제 상태와 내원 마감을 그대로 유지하고 {formatClock(live.verifiedAt)}에 다시
          확인했습니다.
        </p>
      )}

      {restricted && (
        <div className="mt-4">
          <p className="text-[13px] font-medium text-ink-faint">사유 (선택)</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {REASONS.map((code) => {
              const on = live.reasonCode === code;
              return (
                <button
                  key={code}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setLimitReason(on ? null : code)}
                  className={`rounded-pill px-3.5 py-2 text-[14px] font-semibold transition active:scale-[0.97] ${
                    on ? "bg-ink text-white" : "bg-fill text-ink-muted"
                  }`}
                >
                  {REASON_TEXT[code]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-field bg-fill px-3.5 py-2.5">
        <span className="text-[13px] font-medium text-ink-faint">보호자 화면</span>
        <StatusPill tone={shown.tone}>{shown.text}</StatusPill>
        {!expired && live.reasonCode && (
          <span className="text-[13px] font-medium text-ink-muted">사유 {REASON_TEXT[live.reasonCode]}</span>
        )}
      </div>
    </section>
  );
}
