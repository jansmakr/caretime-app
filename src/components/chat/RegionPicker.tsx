"use client";

import { useId } from "react";
import { SIDO_LIST, type Sido } from "@/features/reports/regions";
import { hasSigunguList, sigunguChoices, type MyRegion } from "@/features/regions/sigungu";

/**
 * 내 지역 고르기. 시/도 → 구.
 *
 * 한 화면의 결정이 하나여야 하므로(원칙 1) 버튼을 두지 않고 **고르면 바로 정해진다.**
 * "확인"을 누르게 하면 고른 뒤에 한 번 더 결정하게 된다.
 *
 * 구 목록이 없는 시도는 시/도까지만 고른다(features/regions/sigungu). 없는 구를
 * 고르게 만들지 않는다 — 고른 지역에 글이 안 붙는 것만큼 나쁜 것이 없다.
 */
export function RegionPicker({
  region,
  onChange,
}: {
  region: MyRegion | null;
  onChange: (next: MyRegion) => void;
}) {
  const ids = useId();
  const sido = region?.sido ?? null;
  const choices = sigunguChoices(sido);
  const needsSigungu = sido !== null && hasSigunguList(sido);

  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="block">
        <span className="text-[12.5px] font-semibold text-ink-faint">시 · 도</span>
        <select
          id={`${ids}-sido`}
          aria-label="시도 선택"
          value={sido ?? ""}
          onChange={(e) => {
            const next = SIDO_LIST.find((s) => s === e.target.value);
            if (!next) return;
            // 시도를 바꾸면 구는 비운다. 다른 시도의 구가 남아 있으면 안 된다.
            onChange({ sido: next, sigungu: null });
          }}
          className="ct-field mt-1 h-12 text-[15px]"
        >
          <option value="">선택</option>
          {SIDO_LIST.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-[12.5px] font-semibold text-ink-faint">
          시 · 군 · 구{needsSigungu ? "" : " (준비 중)"}
        </span>
        <select
          id={`${ids}-sigungu`}
          aria-label="시군구 선택"
          value={region?.sigungu ?? ""}
          disabled={!needsSigungu}
          onChange={(e) => {
            if (sido === null) return;
            onChange({ sido, sigungu: e.target.value === "" ? null : e.target.value });
          }}
          className="ct-field mt-1 h-12 text-[15px] disabled:text-ink-faint"
        >
          <option value="">{needsSigungu ? "선택" : "시 · 도만"}</option>
          {choices.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
