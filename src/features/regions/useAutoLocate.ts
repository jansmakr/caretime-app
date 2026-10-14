"use client";

import { useEffect, useRef } from "react";
import { canLocate, isLocationAllowed, locateMyRegion, shouldAutoLocate } from "./geolocate";
import { type MyRegion } from "./sigungu";

/**
 * 위치 권한을 **이미 허락한 사람**에게는 화면을 열 때 지역을 알아서 채운다.
 *
 * ── 처음 온 사람에게는 묻지 않는다 ──────────────────────────
 * 권한 상태가 "granted" 일 때만 돈다(isLocationAllowed). 처음 온 사람은 "내 위치로
 * 선택"을 한 번 누르면 되고, 그다음부터는 지역이 비어 있을 때 자동으로 채워진다.
 * 화면을 열자마자 권한 창을 띄우지 않는 이유는 geolocate.isLocationAllowed 에 있다.
 *
 * ── 고른 값을 덮지 않는다 ───────────────────────────────────
 * 저장된 지역이 있으면 아무것도 하지 않는다(shouldAutoLocate).
 *
 * ── 실패는 조용히 끝난다 ────────────────────────────────────
 * 사용자가 누른 것이 아니므로 실패 문구를 띄우지 않는다. 버튼과 직접 고르는 길은
 * 그대로 남아 있다. 좌표는 locateMyRegion 밖으로 나오지 않는다 — 버튼과 같은 경로다.
 *
 * 한 화면에서 한 번만 돈다. 지역을 지운 뒤 같은 화면에서 다시 채우지 않는다 —
 * 지운 사람의 뜻을 위치가 되돌리면 안 된다.
 */
export function useAutoLocate({
  regionLoaded,
  region,
  onPick,
}: {
  regionLoaded: boolean;
  region: MyRegion | null;
  onPick: (region: MyRegion) => void;
}): void {
  const tried = useRef(false);

  useEffect(() => {
    if (tried.current || !regionLoaded) return;
    tried.current = true;
    if (region !== null || !canLocate()) return;

    let live = true;
    void (async () => {
      const permissionGranted = await isLocationAllowed();
      if (
        !live ||
        !shouldAutoLocate({
          regionLoaded,
          hasRegion: region !== null,
          keyConfigured: canLocate(),
          permissionGranted,
        })
      ) {
        return;
      }
      const result = await locateMyRegion();
      if (!live) return;
      if (result.kind === "matched" || result.kind === "sido-only") onPick(result.region);
    })();

    return () => {
      live = false;
    };
  }, [regionLoaded, region, onPick]);
}
