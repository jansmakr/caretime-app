"use client";

import { useState } from "react";
import { canLocate, locateMyRegion } from "@/features/regions/geolocate";
import { type MyRegion } from "@/features/regions/sigungu";

/**
 * "내 위치로 선택".
 *
 * ── 묻기 전에 묻지 않는다 ───────────────────────────────────
 * 화면이 열릴 때 위치를 요청하지 않는다. **버튼을 누른 뒤에만** 권한 창이 뜨고,
 * 카카오 SDK 도 그때 받아 온다. 쓸 생각이 없는 사람의 브라우저가 카카오에
 * 접속하는 일이 없어야 한다.
 *
 * ── 확인 창을 두지 않는다 ───────────────────────────────────
 * 찾으면 **바로 적용한다.** 한 번 더 묻는 창을 두면 급한 사람이 결정을 두 번
 * 하게 되고(원칙 1), 대부분은 그냥 "맞아요"를 누른다 — 그 누름은 확인이 아니라
 * 장애물이다. 대신 **바꾸는 길을 바로 옆에 둔다**(작성창의 "바꾸기").
 * 틀렸을 때 고치는 비용이 한 번 누르는 것이면 미리 묻지 않아도 된다.
 *
 * ── 실패해도 글쓰기는 그대로다 ──────────────────────────────
 * 권한 거부·시간 초과·SDK 실패 어느 쪽이든 **한 줄 안내로 끝난다.** 직접 고르는
 * 길은 늘 열려 있고, 지역 없이도 글은 올라간다.
 *
 * 키가 없으면 버튼 자체를 그리지 않는다. 눌러도 안 되는 버튼을 만들지 않는다.
 */
export function LocateButton({ onPick }: { onPick: (region: MyRegion) => void }) {
  const [busy, setBusy] = useState(false);
  /*
   * 들고 있는 것은 **실패 사유 한 줄**뿐이다. 좌표도, 좌표에서 나온 숫자도 여기
   * 들어오지 않는다 — locateMyRegion 이 돌려주는 값에 숫자가 없다
   * (features/regions/geolocate 의 LocateOutcome).
   */
  const [failed, setFailed] = useState<string | null>(null);

  if (!canLocate()) return null;

  async function run() {
    setBusy(true);
    setFailed(null);

    const result = await locateMyRegion();
    setBusy(false);

    if (result.kind === "matched" || result.kind === "sido-only") {
      // 찾았으면 바로 적용한다. 바꾸는 것은 바로 옆에서 할 수 있다.
      onPick(result.region);
      return;
    }
    setFailed(result.reason);
  }

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
