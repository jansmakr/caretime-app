"use client";

import { useId, useMemo, useState } from "react";
import { useHospitalList } from "@/features/hospitals/useHospitalList";
import {
  manualTarget,
  searchDirectory,
  targetFromEntry,
  toDirectory,
} from "@/features/reports/directory";
import { sidoOptions, sigunguOptions, SIDO_LIST, type Sido } from "@/features/reports/regions";
import type { ReportTarget } from "@/features/reports/types";

/**
 * 제보 대상 의료기관 지정.
 *
 * 기본값은 지금 보고 있는 병원이다. 대부분은 이 화면의 병원을 제보하러 오기 때문에
 * 평소에는 접힌 한 줄로만 두고, 바꿀 때만 펼친다.
 *
 * 지역(시/도 · 시/군/구)으로 좁힌 뒤 병원명 부분일치로 찾고,
 * 목록에 없으면 수기 직접 입력으로 넘어간다. 수기 입력은 끝까지 hospitalId 가 없다.
 */
export function ReportTargetPicker({
  target,
  onChange,
  defaultTarget,
}: {
  target: ReportTarget;
  onChange: (next: ReportTarget) => void;
  defaultTarget: ReportTarget;
}) {
  const list = useHospitalList();
  const directory = useMemo(() => toDirectory(list.hospitals), [list.hospitals]);

  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState(false);
  const [sido, setSido] = useState<Sido | null>(defaultTarget.sido);
  const [sigungu, setSigungu] = useState<string | null>(defaultTarget.sigungu);
  const [query, setQuery] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualSigungu, setManualSigungu] = useState("");

  const ids = useId();
  const availableSido = useMemo(() => sidoOptions(list.hospitals), [list.hospitals]);
  const availableSigungu = useMemo(
    () => sigunguOptions(list.hospitals, sido),
    [list.hospitals, sido],
  );
  const suggestions = useMemo(
    () => searchDirectory(directory, { sido, sigungu, query }),
    [directory, sido, sigungu, query],
  );

  function pickSido(next: Sido | null) {
    setSido(next);
    // 시/도를 바꾸면 이전 시/군/구는 더 이상 유효하지 않다. 남겨두면 결과가 0건이 된다.
    setSigungu(null);
  }

  function commitManual() {
    if (manualName.trim() === "") return;
    onChange(manualTarget({ name: manualName, sido, sigungu: manualSigungu || sigungu }));
    setOpen(false);
  }

  if (!open) {
    return (
      <div className="flex items-start justify-between gap-3 rounded-field bg-fill px-4 py-3">
        <div className="min-w-0">
          <p className="text-[12.5px] font-semibold text-ink-faint">제보할 의료기관</p>
          <p className="mt-0.5 truncate text-[15.5px] font-bold">{target.hospitalName}</p>
          <p className="mt-0.5 text-[12.5px] text-ink-faint">
            {[target.sido, target.sigungu].filter(Boolean).join(" ") || "지역 미지정"}
            {target.kind === "manual" && " · 직접 입력"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 rounded-pill bg-surface px-3 py-1.5 text-[13px] font-semibold text-blue-deep active:brightness-95"
        >
          변경
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-field bg-fill p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-bold">제보할 의료기관 찾기</p>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setManual(false);
          }}
          className="rounded-pill px-2.5 py-1 text-[13px] font-semibold text-ink-faint active:bg-surface"
        >
          닫기
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[12px] font-semibold text-ink-faint">시/도</span>
          <select
            value={sido ?? ""}
            onChange={(e) => pickSido((e.target.value || null) as Sido | null)}
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
            value={sigungu ?? ""}
            onChange={(e) => setSigungu(e.target.value || null)}
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

      {manual ? (
        <div className="mt-3">
          <label htmlFor={`${ids}-manual`} className="text-[12px] font-semibold text-ink-faint">
            의료기관명 직접 입력
          </label>
          <input
            id={`${ids}-manual`}
            value={manualName}
            onChange={(e) => setManualName(e.target.value)}
            maxLength={40}
            placeholder="예: ○○의원"
            className="ct-field mt-1 h-12"
          />
          <input
            value={manualSigungu}
            onChange={(e) => setManualSigungu(e.target.value)}
            maxLength={20}
            placeholder="시/군/구 직접 입력 (선택)"
            aria-label="시/군/구 직접 입력"
            className="ct-field mt-2 h-12"
          />
          <p className="mt-2 text-[12px] leading-relaxed text-ink-faint">
            목록에 없는 의료기관은 공공정보와 연결되지 않습니다. 이름이 정확히 같은 제보끼리만 함께
            보입니다.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={commitManual}
              disabled={manualName.trim() === ""}
              className="h-11 flex-1 rounded-field bg-blue text-[14.5px] font-semibold text-white transition
                         active:scale-[0.98] disabled:bg-line disabled:text-ink-faint disabled:active:scale-100"
            >
              이 이름으로 지정
            </button>
            <button
              type="button"
              onClick={() => setManual(false)}
              className="h-11 flex-1 rounded-field bg-surface text-[14.5px] font-semibold text-ink-muted active:brightness-95"
            >
              목록에서 찾기
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <label htmlFor={`${ids}-query`} className="text-[12px] font-semibold text-ink-faint">
            병원명 검색
          </label>
          <input
            id={`${ids}-query`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={40}
            autoComplete="off"
            placeholder="병원명을 입력하세요"
            className="ct-field mt-1 h-12"
          />

          <ul className="mt-2 space-y-1.5" aria-label="검색 결과">
            {suggestions.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(targetFromEntry(entry));
                    setOpen(false);
                  }}
                  className="flex w-full items-baseline justify-between gap-2 rounded-field bg-surface px-3.5 py-2.5 text-left active:brightness-95"
                >
                  <span className="min-w-0 truncate text-[14.5px] font-semibold">{entry.name}</span>
                  <span className="shrink-0 text-[12px] text-ink-faint">
                    {[entry.sido, entry.sigungu].filter(Boolean).join(" ")}
                  </span>
                </button>
              </li>
            ))}
            {list.status === "loading" && (
              <li className="px-1 py-2 text-[13px] text-ink-faint">
                의료기관 목록을 불러오는 중입니다.
              </li>
            )}
            {list.status !== "loading" && suggestions.length === 0 && (
              <li className="px-1 py-2 text-[13px] text-ink-faint">
                조건에 맞는 의료기관이 목록에 없습니다.
              </li>
            )}
          </ul>

          <button
            type="button"
            onClick={() => {
              setManual(true);
              setManualName(query);
            }}
            className="mt-2 w-full rounded-field bg-surface px-3.5 py-3 text-[14px] font-semibold text-blue-deep active:brightness-95"
          >
            목록에 없나요? 직접 입력하기
          </button>
        </div>
      )}
    </div>
  );
}
