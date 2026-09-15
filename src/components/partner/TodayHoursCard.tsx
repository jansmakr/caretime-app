"use client";

import { useState } from "react";
import { VerifiedLine } from "@/components/partner/VerifiedLine";
import { usePartner } from "@/features/partner/PartnerProvider";
import { clockToIso } from "@/features/partner/service";
import type { HoursSaveError, PartnerState } from "@/features/partner/types";
import { formatClock } from "@/lib/freshness";
import { suggestAdmissionAt } from "@/lib/hours";

const ERROR_TEXT: Record<HoursSaveError, string> = {
  invalid_clock: "시각 형식을 확인해 주세요.",
  admission_after_close: "내원 마감은 진료 종료보다 늦을 수 없습니다.",
};

/**
 * 오늘 진료시간 · 내원(접수) 마감.
 * 시각은 직접 타이핑하는 값이라 원탭 반영 대신 저장 버튼을 둔다.
 * "종료 1시간 전"은 입력칸을 채우는 제안일 뿐, 저장해야 보호자 화면에 시각으로 나간다. (lib/hours.ts)
 *
 * 부모가 key={hours.verifiedAt} 으로 렌더한다. "어제와 동일"로 값이 바뀌면 입력칸도 새로 채워진다.
 */
export function TodayHoursCard({ state, now }: { state: PartnerState; now: Date }) {
  const { saveTodayHours } = usePartner();
  const h = state.hours;
  const regularClose = formatClock(h.regularCloseAt);
  const savedClose = formatClock(h.todayCloseAt ?? h.regularCloseAt);
  const savedAdmission = h.admissionConfirmed && h.lastAdmissionAt ? formatClock(h.lastAdmissionAt) : "";

  const [close, setClose] = useState(savedClose);
  const [admission, setAdmission] = useState(savedAdmission);
  const [error, setError] = useState<HoursSaveError | null>(null);

  const dirty = close !== savedClose || admission !== savedAdmission;
  const saved = !dirty && h.admissionConfirmed;
  // 제안은 저장된 값이 아니라 지금 입력칸의 종료시각 기준이다.
  const closeIso = clockToIso(close, h.regularOpenAt);
  const suggestion = closeIso ? formatClock(suggestAdmissionAt(closeIso)) : null;

  const save = () => setError(saveTodayHours({ closeClock: close, admissionClock: admission || null }));

  return (
    <section className="ct-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[16px] font-semibold">오늘 진료시간</h2>
        <VerifiedLine verifiedAt={h.verifiedAt} now={now} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[13px] text-ink-muted">내원(접수) 마감</span>
          <input
            type="time"
            value={admission}
            onChange={(e) => setAdmission(e.target.value)}
            className="mt-1 h-[52px] w-full min-w-0 rounded-card border border-line bg-surface px-2 text-[17px] font-bold"
          />
        </label>
        <label className="block">
          <span className="text-[13px] text-ink-muted">진료 종료</span>
          <input
            type="time"
            value={close}
            onChange={(e) => setClose(e.target.value)}
            className="mt-1 h-[52px] w-full min-w-0 rounded-card border border-line bg-surface px-2 text-[17px] font-semibold"
          />
        </label>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[13px]">
        <span className="text-ink-muted">
          평소 종료 {regularClose}
          {close !== regularClose && (
            <span className="ml-1.5 rounded-pill bg-[#FDF2E4] px-2 py-0.5 font-semibold text-caution">
              오늘 단축·변경
            </span>
          )}
        </span>
        {suggestion && (
          <button type="button" onClick={() => setAdmission(suggestion)} className="font-medium text-blue">
            종료 1시간 전({suggestion})으로 채우기
          </button>
        )}
      </div>

      {!admission && (
        <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
          내원 마감을 비워 두면 보호자 화면에는 시각 대신 &lsquo;의료기관 확인 필요&rsquo;로
          표시됩니다.
        </p>
      )}
      {error && <p className="mt-2 text-[14px] text-limited">{ERROR_TEXT[error]}</p>}

      <button type="button" onClick={save} disabled={saved} className="ct-primary mt-3">
        {saved ? "저장됨" : "진료시간 저장"}
      </button>
    </section>
  );
}
