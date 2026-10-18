"use client";

import { useEffect, useRef } from "react";
import { canLocate, locateMyRegion, locationPermission, shouldAutoLocate } from "./geolocate";
import { type MyRegion } from "./sigungu";

/**
 * 이 탭에서 이미 권한 창을 띄웠는가. **메모리에만 있다** — 기기에 저장하지 않는다.
 * 새로 열면 다시 묻는다(지역을 아직 안 골랐고 거부하지도 않았을 때만).
 */
let askedThisTab = false;

/**
 * 화면을 열 때 지역이 비어 있으면 **위치로 바로 찾는다.**
 *
 * ── 접속하면 바로 묻는다 (2026-10-18) ───────────────────────
 * 처음 온 사람에게도 권한 창을 띄운다. 언제 묻고 언제 안 묻는지는
 * geolocate.shouldAutoLocate 에 있다(거부한 사람·지역을 고른 사람에게는 묻지 않고,
 * 한 탭에서 한 번만 묻는다).
 *
 * ── 고른 값을 덮지 않는다 ───────────────────────────────────
 * 저장된 지역이 있으면 아무것도 하지 않는다.
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
      const permission = await locationPermission();
      if (
        !live ||
        !shouldAutoLocate({
          regionLoaded,
          hasRegion: region !== null,
          keyConfigured: canLocate(),
          permission,
          alreadyAsked: askedThisTab,
        })
      ) {
        return;
      }
      if (permission !== "granted") askedThisTab = true;
      const result = await locateMyRegion();
      if (!live) return;
      if (result.kind === "matched" || result.kind === "sido-only") onPick(result.region);
    })();

    return () => {
      live = false;
    };
  }, [regionLoaded, region, onPick]);
}
