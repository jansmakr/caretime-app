"use client";

import { useMemo } from "react";
import type { HospitalView } from "@/features/hospitals/types";
import { searchDirectory, toDirectory } from "@/features/reports/directory";
import { SIDO_LIST, sidoOptions, sigunguOptions, type Sido } from "@/features/reports/regions";
import { describeFilter, isFilterActive } from "@/features/chat/service";
import { EMPTY_FILTER, type ChatFilter } from "@/features/chat/types";

/**
 * 지역 · 병원 필터.
 *
 * 무엇이 걸려 있는지 한 줄로 보여준다. 필터를 켜 둔 걸 모르고 "글이 없네"로 읽는 일이
 * 가장 흔한 오해라서, 초기화 버튼을 항상 같은 자리에 둔다.
 */
export function ChatFilterBar({
  hospitals,
  loading,
  filter,
  onChange,
}: {
  hospitals: HospitalView[];
  loading: boolean;
  filter: ChatFilter;
  onChange: (next: ChatFilter) => void;
}) {
  const directory = useMemo(() => toDirectory(hospitals), [hospitals]);
  const availableSido = useMemo(() => sidoOptions(hospitals), [hospitals]);
  const availableSigungu = useMemo(() => sigunguOptions(hospitals, filter.sido), [hospitals, filter.sido]);
  const hospitalChoices = useMemo(
    () => searchDirectory(directory, { sido: filter.sido, sigungu: filter.sigungu, query: "" }),
    [directory, filter.sido, filter.sigungu],
  );
  const selectedName = hospitalChoices.find((h) => h.id === filter.hospitalId)?.name ?? null;

  return (
    <section className="ct-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[14px] font-bold">
          지역 · 병원
          <span className="ml-2 font-semibold text-ink-faint">{describeFilter(filter, selectedName)}</span>
        </h2>
        <button
          type="button"
          onClick={() => onChange(EMPTY_FILTER)}
          disabled={!isFilterActive(filter)}
          className="shrink-0 rounded-pill bg-fill px-3 py-1.5 text-[12.5px] font-semibold text-ink-muted
                     active:brightness-95 disabled:text-line"
        >
          전체 보기
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[12px] font-semibold text-ink-faint">시/도</span>
          <select
            value={filter.sido ?? ""}
            aria-label="시/도 필터"
            onChange={(e) =>
              // 시/도가 바뀌면 그 아래 선택은 더 이상 유효하지 않다. 같이 비운다.
              onChange({ sido: (e.target.value || null) as Sido | null, sigungu: null, hospitalId: null })
            }
            className="ct-field mt-1 h-11 text-[14.5px]"
          >
            <option value="">전체</option>
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
            value={filter.sigungu ?? ""}
            aria-label="시/군/구 필터"
            onChange={(e) => onChange({ ...filter, sigungu: e.target.value || null, hospitalId: null })}
            className="ct-field mt-1 h-11 text-[14.5px]"
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

      <label className="mt-2 block">
        <span className="text-[12px] font-semibold text-ink-faint">의료기관</span>
        <select
          value={filter.hospitalId ?? ""}
          aria-label="의료기관 필터"
          onChange={(e) => onChange({ ...filter, hospitalId: e.target.value || null })}
          className="ct-field mt-1 h-11 text-[14.5px]"
        >
          <option value="">전체</option>
          {hospitalChoices.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
      </label>

      {loading && <p className="mt-2 text-[12.5px] text-ink-faint">의료기관 목록을 불러오는 중입니다.</p>}
    </section>
  );
}
