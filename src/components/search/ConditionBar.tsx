"use client";

import { useMemo, useState } from "react";
import type { HospitalView } from "@/features/hospitals/types";
import { SIDO_LIST, sidoOptions, sigunguOptions, type Sido } from "@/features/reports/regions";
import { useDiscovery } from "@/features/discovery/DiscoveryProvider";
import { useNearby } from "@/features/discovery/useNearby";
import {
  CARE_CATEGORIES,
  FOLLOWUP_GOALS,
  VISIT_PURPOSES,
  conditionChips,
  hasAnyCondition,
} from "@/features/discovery/types";

/** 소아 만 나이 선택 범위. 생년월일을 묻지 않는다. */
const CHILD_AGES = Array.from({ length: 16 }, (_, i) => i);

/**
 * 결과 화면의 조건 바.
 *
 * 홈에서 안 고른 조건도 여기서 고를 수 있고, 고른 조건도 바꿀 수 있다.
 * 소아·만 나이는 **결과 화면에서 추가하는 선택 조건**이다(홈에서 묻지 않는다).
 * 이름·생년월일·병력은 묻지 않는다.
 */
export function ConditionBar({ hospitals }: { hospitals: HospitalView[] }) {
  const {
    conditions,
    origin,
    setRegion,
    setCategory,
    setVisitPurpose,
    setFollowupGoal,
    setChild,
    setChildAge,
    reset,
  } = useDiscovery();
  const nearby = useNearby();
  const [open, setOpen] = useState(false);

  const availableSido = useMemo(() => sidoOptions(hospitals), [hospitals]);
  const availableSigungu = useMemo(
    () => sigunguOptions(hospitals, conditions.region.sido),
    [hospitals, conditions.region.sido],
  );
  const chips = conditionChips(conditions);

  return (
    <section className="ct-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12.5px] font-semibold text-ink-faint">
            {origin.kind === "device" ? "현재 위치 기준" : "선택 조건"}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {chips.length > 0 ? (
              chips.map((c) => (
                <span key={c} className="ct-chip bg-blue-soft text-blue-deep">
                  {c}
                </span>
              ))
            ) : (
              <span className="text-[13.5px] text-ink-muted">조건 없이 전체를 보고 있습니다</span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="shrink-0 rounded-pill bg-fill px-3 py-1.5 text-[13px] font-semibold text-blue-deep active:brightness-95"
        >
          {open ? "닫기" : "조건 변경"}
        </button>
      </div>

      {open && (
        <div className="mt-3.5 space-y-3.5 border-t border-line pt-3.5">
          {/* 지역 */}
          <div>
            <p className="text-[13px] font-bold">지역</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => nearby.request()}
                aria-pressed={origin.kind === "device"}
                className={`h-11 flex-1 rounded-field text-[14px] font-semibold transition active:scale-[0.98] ${
                  origin.kind === "device"
                    ? "bg-blue-soft text-blue-deep ring-1 ring-inset ring-blue"
                    : "bg-fill text-ink-muted"
                }`}
              >
                {nearby.status === "requesting" ? "확인 중…" : "내 주변"}
              </button>
              <select
                aria-label="시/도 선택"
                value={conditions.region.sido ?? ""}
                onChange={(e) => setRegion((e.target.value || null) as Sido | null, null)}
                className="ct-field h-11 flex-1 text-[14px]"
              >
                <option value="">시/도 전체</option>
                {(availableSido.length > 0 ? availableSido : SIDO_LIST).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select
                aria-label="시/군/구 선택"
                value={conditions.region.sigungu ?? ""}
                onChange={(e) => setRegion(conditions.region.sido, e.target.value || null)}
                disabled={conditions.region.sido === null}
                className="ct-field h-11 flex-1 text-[14px] disabled:text-ink-faint"
              >
                <option value="">전체</option>
                {availableSigungu.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            {nearby.message && (
              <p
                role={nearby.status === "requesting" ? "status" : "alert"}
                className="mt-2 rounded-field bg-caution-soft px-3.5 py-2.5 text-[13px] leading-relaxed text-caution-ink"
              >
                {nearby.message}
              </p>
            )}
          </div>

          {/* 진료 항목 */}
          <div>
            <p className="text-[13px] font-bold">진료 항목</p>
            <div role="group" aria-label="진료 항목" className="mt-2 grid grid-cols-3 gap-1 rounded-[16px] bg-fill p-1">
              {CARE_CATEGORIES.map((c) => {
                const on = conditions.category === c.value;
                return (
                  <button
                    key={c.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setCategory(on ? null : c.value)}
                    className={`h-10 break-keep rounded-field text-[13.5px] transition active:scale-[0.97] ${
                      on ? "bg-blue-soft font-bold text-blue-deep ring-1 ring-inset ring-blue" : "font-semibold text-ink-muted"
                    }`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 방문 목적 */}
          <div>
            <p className="text-[13px] font-bold">방문 목적</p>
            <div role="group" aria-label="방문 목적" className="mt-2 flex gap-2">
              {VISIT_PURPOSES.map((p) => {
                const on = conditions.visitPurpose === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setVisitPurpose(on ? null : p.value)}
                    className={`h-10 flex-1 break-keep rounded-field text-[13.5px] transition active:scale-[0.98] ${
                      on ? "bg-blue-soft font-bold text-blue-deep ring-1 ring-inset ring-blue" : "bg-fill font-semibold text-ink-muted"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            {conditions.visitPurpose === "followup" && (
              <div role="group" aria-label="치료 후 방문 목적" className="mt-2 grid grid-cols-2 gap-2">
                {FOLLOWUP_GOALS.map((g) => {
                  const on = conditions.followupGoal === g.value;
                  return (
                    <button
                      key={g.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setFollowupGoal(on ? null : g.value)}
                      className={`min-h-[44px] break-keep rounded-field px-2 text-[13px] transition active:scale-[0.97] ${
                        on ? "bg-blue-soft font-bold text-blue-deep ring-1 ring-inset ring-blue" : "bg-fill font-semibold text-ink-muted"
                      }`}
                    >
                      {g.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 소아 · 만 나이 — 결과 화면에서 추가하는 선택 조건 */}
          <div>
            <p className="text-[13px] font-bold">소아 진료 (선택)</p>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                aria-pressed={conditions.isChild}
                onClick={() => setChild(!conditions.isChild)}
                className={`h-10 rounded-field px-4 text-[13.5px] transition active:scale-[0.97] ${
                  conditions.isChild
                    ? "bg-blue-soft font-bold text-blue-deep ring-1 ring-inset ring-blue"
                    : "bg-fill font-semibold text-ink-muted"
                }`}
              >
                소아 진료
              </button>
              {conditions.isChild && (
                <label className="flex items-center gap-2">
                  <span className="shrink-0 text-[12.5px] text-ink-faint">만 나이</span>
                  <select
                    aria-label="만 나이 선택"
                    value={conditions.childAgeYears ?? ""}
                    onChange={(e) => setChildAge(e.target.value === "" ? null : Number(e.target.value))}
                    className="ct-field h-10 text-[13.5px]"
                  >
                    <option value="">선택 안 함</option>
                    {CHILD_AGES.map((a) => (
                      <option key={a} value={a}>
                        만 {a}세
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-faint">
              나이는 이번 검색에만 쓰고 저장하지 않습니다. 이름·생년월일은 묻지 않습니다.
            </p>
          </div>

          {hasAnyCondition(conditions) && (
            <button
              type="button"
              onClick={() => {
                reset();
                nearby.clear();
              }}
              className="h-11 w-full rounded-field bg-fill text-[14px] font-semibold text-ink-muted active:brightness-95"
            >
              조건 초기화
            </button>
          )}
        </div>
      )}
    </section>
  );
}
