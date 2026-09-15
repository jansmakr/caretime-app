import Link from "next/link";
import { SourceBadge } from "@/components/common/SourceBadge";
import { StatusPill } from "@/components/common/StatusPill";
import {
  ageConditionLabel,
  capabilityLabel,
  describeIncomingForUser,
  describeWaitingForUser,
  type MatchedHospital,
} from "@/features/hospitals/service";
import { describeStatus, describeTimePlan, formatAgo, getFreshness, isExpired } from "@/lib/freshness";
import { admissionHeadline, getAdmissionWindow } from "@/lib/hours";
import { AdmissionBlock } from "@/components/search/AdmissionBlock";

/**
 * 병원 카드는 11항에 나열된 항목만 보여준다.
 * 나머지는 전부 상세화면으로 보낸다. 카드에 정보를 더 얹고 싶어지면
 * "똑닥보다 복잡해지면 다시 단순화한다"(54항)를 먼저 떠올린다.
 */

export function HospitalCard({ match }: { match: MatchedHospital }) {
  const { hospital, matchedCapabilities, ageBlocked } = match;
  const live = hospital.liveStatus;
  const expired = live ? isExpired(live) : true;
  const status = describeStatus(live);
  const timePlan = expired ? null : describeTimePlan(live);
  const waiting = describeWaitingForUser(hospital);
  const incoming = describeIncomingForUser(hospital.incoming?.within30 ?? null);
  const admission = getAdmissionWindow(hospital.hours, hospital.travelMinutes);
  const hardToCall = hospital.contactStatus?.status === "difficult";
  // 연령조건이 맞지 않으면 확실한 정보로 취급하지 않는다. 전화 확인이 먼저다.
  const uncertain =
    expired ||
    ageBlocked ||
    ["none", "unknown", "toolate", "closed", "now"].includes(admission.state);

  return (
    <article className="ct-card p-5">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/hospital/${hospital.id}`} className="min-w-0">
          <h3 className="truncate text-[19px] font-bold">{hospital.publicData.name}</h3>
        </Link>
        <span className="mt-1 shrink-0 text-[13.5px] font-medium text-ink-faint">
          {hospital.travelMinutes}분 · {hospital.distanceKm.toFixed(1)}km
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {matchedCapabilities.map((cap, i) => (
          <span key={i} className="ct-chip">
            {capabilityLabel(cap)}
            <span className="ml-1.5 font-normal text-ink-faint">{ageConditionLabel(cap)}</span>
          </span>
        ))}
      </div>

      {ageBlocked && (
        <p className="mt-2 text-[13.5px] leading-relaxed text-caution">
          입력하신 연령은 이 의료기관의 등록 조건과 맞지 않습니다. 전화로 확인해 보세요.
        </p>
      )}

      <div className="mt-4">
        {hospital.isParticipating && live ? (
          <SourceBadge
            source={live.verifiedBy}
            verifiedAgo={formatAgo(getFreshness(live.verifiedAt).minutesAgo)}
          />
        ) : (
          <SourceBadge
            source="public"
            verifiedAgo={formatAgo(getFreshness(hospital.publicData.syncedAt).minutesAgo)}
          />
        )}

        {/* 정상은 기본값이다. 기본값에 배지를 달면 카드가 무거워진다. */}
        {(status.tone !== "confirmed" || timePlan) && (
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-2">
            <StatusPill tone={status.tone}>{status.text}</StatusPill>
            {timePlan && <span className="text-[13px] text-ink-muted">{timePlan}</span>}
          </div>
        )}

        <AdmissionBlock
          window={admission}
          headline={admissionHeadline(admission, hospital.travelMinutes)}
        />

        {(waiting || incoming) && (
          <dl className="mt-3 space-y-1.5 px-1 text-[14.5px]">
            {waiting && (
              <div className="flex justify-between">
                <dt className="text-ink-faint">현재 대기</dt>
                <dd className="font-semibold">{waiting}</dd>
              </div>
            )}
            {incoming && (
              <div className="flex justify-between">
                <dt className="text-ink-faint">내원 예정</dt>
                <dd className="font-semibold text-caution">{incoming}</dd>
              </div>
            )}
          </dl>
        )}
      </div>

      {/* 정보가 불확실할수록 전화 확인을 앞으로 끌어올린다.
          CareTime 이 확정해 줄 수 없는 상황에서 가장 확실한 행동은 전화다.
          단, 병원이 "전화문의 어려움"을 켜 두었으면 전화를 권하지 않는다. */}
      {hardToCall ? (
        <>
          <p className="mt-3 rounded-field bg-caution-soft px-3.5 py-2.5 text-[13.5px] leading-relaxed text-caution-ink">
            이 의료기관은 현재 전화문의가 어렵습니다. 출발 전 이 화면에서 상태를 한 번 더 확인해
            주세요.
          </p>
          <div className="mt-3 flex gap-2">
            <Link href={`/hospital/${hospital.id}`} className="ct-secondary">
              상세 보기
            </Link>
            <a href={`tel:${hospital.publicData.tel}`} className="ct-secondary">
              그래도 전화
            </a>
          </div>
        </>
      ) : uncertain ? (
        <div className="mt-4 space-y-2">
          <a href={`tel:${hospital.publicData.tel}`} className="ct-primary">
            출발 전 전화 확인
          </a>
          <Link href={`/hospital/${hospital.id}`} className="ct-secondary w-full">
            상세 보기
          </Link>
        </div>
      ) : (
        <div className="mt-4 flex gap-2">
          <Link href={`/hospital/${hospital.id}`} className="ct-secondary">
            상세 보기
          </Link>
          <a href={`tel:${hospital.publicData.tel}`} className="ct-secondary">
            전화 확인
          </a>
        </div>
      )}
    </article>
  );
}
