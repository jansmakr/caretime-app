import Link from "next/link";
import { SourceBadge } from "@/components/common/SourceBadge";
import { StatusPill } from "@/components/common/StatusPill";
import {
  ageConditionLabel,
  capabilityLabel,
  describeIncomingForUser,
  describeWaitingForUser,
} from "@/features/hospitals/service";
import { straightLineLabel, type ConditionState, type DiscoveryMatch } from "@/features/discovery/match";
import { deriveStatusView } from "@/features/hospitals/statusView";
import { admissionHeadline, getAdmissionWindow } from "@/lib/hours";
import { AdmissionBlock } from "@/components/search/AdmissionBlock";
import { showArrivalIntent, showOfficialSourceBadge, showTravelEstimate } from "@/lib/demoContent";

/**
 * 병원 카드는 11항에 나열된 항목만 보여준다.
 * 나머지는 전부 상세화면으로 보낸다. 카드에 정보를 더 얹고 싶어지면
 * "똑닥보다 복잡해지면 다시 단순화한다"(54항)를 먼저 떠올린다.
 */

const CONDITION_TONE: Record<ConditionState, string> = {
  confirmed: "bg-confirmed-soft text-confirmed-ink",
  unknown: "bg-caution-soft text-caution-ink",
  mismatch: "bg-limited-soft text-limited-ink",
};

/**
 * now 는 필수 인자다. 기본값을 두지 않는다 —
 * 카드가 스스로 시각을 만들면 목록과 상세가 다른 시각으로 판정한다.
 * 화면 하나가 now 하나를 만들어 내려보낸다(useHospitalList).
 */
export function HospitalCard({ match, now }: { match: DiscoveryMatch; now: Date }) {
  const { hospital, relatedCapabilities, conditions, straightLineKm } = match;
  const live = hospital.liveStatus;
  const { status, timePlan, verifiedAgo, publicSyncedAgo, urgency, noGuidance, breakdown } =
    deriveStatusView(hospital, now);
  const waiting = describeWaitingForUser(hospital, now);
  const incoming = describeIncomingForUser(hospital.incoming?.within30 ?? null);
  const admission = getAdmissionWindow(
    hospital.hours,
    showTravelEstimate ? hospital.travelMinutes : 0,
    now,
  );
  const hardToCall = urgency.callDiscouraged;
  // 연령조건이 맞지 않으면 확실한 정보로 취급하지 않는다. 전화 확인이 먼저다.
  // 조건이 하나라도 미확인·불일치면 전화 확인을 앞으로 끌어올린다.
  // 확인 후 경과에 따른 강도(urgency)와, 조건·마감 쪽 불확실성을 함께 본다.
  // 어느 쪽이든 하나라도 걸리면 전화를 앞으로 끌어올린다.
  const uncertain =
    urgency.level !== "normal" ||
    conditions.some((c) => c.state !== "confirmed") ||
    ["none", "unknown", "toolate", "closed", "now"].includes(admission.state);

  return (
    <article className="ct-card p-5">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/hospital/${hospital.id}`} className="min-w-0">
          <h3 className="truncate text-[19px] font-bold">{hospital.publicData.name}</h3>
        </Link>
        {/*
          거리는 사용자가 [내 주변]을 허용해 실제 좌표가 있을 때만 보여준다.
          수동 지역 선택으로는 계산하지 않고, 이동 시간은 쓰지 않는다.
          고정 데모 출발점 기준 값(hospital.distanceKm)은 쓰지 않는다.
        */}
        {straightLineKm !== null && (
          <span className="mt-1 shrink-0 text-[13.5px] font-medium text-ink-faint">
            {straightLineLabel(straightLineKm)}
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {relatedCapabilities.map((cap, i) => (
          <span key={i} className="ct-chip">
            {capabilityLabel(cap)}
            <span className="ml-1.5 font-normal text-ink-faint">{ageConditionLabel(cap)}</span>
          </span>
        ))}
      </div>

      {/*
        선택 조건별 상태. 확인된 것 / 전화 확인이 필요한 것 / 명시적으로 맞지 않는 것을
        구분한다. 정보가 없다는 이유로 '진료 불가'라고 적지 않는다.
      */}
      {conditions.length > 0 && (
        <ul className="mt-2.5 space-y-1.5">
          {conditions.map((c) => (
            <li key={c.label} className="flex items-start gap-2">
              <span
                className={`mt-px shrink-0 rounded-md px-1.5 py-0.5 text-[11.5px] font-bold ${CONDITION_TONE[c.state]}`}
              >
                {c.state === "confirmed" ? "확인" : c.state === "mismatch" ? "불일치" : "미확인"}
              </span>
              <span className="min-w-0 break-keep text-[13.5px] leading-snug text-ink-muted">
                {c.detail}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4">
        {/* 검증된 기관 제공 근거가 없으면 공식 배지 대신 공공정보만 쓴다. */}
        {showOfficialSourceBadge && hospital.isParticipating && live && verifiedAgo !== null ? (
          <SourceBadge source={live.verifiedBy} verifiedAgo={verifiedAgo} />
        ) : (
          <SourceBadge source="public" verifiedAgo={publicSyncedAgo} />
        )}

        {/* 정상은 기본값이다. 기본값에 배지를 달면 카드가 무거워진다. */}
        {(status.tone !== "confirmed" || timePlan) && (
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-2">
            <StatusPill tone={status.tone}>{status.text}</StatusPill>
            {timePlan && <span className="text-[13px] text-ink-muted">{timePlan}</span>}
          </div>
        )}

        {/*
          대표가 막혀 보이는데 실제로 가능한 항목이 있다. 한 줄로만 알린다 —
          여기서 항목을 나열하면 카드가 읽어야 하는 줄이 늘어난다(원칙 4).
          이 줄이 없으면 보수적 접기가 "여기는 안 된다"로만 읽혀 갈 수 있는 병원을 놓친다.
          자세한 것은 상세에서 본다.
        */}
        {breakdown.partiallyOpen && (
          <p className="mt-2 text-[14px] font-semibold text-caution-ink">
            일부 항목만 가능 · 상세에서 확인
          </p>
        )}

        <AdmissionBlock
          window={admission}
          headline={admissionHeadline(admission, hospital.travelMinutes, showTravelEstimate)}
        />

        {(waiting || incoming) && (
          <dl className="mt-3 space-y-1.5 px-1 text-[14.5px]">
            {waiting && (
              <div className="flex justify-between">
                <dt className="text-ink-faint">현재 대기</dt>
                <dd className="font-semibold">{waiting}</dd>
              </div>
            )}
            {/* 도착 예정 알리기는 후속 개발이라 표시하지 않는다. (lib/demoContent) */}
            {showArrivalIntent && incoming && (
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
          {/*
            믿을 상태도 없고 전화도 어려우면, 할 수 있는 일을 알려주는 대신 없다는 사실을
            말한다. "이 화면에서 한 번 더 확인해 주세요"는 확인할 값이 없을 때 빈 말이다.
          */}
          <p className="mt-3 rounded-field bg-caution-soft px-3.5 py-2.5 text-[13.5px] leading-relaxed text-caution-ink">
            {noGuidance
              ? "이 의료기관은 전화 문의가 어렵다고 알려왔습니다."
              : "이 의료기관은 현재 전화문의가 어렵습니다. 출발 전 이 화면에서 상태를 한 번 더 확인해 주세요."}
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
