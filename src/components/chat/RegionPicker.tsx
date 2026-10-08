"use client";

import { useId, useState } from "react";
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
 *
 * ── 시/도만 고른 상태를 밖으로 내보내지 않는다 ──────────────
 * 전에는 시/도를 고르는 순간 `onChange({ sido, sigungu: null })` 을 불렀다. 둘째
 * 칸을 채우려면 시/도를 알아야 해서 그렇게 했는데, 그 값이 그대로 **저장됐다** —
 * 홈에 "내 지역 서울"이 떴다. 고른 것처럼 보이는데 "내 지역 보기"는 서울 전체다.
 *
 * 그래서 고르는 중인 시/도는 **이 컴포넌트 안에만** 둔다. 밖으로 나가는 것은
 * 끝난 값뿐이다 — 구까지 골랐을 때, 또는 구 목록이 없는 시도를 골랐을 때.
 */
export function RegionPicker({
  region,
  onChange,
}: {
  region: MyRegion | null;
  onChange: (next: MyRegion) => void;
}) {
  const ids = useId();
  /*
   * 고르는 중인 시/도. 저장된 값으로 시작하고, 바꾸면 여기만 바뀐다.
   * 끝나지 않은 선택을 부모에게 넘기지 않으므로 부모는 "서울"을 저장할 길이 없다.
   */
  const [draftSido, setDraftSido] = useState<Sido | null>(region?.sido ?? null);
  const sido = draftSido;
  const choices = sigunguChoices(sido);
  const needsSigungu = sido !== null && hasSigunguList(sido);
  // 저장된 구는 저장된 시/도와 같을 때만 보여 준다. 시/도를 바꾸면 비어 보인다.
  const shownSigungu = region !== null && region.sido === sido ? (region.sigungu ?? "") : "";

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
            setDraftSido(next);
            /*
             * 구 목록이 없는 시도는 여기서 끝이다. 그때만 밖으로 내보낸다 —
             * 서울을 고른 사람은 구를 고를 때까지 아무것도 저장되지 않는다.
             */
            if (!hasSigunguList(next)) onChange({ sido: next, sigungu: null });
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
          value={shownSigungu}
          disabled={!needsSigungu}
          onChange={(e) => {
            // "선택"으로 되돌리는 것은 고르기를 취소하는 것이다. 저장하지 않는다.
            if (sido === null || e.target.value === "") return;
            onChange({ sido, sigungu: e.target.value });
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
