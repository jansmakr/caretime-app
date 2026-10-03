"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { useMemo } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { StageNotice } from "@/components/common/StageNotice";
import { ConditionBar } from "@/components/search/ConditionBar";
import { HospitalCard } from "@/components/search/HospitalCard";
import { useDiscovery } from "@/features/discovery/DiscoveryProvider";
import { matchHospitals } from "@/features/discovery/match";
import { useHospitalList } from "@/features/hospitals/useHospitalList";
import { CALL_IS_SUREST, NOT_A_BOOKING } from "@/lib/copy";
import { showHospitalDirectory } from "@/lib/demoContent";

/**
 * 검색 결과.
 *
 * **로그인도, 검색 조건도 없어도 열린다.** 조건을 하나도 고르지 않으면 전체를 보여주고,
 * 지역만 안내한다. 임의 지역을 골라 '내 주변'으로 표시하지 않는다.
 *
 * 조건은 ConditionBar 에서 바꾸고 초기화한다. 조건이 바뀌면 실제로 목록·정렬·조건 표시가
 * 함께 바뀐다(features/discovery/match).
 */
export default function SearchPage() {
  /*
   * 1차에는 닫혀 있다. 글을 병원이 아니라 구에 걸기로 해서 병원을 고르는 자리가
   * 없어졌고, 고르는 자리가 없으면 이 목록도 갈 길이 없다.
   * (lib/demoContent.showHospitalDirectory, docs/LAUNCH-scope.md)
   */
  if (!showHospitalDirectory) notFound();

  const { conditions, origin, ready } = useDiscovery();
  const list = useHospitalList();
  // 구조 분해해서 좁힌다. list.now 로 두면 아래 삼항 안에서 null 이 다시 살아난다.
  const { now } = list;

  const results = useMemo(
    () => matchHospitals(list.hospitals, conditions, origin),
    [list.hospitals, conditions, origin],
  );

  const regionChosen = conditions.region.sido !== null || origin.kind === "device";

  /** 확인된 상태가 하나도 없다. 목록은 있는데 답이 없는 상태다. */
  const nothingConfirmed =
    results.length > 0 && results.every((m) => m.hospital.liveStatus === null);

  return (
    <>
      <AppHeader title="진료정보" backHref="/" />
      <StageNotice />

      <main className="space-y-3 px-4 pb-6 pt-3">
        <ConditionBar hospitals={list.hospitals} />

        {/* 지역 미선택 안내. 결과를 막지 않고 안내만 한다. */}
        {ready && !regionChosen && (
          <p className="rounded-field bg-blue-soft px-4 py-3 text-[13.5px] leading-relaxed text-blue-deep">
            지역을 고르면 가까운 곳부터 좁혀서 볼 수 있어요. 지금은 등록된 전체 의료기관을 보여
            주고 있습니다.
          </p>
        )}

        {/*
          now 가 아직 없으면(첫 렌더) 카드를 그리지 않는다. 카드의 모든 시간 판정이
          now 하나에서 나오므로, 사용자의 시계를 알기 전에 그리면 서버에서 굳은 시각으로
          "N분 전"을 적게 된다. 로딩 표시를 이미 쓰고 있어 화면이 하나 더 생기지는 않는다.
        */}
        {list.status === "loading" || now === null ? (
          <div className="space-y-3" aria-busy="true" aria-label="의료기관 정보를 불러오는 중입니다">
            {[0, 1].map((i) => (
              <div key={i} className="ct-card h-56 animate-pulse" />
            ))}
          </div>
        ) : list.status === "error" ? (
          /* 조회 실패를 '결과 0건'으로 표시하지 않는다. */
          <div className="ct-card p-7 text-center">
            <p className="text-[17px] font-bold">의료기관 정보를 불러오지 못했습니다.</p>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">
              잠시 후 다시 시도해 주세요. 위급한 상황이라면 119에 연락하세요.
            </p>
          </div>
        ) : results.length === 0 ? (
          <>
            <div className="ct-card p-7 text-center">
              <p className="text-[17px] font-bold">
                {regionChosen ? "이 지역에는 등록된 의료기관 정보가 없습니다." : "등록된 의료기관 정보가 없습니다."}
              </p>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">
                조건을 넓혀 보거나, 위급한 상황이라면 119에 연락하세요.
              </p>
            </div>
            {/* 0건이 막다른 길이 되지 않게. 조건을 그대로 들고 현장톡으로 간다. */}
          </>
        ) : (
          <>
            <p className="px-1 text-[13px] leading-relaxed text-ink-faint">
              <span className="font-semibold text-ink-muted">
                선택 조건과 관련된 의료기관 정보 {results.length}곳
              </span>{" "}
              · 추천이나 순서 조정은 하지 않습니다.
              <br />
              {NOT_A_BOOKING} {CALL_IS_SUREST}
            </p>
            <div className="space-y-3">
              {results.map((match) => (
                <HospitalCard key={match.hospital.id} match={match} now={now} />
              ))}
            </div>

            {/*
              결과는 있는데 확인된 상태가 하나도 없을 때. 참여 병원이 0곳인 동안 이게
              기본 화면이고, 보호자가 얻는 답이 "전화해 보세요" 하나로 끝난다.
              전화를 대신하지 않고, 갈 곳을 하나 더 준다.
            */}
          </>
        )}

        <Link href="/" className="ct-secondary w-full">
          조건 다시 고르기
        </Link>
      </main>
    </>
  );
}
