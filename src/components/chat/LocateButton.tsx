"use client";

import { useState } from "react";
import { canLocate, locateMyRegion, type LocateOutcome } from "@/features/regions/geolocate";
import { regionLabel, type MyRegion } from "@/features/regions/sigungu";

/**
 * "내 위치로 선택".
 *
 * ── 묻기 전에 묻지 않는다 ───────────────────────────────────
 * 화면이 열릴 때 위치를 요청하지 않는다. **버튼을 누른 뒤에만** 권한 창이 뜨고,
 * 카카오 SDK 도 그때 받아 온다. 쓸 생각이 없는 사람의 브라우저가 카카오에
 * 접속하는 일이 없어야 한다.
 *
 * ── 찾은 값을 바로 넣지 않는다 ──────────────────────────────
 * "서울 강서구가 맞나요?"를 한 번 묻는다. 위치는 틀릴 수 있고(건물 안·지하),
 * 틀린 지역이 조용히 붙으면 그 글을 읽은 사람이 헛걸음한다. 확인은 한 번뿐이고
 * 누르면 줄이 사라진다 — 화면에 남는 결정을 늘리지 않는다(원칙 1·4).
 *
 * ── 실패해도 글쓰기는 그대로다 ──────────────────────────────
 * 권한 거부·시간 초과·SDK 실패 어느 쪽이든 **한 줄 안내로 끝난다.** 직접 고르는
 * 길(지역 바꾸기)은 늘 열려 있고, 지역 없이도 글은 올라간다.
 *
 * 키가 없으면 버튼 자체를 그리지 않는다. 눌러도 안 되는 버튼을 만들지 않는다.
 */
export function LocateButton({ onPick }: { onPick: (region: MyRegion) => void }) {
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<LocateOutcome | null>(null);

  if (!canLocate()) return null;

  async function run() {
    setBusy(true);
    setOutcome(null);
    /*
     * 좌표는 여기까지 올라오지 않는다. locateMyRegion 이 돌려주는 것은 지역
     * 이름뿐이고(features/regions/geolocate), 그래서 상태에 담길 수가 없다.
     */
    const result = await locateMyRegion();
    setOutcome(result);
    setBusy(false);
  }

  /** 확인을 받아야 하는 결과인가. 맞으면 그 지역을 돌려준다. */
  const pending =
    outcome?.kind === "matched" || outcome?.kind === "sido-only" ? outcome.region : null;

  if (pending) {
    return (
      <div className="mt-2 rounded-field bg-blue-soft px-3.5 py-3">
        <p className="break-keep text-[14px] font-semibold leading-relaxed text-blue-deep">
          {regionLabel(pending)} 이(가) 맞나요?
        </p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => {
              onPick(pending);
              setOutcome(null);
            }}
            className="min-h-[44px] flex-1 rounded-field bg-blue px-4 text-[15px] font-bold text-white"
          >
            맞아요
          </button>
          <button
            type="button"
            onClick={() => setOutcome(null)}
            className="min-h-[44px] flex-1 rounded-field px-4 text-[15px] font-semibold text-ink-muted"
          >
            직접 고를게요
          </button>
        </div>
      </div>
    );
  }

  const failed =
    outcome?.kind === "failed" || outcome?.kind === "unmatched" ? outcome.reason : null;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        className="min-h-[44px] w-full rounded-field bg-fill px-4 text-[15px] font-semibold text-blue disabled:text-ink-faint"
      >
        {busy ? "위치를 찾는 중입니다…" : "내 위치로 선택"}
      </button>

      {failed && (
        <p role="alert" className="mt-1.5 break-keep text-[13.5px] leading-relaxed text-limited-ink">
          {failed}
        </p>
      )}

      {/*
        약속을 버튼 바로 아래에 적는다. 방침에도 같은 내용이 있지만(1-5), 권한 창이
        뜨기 **직전에** 읽는 한 줄이 실제로 읽히는 유일한 자리다.
      */}
      <p className="mt-1.5 break-keep text-[13.5px] leading-relaxed text-ink-faint">
        위치는 지역 이름을 찾는 데만 쓰고 저장하지 않습니다
      </p>
    </div>
  );
}
