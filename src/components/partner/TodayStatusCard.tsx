"use client";

import { useState } from "react";
import { StatusPill } from "@/components/common/StatusPill";
import { ChoiceGroup, type Choice } from "@/components/partner/ChoiceGroup";
import { VerifiedLine } from "@/components/partner/VerifiedLine";
import { CATEGORY_LABEL_PARTNER, REASON_TEXT } from "@/features/hospitals/labels";
import type { LimitReasonCode, LiveStatusCode } from "@/features/hospitals/types";
import { usePartner } from "@/features/partner/PartnerProvider";
import {
  describeExceptions,
  nextRecheckMinutes,
  serviceExceptions,
} from "@/features/partner/service";
import type { PartnerState, TodayMode } from "@/features/partner/types";
import { describeStatus, formatClock, isExpired } from "@/lib/freshness";

const MODES: Choice<TodayMode>[] = [
  { value: "same_as_yesterday", label: "어제와 동일", tone: "confirmed" },
  { value: "limited", label: "일부 제한", tone: "caution" },
  { value: "difficult", label: "오늘 어려움", tone: "limited" },
];

/**
 * 항목별 선택지. 주 버튼과 말이 다르다 — "어제와 동일"은 병원 전체를 되살리는
 * 지름길이라 항목 하나에는 뜻이 없다. 항목 이름은 병원용 표를 쓴다(열상 / 화상 / 기타).
 */
const SERVICE_CHOICES: Choice<LiveStatusCode>[] = [
  { value: "normal", label: "진료 가능", tone: "confirmed" },
  { value: "partial", label: "일부 제한", tone: "caution" },
  { value: "difficult", label: "오늘 어려움", tone: "limited" },
];

/** "직접 입력"은 자유문구 검수가 필요해 2단계 이후에 연다. */
const REASONS = (Object.keys(REASON_TEXT) as LimitReasonCode[]).filter((c) => c !== "custom");

export function TodayStatusCard({ state, now }: { state: PartnerState; now: Date }) {
  const { confirmSameAsYesterday, setTodayMode, setLimitReason, setServiceStatus } = usePartner();
  const live = state.liveStatus;
  const expired = isExpired(live, now);
  const shown = describeStatus(live, now);
  const restricted = state.mode === "limited" || state.mode === "difficult";

  // 항목별 화면은 접힌 채로 시작한다. 예외가 이미 있으면 펼쳐 둔다 — 그 병원은 이미 쓰고 있다.
  const [open, setOpen] = useState(serviceExceptions(state).length > 0);
  const exceptionText = describeExceptions(state);
  const recheckMinutes = nextRecheckMinutes(state, now);
  const someOpen = state.services.some((svc) => svc.status === "normal");
  const partiallyOpen = someOpen && live.status !== "normal";

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

      {/*
        예외가 있을 때만 한 줄. 없으면 그리지 않는다 — 없는 사실을 위해 줄을 만들지 않는다.
        주 버튼 하나로 끝나는 병원의 화면은 지금까지와 똑같아야 한다(원칙 1·4).
      */}
      {exceptionText && (
        <p className="mt-3 text-[15px] font-bold text-caution-ink">{exceptionText}</p>
      )}

      {/* 다시 눌러야 하는 시각. 가장 이른 것 하나만. 병원이 할 일로 쓴다(원칙 5). */}
      {recheckMinutes !== null && (
        <p className="mt-2 text-[14px] text-ink-muted">{recheckMinutes}분 뒤 다시 눌러주세요.</p>
      )}

      {state.services.length > 1 && (
        <div className="mt-3">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="min-h-[44px] text-[15px] font-semibold text-blue"
          >
            {open ? "항목별 설정 닫기" : "항목별로 다르면 바꾸기 ›"}
          </button>

          {open && (
            <div className="mt-1 space-y-3">
              <p className="text-[14px] leading-relaxed text-ink-muted">
                위에서 누른 값이 모든 항목에 들어가 있습니다. 다른 것만 바꾸세요.
              </p>
              {state.services.map((svc) => (
                <div key={svc.serviceId}>
                  <p className="text-[15px] font-bold">{CATEGORY_LABEL_PARTNER[svc.category]}</p>
                  <ChoiceGroup
                    label={`${CATEGORY_LABEL_PARTNER[svc.category]} 진료상태`}
                    choices={SERVICE_CHOICES}
                    selected={svc.status}
                    onSelect={(value) => setServiceStatus(svc.serviceId, value)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
        {/*
          예외를 만든 병원에게 **보호자가 실제로 무엇을 보는지** 알려준다.
          이게 없으면 "정직하게 적었더니 마감으로만 보인다"고 느끼고 다시는 예외를 쓰지 않는다.
        */}
        {partiallyOpen && !expired && (
          <span className="text-[13px] font-medium text-caution-ink">일부 항목만 가능</span>
        )}
      </div>
    </section>
  );
}
