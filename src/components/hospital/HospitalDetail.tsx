"use client";

import Link from "next/link";
import { AppHeader } from "@/components/layout/AppHeader";
import { DemoNotice } from "@/components/common/DemoNotice";
import { SourceBadge } from "@/components/common/SourceBadge";
import { StatusPill } from "@/components/common/StatusPill";
import {
  ageConditionLabel,
  capabilityLabel,
  describeWaitingForUser,
} from "@/features/hospitals/service";
import type { ChatMessage } from "@/features/chat/types";
import type { HospitalView } from "@/features/hospitals/types";
import { useHospitalLive } from "@/features/hospitals/useHospitalLive";
import { admissionHeadline, getAdmissionWindow } from "@/lib/hours";
import { CALL_IS_SUREST, NOT_A_BOOKING, VISIT_INTENT_DISCLAIMER } from "@/lib/copy";
import { AdmissionBlock } from "@/components/search/AdmissionBlock";
import { HospitalFieldTalk } from "@/components/hospital/HospitalFieldTalk";
import { deriveStatusView } from "@/features/hospitals/statusView";
import { CONTACT_TEXT, REASON_TEXT } from "@/features/hospitals/labels";
import {
  showAdmissionHours,
  showArrivalIntent,
  showDemoDistance,
  showOfficialSourceBadge,
  showServiceBreakdown,
  showTravelEstimate,
} from "@/lib/demoContent";

/**
 * 병원 상세. 서버가 읽은 값으로 렌더한 뒤, Supabase 연결 시 병원 직접입력 4개 테이블을 실시간 구독한다.
 * 모든 시간 판정(만료·마감·N분 전)은 같은 now 하나로 한다. 화면 안에서 판정 기준 시각이 섞이지 않게.
 */
export function HospitalDetail({
  initial,
  renderedAt,
  realtime,
  initialMessages = [],
  messagesLoadFailed = false,
  myPostIds = [],
}: {
  initial: HospitalView;
  renderedAt: string;
  realtime: boolean;
  /** 서버가 읽어 온 이 의료기관의 현장톡 글. 첫 화면부터 보이게 한다. */
  initialMessages?: ChatMessage[];
  /** 그 조회가 실패했는가. 빈 목록과 다른 말을 해야 한다. */
  messagesLoadFailed?: boolean;
  /** 이 브라우저가 쓴 글의 id. 첫 그림부터 삭제 버튼이 붙게 한다. */
  myPostIds?: string[];
}) {
  const { hospital, now, connection } = useHospitalLive(initial, renderedAt, realtime);

  const live = hospital.liveStatus;
  // 카드(목록)와 같은 함수를 쓴다. 같은 병원·같은 now 면 두 화면의 문구가 같아야 한다.
  const {
    expired,
    status,
    timePlan,
    verifiedAgo,
    publicSyncedAgo,
    urgency,
    downgraded,
    noGuidance,
    breakdown,
  } = deriveStatusView(hospital, now);
  // 만료됐거나, 만료 전이라도 확인 후 30분이 지나 표시를 내린 경우. 둘 다 상태를 보장하지 못한다.
  const unreliable = expired || downgraded;
  const waiting = describeWaitingForUser(hospital, now);
  // 이동 시간 추정을 못 믹을 때는 0 을 넣는다. 그러면 마감 판정이 '마감 시각 vs 지금'만 본다.
  const admission = getAdmissionWindow(
    hospital.hours,
    // 좌표가 없으면 이동시간도 없다. 0 을 넘기면 마감 판정이 '마감 시각 vs 지금'만 본다.
    showTravelEstimate ? (hospital.travelMinutes ?? 0) : 0,
    now,
  );

  return (
    <>
      <AppHeader title={hospital.publicData.name} backHref="/search" />
      <DemoNotice />

      <main className="space-y-3 px-4 pb-6 pt-3">
        {/* 계층 ①② — 공공 기본정보. 병원이 수정할 수 없는 값. */}
        <section className="ct-card p-5">
          <SourceBadge
            source="public"
            verifiedAgo={publicSyncedAgo}
          />
          <dl className="mt-3 space-y-2.5 text-[15px]">
            <Row label="주소">{hospital.publicData.address}</Row>
            <Row label="전화">{hospital.publicData.tel}</Row>
            {/*
              거리는 고정 데모 출발점 기준이라 '내 주변' 거리가 아니다. 운영에서는 숨긴다.
              좌표가 없는 병원은 이 줄 자체가 없다 — "거리 정보 없음" 같은 빈 줄을 만들지
              않는다. 없는 것을 자리로 남기면 읽을 줄만 늘어난다(원칙 4).
            */}
            {showDemoDistance && hospital.distanceKm !== null && (
              <Row label="거리">
                {hospital.distanceKm.toFixed(1)}km
                {hospital.travelMinutes !== null && ` · 약 ${hospital.travelMinutes}분`}
              </Row>
            )}
          </dl>
        </section>

        {/*
          오늘 진료시간 — 내원 마감을 종료시각보다 크게 둔다.
          1차에서는 내린다. 확인된 진료시간이 한 곳도 없어 항상 "정보 없음"이고,
          읽을 것이 없는 줄이 자리를 차지한다. (lib/demoContent.showAdmissionHours)
        */}
        {showAdmissionHours && (
          <section className="ct-card p-5">
            <h2 className="ct-section-title">오늘 진료시간</h2>
            <AdmissionBlock
              window={admission}
              headline={admissionHeadline(admission, hospital.travelMinutes ?? 0, showTravelEstimate)}
            />
            {admission.note && (
              <p className="mt-3 text-[14.5px] leading-relaxed text-ink-muted">{admission.note}</p>
            )}
            {admission.state === "unknown" && (
              <p className="mt-3 text-[14.5px] leading-relaxed text-ink-muted">
                이 의료기관은 내원 마감 시각을 아직 등록하지 않았습니다. 진료 종료 직전에는 접수가
                어려울 수 있으니 전화로 확인해 주세요.
              </p>
            )}
          </section>
        )}

        {/* 계층 ③ — 진료기능. 구조 데이터라 시간에 따라 변하지 않는다. */}
        <section className="ct-card p-5">
          <h2 className="ct-section-title">등록된 진료기능</h2>
          <ul className="mt-2 divide-y divide-fill">
            {hospital.capabilities.map((cap, i) => (
              <li key={i} className="flex items-start justify-between gap-3 py-2.5 text-[15px]">
                <span className="min-w-0">
                  <span className="font-medium">{capabilityLabel(cap)}</span>
                  {cap.mappingStatus === "pending" && (
                    <span className="ml-2 inline-block rounded-md bg-fill px-1.5 py-0.5 align-middle text-[11.5px] font-semibold text-ink-faint">
                      의료기관 직접 입력
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-[14px] text-ink-faint">{ageConditionLabel(cap)}</span>
              </li>
            ))}
            {hospital.capabilities.length === 0 && (
              <li className="py-2.5 text-[15px] text-ink-muted">등록된 세부 진료기능이 없습니다.</li>
            )}
          </ul>
        </section>

        {/* 계층 ④ — 시간가변 상태. 만료됐으면 절대 현재값처럼 쓰지 않는다. */}
        <section className="ct-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
            <h2 className="ct-section-title flex items-center gap-2">
              현재 상태
              <LiveIndicator connection={connection} />
            </h2>
            {/* 검증된 기관 제공 근거가 없으면 공식 배지를 만들지 않는다. (lib/demoContent) */}
            {showOfficialSourceBadge && live && !expired && verifiedAgo !== null && (
              <SourceBadge source={live.verifiedBy} verifiedAgo={verifiedAgo} />
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusPill tone={status.tone}>{status.text}</StatusPill>
            {timePlan && <span className="text-[13.5px] text-ink-muted">{timePlan}</span>}
          </div>

          {/*
            항목별 상태. 항목이 하나뿐이거나 전부 같은 상태면 그리지 않는다 —
            같은 말을 여러 줄로 쓰는 것이고, 읽어야 하는 줄만 늘어난다(원칙 4·10).
            판정은 deriveServiceBreakdown 이 하고, 여기서는 받은 줄만 그린다.

            문구는 보호자의 말이다(원칙 7). "열상"·"capability" 같은 말을 쓰지 않는다.
            병원 화면은 같은 항목을 "열상"으로 부른다 — 표가 두 벌인 이유다.

            1차에서는 내린다. 이 3분할은 "야간 소아 외상" 설계에서 나왔는데 1차 지역의
            달빛어린이병원이 실제로 보는 것은 발열·구토·중이염이다. 어긋난 표를 병원별
            상태로 보여 주면 보호자가 맞지 않는 칸을 읽고 판단한다.
            판정 규칙(deriveServiceBreakdown)은 그대로다 — 표시만 닫았다.
          */}
          {showServiceBreakdown && breakdown.lines.length > 0 && (
            <dl className="mt-3 divide-y divide-line rounded-field bg-fill px-4 py-1">
              {breakdown.lines.map((line) => (
                <div key={line.category} className="flex items-center justify-between gap-3 py-2.5">
                  <dt className="text-[15px] text-ink-muted">{line.label}</dt>
                  <dd
                    className={`text-[16px] font-bold ${
                      line.status === "AVAILABLE"
                        ? "text-confirmed-ink"
                        : line.status === "UNKNOWN"
                          ? "text-ink-faint"
                          : "text-limited-ink"
                    }`}
                  >
                    {line.statusText}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          {/*
            믿을 상태가 없을 때 무엇을 말하는가.
            전화가 가능하면 전화를 시킨다. 전화도 어렵다면 시킬 수 있는 일이 없으므로
            없다는 사실만 말한다 — "전화로 확인해 주세요"는 그 경우 빈 말이다.
          */}
          {noGuidance ? (
            <p className="mt-3 text-[14px] leading-relaxed text-ink-muted">
              이 의료기관은 전화 문의가 어렵다고 알려왔습니다.
            </p>
          ) : (
            unreliable && (
              <p className="mt-3 text-[14px] leading-relaxed text-ink-muted">
                마지막 확인 이후 시간이 지나 현재 상태를 보장할 수 없습니다. 방문 전에 전화로
                확인해 주세요.
              </p>
            )
          )}

          {live && !unreliable && live.reasonCode && (
            <p className="mt-3 text-[15px]">
              <span className="text-ink-faint">사유 </span>
              <span className="font-semibold">{live.customReason ?? REASON_TEXT[live.reasonCode]}</span>
            </p>
          )}
          {live && !unreliable && live.detailText && (
            <p className="mt-1 text-[14.5px] text-ink-muted">{live.detailText}</p>
          )}

          {(waiting || (hospital.contactStatus && !expired)) && (
            <dl className="mt-4 space-y-2 rounded-field bg-fill px-4 py-3 text-[15px]">
              {waiting && (
                <div className="flex justify-between">
                  <dt className="text-ink-faint">현재 대기</dt>
                  <dd className="font-semibold">{waiting}</dd>
                </div>
              )}
              {hospital.contactStatus && !expired && (
                <div className="flex justify-between">
                  <dt className="text-ink-faint">전화</dt>
                  <dd className="font-semibold">{CONTACT_TEXT[hospital.contactStatus.status]}</dd>
                </div>
              )}
            </dl>
          )}
        </section>

        {/*
          계층 ⑤ — 보호자 현장톡. 병원 직접확인 카드와 다른 카드로 둔다. 출처가 다른
          정보를 한 면에 얹으면 보호자는 둘을 구분하지 못한다(기획안 12항).

          여기 있던 "실시간 제보"는 /chat 과 다른 저장소를 썼고 브라우저에만 남았다.
          이제 같은 방을 이 의료기관으로 좁혀 보여 준다 — 어디에 썼느냐로 글이 남는지가
          갈리지 않는다. (HospitalFieldTalk 주석)
        */}
        <HospitalFieldTalk
          hospital={hospital}
          renderedAt={renderedAt}
          now={now}
          initialMessages={initialMessages}
          initialLoadFailed={messagesLoadFailed}
          initialMyPostIds={myPostIds}
        />

        {/*
          계층 ⑥ — 도착 예정 알리기. 후속 개발이라 사용자 흐름에서 빼 둔다.
          코드·타입·데이터는 지우지 않았고 진입점만 닫았다. 되살릴 때는
          lib/demoContent.showArrivalIntent 를 true 로 바꾼다.
        */}
        {showArrivalIntent && (
          <section className="ct-card p-5">
            <h2 className="ct-section-title">내원 예정 알리기</h2>
            <p className="mt-2 text-[14.5px] leading-relaxed text-ink-muted">
              도착 예정 시간을 의료기관에 미리 알리는 기능입니다.
            </p>
            <p className="mt-2 text-[13.5px] leading-relaxed text-caution">{VISIT_INTENT_DISCLAIMER}</p>
            <button type="button" disabled className="ct-primary mt-4">
              내원 예정 알리기
            </button>
          </section>
        )}

        {hospital.isParticipating && (
          <p className="px-1 pt-1 text-[13px] leading-relaxed text-ink-faint">
            환자 편의를 위해 진료정보 공유에 참여하는 의료기관입니다. 실제 상황은 변경될 수
            있습니다.
          </p>
        )}

        {/*
          병원이 "전화문의 어려움"을 켜 두면 전화를 주 버튼으로 올리지 않는다.
          받지 못하는 번호로 급한 사람을 보내면 시간만 잃는다.

          그렇다고 다른 것을 주 버튼으로 올리지도 않는다. "목록으로"를 크게 만들면
          사용자를 밀어내기만 하고 답을 주지 않는다 — 돌아가도 같은 문제의 병원이 또 있다.
          우리가 권할 수 있는 행동이 실제로 없을 때 하나를 크게 만드는 것은 거짓이다.
          그래서 무게가 같은 선택지 둘을 둔다.

          [그래도 전화]가 남아 있는 이유: 병원이 어렵다고 알린 것이고 불가능한 것은 아니다.
          응급 여부는 우리가 판단하지 않는다. 119 안내는 이미 있는 자리 그대로 둔다.
        */}
        {/*
          전에는 여기서 /chat?hospitalId= 으로 내보냈다. 이제 그 방이 이 화면 안에
          있으므로 같은 방으로 가는 문을 두 개 두지 않는다 — 눌러도 방금 읽은 글이
          다시 나온다. 다른 지역·병원으로 가는 길은 현장톡 카드 안에 있다.
        */}
        <div className="space-y-2 pt-1">
          {urgency.callDiscouraged ? (
            <div className="flex gap-2">
              <a href={`tel:${hospital.publicData.tel}`} className="ct-secondary">
                그래도 전화
              </a>
              <Link href="/search" className="ct-secondary">
                다른 곳 보기
              </Link>
            </div>
          ) : (
            <>
              <a href={`tel:${hospital.publicData.tel}`} className="ct-primary">
                전화로 확인하기
              </a>
              <Link href="/search" className="ct-secondary w-full">
                목록으로
              </Link>
            </>
          )}
        </div>
        <p className="px-1 text-[13px] leading-relaxed text-ink-faint">
          {NOT_A_BOOKING} {CALL_IS_SUREST}
        </p>
      </main>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <dt className="w-10 shrink-0 text-ink-faint">{label}</dt>
      <dd className="min-w-0 font-medium">{children}</dd>
    </div>
  );
}

/** 실시간 연결 여부. 끊겼을 때 화면이 최신인 것처럼 보이지 않게 알린다. */
function LiveIndicator({ connection }: { connection: "off" | "connecting" | "live" | "offline" }) {
  if (connection === "live") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-pill bg-confirmed-soft px-2 py-0.5 text-[12px] font-semibold text-confirmed-ink">
        <span className="relative flex h-1.5 w-1.5" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-confirmed opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-confirmed" />
        </span>
        실시간
      </span>
    );
  }
  if (connection === "offline") {
    return (
      <span className="rounded-pill bg-caution-soft px-2 py-0.5 text-[12px] font-semibold text-caution-ink">
        실시간 끊김 · 새로고침 필요
      </span>
    );
  }
  return null;
}
