import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { DemoNotice } from "@/components/common/DemoNotice";
import { SourceBadge } from "@/components/common/SourceBadge";
import { StatusPill } from "@/components/common/StatusPill";
import {
  ageConditionLabel,
  capabilityLabel,
  describeWaitingForUser,
  getHospital,
} from "@/features/hospitals/service";
import { admissionHeadline, getAdmissionWindow } from "@/lib/hours";
import { CALL_IS_SUREST, NOT_A_BOOKING, VISIT_INTENT_DISCLAIMER } from "@/lib/copy";
import { AdmissionBlock } from "@/components/search/AdmissionBlock";
import {
  describeStatus,
  describeTimePlan,
  formatAgo,
  getFreshness,
  isExpired,
} from "@/lib/freshness";
import { CONTACT_TEXT, REASON_TEXT } from "@/features/hospitals/labels";

export default async function HospitalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const hospital = getHospital(id);
  if (!hospital) notFound();

  const live = hospital.liveStatus;
  const expired = live ? isExpired(live) : true;
  const status = describeStatus(live);
  const timePlan = expired ? null : describeTimePlan(live);
  const waiting = describeWaitingForUser(hospital);
  const admission = getAdmissionWindow(hospital.hours, hospital.travelMinutes);

  return (
    <>
      <AppHeader title={hospital.publicData.name} backHref="/search" />
      <DemoNotice />

      <main className="space-y-3 px-4 py-4">
        {/* 계층 ①② — 공공 기본정보. 병원이 수정할 수 없는 값. */}
        <section className="ct-card p-4">
          <SourceBadge
            source="public"
            verifiedAgo={formatAgo(getFreshness(hospital.publicData.syncedAt).minutesAgo)}
          />
          <dl className="mt-3 space-y-2 text-[14px]">
            <div className="flex gap-3">
              <dt className="w-16 shrink-0 text-ink-muted">주소</dt>
              <dd>{hospital.publicData.address}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-16 shrink-0 text-ink-muted">전화</dt>
              <dd>{hospital.publicData.tel}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-16 shrink-0 text-ink-muted">거리</dt>
              <dd>
                {hospital.distanceKm.toFixed(1)}km · 약 {hospital.travelMinutes}분
              </dd>
            </div>
          </dl>
        </section>

        {/* 오늘 진료시간 — 내원 마감을 종료시각보다 크게 둔다. */}
        <section className="ct-card p-4">
          <h2 className="text-[15px] font-semibold">오늘 진료시간</h2>
          <AdmissionBlock
            window={admission}
            headline={admissionHeadline(admission, hospital.travelMinutes)}
          />
          {admission.note && (
            <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">{admission.note}</p>
          )}
          {admission.state === "unknown" && (
            <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
              이 의료기관은 내원 마감 시각을 아직 등록하지 않았습니다. 진료 종료 직전에는 접수가
              어려울 수 있으니 전화로 확인해 주세요.
            </p>
          )}
        </section>

        {/* 계층 ③ — 진료기능. 구조 데이터라 시간에 따라 변하지 않는다. */}
        <section className="ct-card p-4">
          <h2 className="text-[15px] font-semibold">등록된 진료기능</h2>
          <ul className="mt-3 space-y-2">
            {hospital.capabilities.map((cap, i) => (
              <li key={i} className="flex items-start justify-between gap-3 text-[14px]">
                <span>
                  {capabilityLabel(cap)}
                  {cap.mappingStatus === "pending" && (
                    <span className="ml-2 text-[12px] text-ink-faint">의료기관 직접 입력</span>
                  )}
                </span>
                <span className="shrink-0 text-ink-muted">{ageConditionLabel(cap)}</span>
              </li>
            ))}
            {hospital.capabilities.length === 0 && (
              <li className="text-[14px] text-ink-muted">등록된 세부 진료기능이 없습니다.</li>
            )}
          </ul>
        </section>

        {/* 계층 ④ — 시간가변 상태. 만료됐으면 절대 현재값처럼 쓰지 않는다. */}
        <section className="ct-card p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-semibold">현재 상태</h2>
            {live && !expired && (
              <SourceBadge
                source={live.verifiedBy}
                verifiedAgo={formatAgo(getFreshness(live.verifiedAt).minutesAgo)}
              />
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusPill tone={status.tone}>{status.text}</StatusPill>
            {timePlan && <span className="text-[13px] text-ink-muted">{timePlan}</span>}
          </div>

          {expired && (
            <p className="mt-2.5 text-[13px] leading-relaxed text-ink-muted">
              마지막 확인 이후 시간이 지나 현재 상태를 보장할 수 없습니다. 방문 전에 전화로
              확인해 주세요.
            </p>
          )}

          {live && !expired && live.reasonCode && (
            <p className="mt-2.5 text-[14px]">
              <span className="text-ink-muted">사유 </span>
              {live.customReason ?? REASON_TEXT[live.reasonCode]}
            </p>
          )}
          {live && !expired && live.detailText && (
            <p className="mt-1 text-[14px] text-ink-muted">{live.detailText}</p>
          )}

          <dl className="mt-3 space-y-1.5 border-t border-line pt-3 text-[14px]">
            {waiting && (
              <div className="flex justify-between">
                <dt className="text-ink-muted">현재 대기</dt>
                <dd>{waiting}</dd>
              </div>
            )}
            {hospital.contactStatus && !expired && (
              <div className="flex justify-between">
                <dt className="text-ink-muted">전화</dt>
                <dd>{CONTACT_TEXT[hospital.contactStatus.status]}</dd>
              </div>
            )}
          </dl>
        </section>

        {/* 계층 ⑥ — 내원예정. 4단계에서 열린다. 지금은 자리만 만들어 둔다. */}
        <section className="ct-card p-4">
          <h2 className="text-[15px] font-semibold">내원 예정 알리기</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
            도착 예정 시간을 의료기관에 미리 알리는 기능입니다. 4단계에서 열립니다.
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-caution">
            {VISIT_INTENT_DISCLAIMER}
          </p>
          <button type="button" disabled className="ct-primary mt-3">
            내원 예정 알리기
          </button>
        </section>

        {hospital.isParticipating && (
          <p className="px-1 text-[13px] leading-relaxed text-ink-faint">
            환자 편의를 위해 진료정보 공유에 참여하는 의료기관입니다. 실제 상황은 변경될 수
            있습니다.
          </p>
        )}

        <a href={`tel:${hospital.publicData.tel}`} className="ct-primary">
          전화로 확인하기
        </a>
        <p className="px-1 text-[13px] leading-relaxed text-ink-faint">
          {NOT_A_BOOKING} {CALL_IS_SUREST}
        </p>
        <Link href="/search" className="ct-secondary w-full">
          목록으로
        </Link>
      </main>
    </>
  );
}
