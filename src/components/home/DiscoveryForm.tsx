"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useHospitalList } from "@/features/hospitals/useHospitalList";
import { SIDO_LIST, sidoOptions, sigunguOptions, type Sido } from "@/features/reports/regions";
import { useDiscovery } from "@/features/discovery/DiscoveryProvider";
import { useNearby } from "@/features/discovery/useNearby";
import {
  CARE_CATEGORIES,
  FOLLOWUP_GOALS,
  VISIT_PURPOSES,
  hasAnyCondition,
} from "@/features/discovery/types";

/**
 * 홈 탐색 조건.
 *
 * 세 가지를 묻지만 **하나도 고르지 않아도 결과를 볼 수 있다.** 미선택은 '전체'·'미정'이다.
 * 결과 화면에서도 같은 조건을 바꿀 수 있다(ConditionBar).
 *
 * [내 주변]은 누를 때만 위치를 요청한다. 거부·시간 초과면 지역 선택으로 이어진다.
 * 선택한 지역을 '내 주변'으로 표시하지 않는다 — 둘은 다른 라벨을 쓴다.
 */
export function DiscoveryForm() {
  const { conditions, origin, setRegion, setCategory, setVisitPurpose, setFollowupGoal, reset } =
    useDiscovery();
  const nearby = useNearby();
  const list = useHospitalList();
  const [regionOpen, setRegionOpen] = useState(false);

  const availableSido = useMemo(() => sidoOptions(list.hospitals), [list.hospitals]);
  const availableSigungu = useMemo(
    () => sigunguOptions(list.hospitals, conditions.region.sido),
    [list.hospitals, conditions.region.sido],
  );

  const regionText =
    origin.kind === "device"
      ? "현재 위치 기준"
      : conditions.region.sigungu ?? conditions.region.sido ?? null;

  return (
    <section className="mt-6 space-y-3">
      {/* ① 어디에서 찾으세요? */}
      <div className="ct-card p-4">
        <h3 className="text-[15px] font-bold">어디에서 찾으세요?</h3>
        <div className="mt-2.5 flex gap-2">
          <button
            type="button"
            onClick={() => {
              setRegionOpen(false);
              nearby.request();
            }}
            aria-pressed={origin.kind === "device"}
            className={`h-11 flex-1 rounded-field text-[14.5px] font-semibold transition active:scale-[0.98] ${
              origin.kind === "device"
                ? "bg-blue-soft text-blue-deep ring-1 ring-inset ring-blue"
                : "bg-fill text-ink-muted"
            }`}
          >
            {nearby.status === "requesting" ? "확인 중…" : "내 주변"}
          </button>
          <button
            type="button"
            onClick={() => {
              nearby.clear();
              setRegionOpen((v) => !v);
            }}
            aria-expanded={regionOpen}
            className={`h-11 flex-1 rounded-field text-[14.5px] font-semibold transition active:scale-[0.98] ${
              origin.kind === "region"
                ? "bg-blue-soft text-blue-deep ring-1 ring-inset ring-blue"
                : "bg-fill text-ink-muted"
            }`}
          >
            지역 검색
          </button>
        </div>

        {nearby.message && (
          <p
            role={nearby.status === "requesting" ? "status" : "alert"}
            className="mt-2 rounded-field bg-caution-soft px-3.5 py-2.5 text-[13px] leading-relaxed text-caution-ink"
          >
            {nearby.message}
            {nearby.status !== "requesting" && nearby.status !== "granted" && (
              <button
                type="button"
                onClick={() => setRegionOpen(true)}
                className="ml-1.5 font-bold underline"
              >
                지역 선택하기
              </button>
            )}
          </p>
        )}

        {(regionOpen || (conditions.region.sido !== null && origin.kind !== "device")) && (
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[12px] font-semibold text-ink-faint">시/도</span>
              <select
                aria-label="시/도 선택"
                value={conditions.region.sido ?? ""}
                onChange={(e) => setRegion((e.target.value || null) as Sido | null, null)}
                className="ct-field mt-1 h-11 text-[14.5px]"
              >
                <option value="">선택</option>
                {(availableSido.length > 0 ? availableSido : SIDO_LIST).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[12px] font-semibold text-ink-faint">시/군/구</span>
              <select
                aria-label="시/군/구 선택"
                value={conditions.region.sigungu ?? ""}
                onChange={(e) => setRegion(conditions.region.sido, e.target.value || null)}
                disabled={conditions.region.sido === null}
                className="ct-field mt-1 h-11 text-[14.5px] disabled:text-ink-faint"
              >
                <option value="">전체</option>
                {availableSigungu.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {/* 선택 지역과 현재 위치를 같은 말로 쓰지 않는다. */}
        <p className="mt-2 text-[12.5px] text-ink-faint">
          {regionText ? (
            origin.kind === "device" ? (
              <>
                <span className="font-semibold text-ink-muted">현재 위치</span> 기준으로 찾습니다
              </>
            ) : (
              <>
                선택한 지역 <span className="font-semibold text-ink-muted">{regionText}</span> 에서
                찾습니다
              </>
            )
          ) : (
            "지역을 고르지 않아도 전체 결과를 볼 수 있습니다"
          )}
        </p>
      </div>

      {/* ② 어떤 진료 정보를 찾으세요? */}
      <div className="ct-card p-4">
        <h3 className="text-[15px] font-bold">어떤 진료 정보를 찾으세요?</h3>
        <div role="group" aria-label="진료 항목" className="mt-2.5 grid grid-cols-3 gap-1 rounded-[16px] bg-fill p-1">
          {CARE_CATEGORIES.map((c) => {
            const on = conditions.category === c.value;
            return (
              <button
                key={c.value}
                type="button"
                aria-pressed={on}
                onClick={() => setCategory(on ? null : c.value)}
                className={`h-11 break-keep rounded-field px-1 text-[14px] transition active:scale-[0.97] ${
                  on ? "bg-blue-soft font-bold text-blue-deep ring-1 ring-inset ring-blue" : "font-semibold text-ink-muted"
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ③ 처음 진료인가요, 치료 후 방문인가요? */}
      <div className="ct-card p-4">
        <h3 className="text-[15px] font-bold">처음 진료인가요, 치료 후 방문인가요?</h3>
        <div role="group" aria-label="방문 목적" className="mt-2.5 flex gap-2">
          {VISIT_PURPOSES.map((p) => {
            const on = conditions.visitPurpose === p.value;
            return (
              <button
                key={p.value}
                type="button"
                aria-pressed={on}
                onClick={() => setVisitPurpose(on ? null : p.value)}
                className={`h-11 flex-1 break-keep rounded-field text-[14.5px] transition active:scale-[0.98] ${
                  on ? "bg-blue-soft font-bold text-blue-deep ring-1 ring-inset ring-blue" : "bg-fill font-semibold text-ink-muted"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[12.5px] text-ink-faint">고르지 않으면 &apos;미정&apos;으로 찾습니다</p>

        {conditions.visitPurpose === "followup" && (
          <div className="mt-3">
            <p className="text-[13px] font-semibold text-ink-muted">무엇을 확인하러 가세요?</p>
            <div role="group" aria-label="치료 후 방문 목적" className="mt-2 grid grid-cols-2 gap-2">
              {FOLLOWUP_GOALS.map((g) => {
                const on = conditions.followupGoal === g.value;
                return (
                  <button
                    key={g.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setFollowupGoal(on ? null : g.value)}
                    className={`min-h-[44px] break-keep rounded-field px-2 py-2 text-[13.5px] transition active:scale-[0.97] ${
                      on ? "bg-blue-soft font-bold text-blue-deep ring-1 ring-inset ring-blue" : "bg-fill font-semibold text-ink-muted"
                    }`}
                  >
                    {g.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Link href="/search" className="ct-primary flex-1">
          병원 정보 보기
        </Link>
        {hasAnyCondition(conditions) && (
          <button
            type="button"
            onClick={() => {
              reset();
              nearby.clear();
              setRegionOpen(false);
            }}
            className="h-14 shrink-0 rounded-field bg-fill px-4 text-[14.5px] font-semibold text-ink-muted active:brightness-95"
          >
            조건 초기화
          </button>
        )}
      </div>
    </section>
  );
}
