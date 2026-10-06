"use client";

import { useCallback, useEffect, useState } from "react";
import { SIDO_LIST } from "@/features/reports/regions";
import { isKnownRegion, isRegionComplete, type MyRegion } from "./sigungu";

/**
 * 내 지역을 **이 브라우저에만** 기억한다.
 *
 * ── 왜 서버가 아닌가 ────────────────────────────────────────
 * 서버(게스트 세션)에 넣으면 **수집 항목이 늘어난다** — 개인정보처리방침에 "거주
 * 지역" 한 줄이 붙고, 그건 되돌리기 어려운 추가다. 그리고 그럴 필요가 없다:
 * 구는 글을 쓸 때 글에 붙어 이미 저장되므로, "선호 지역"을 따로 들고 있을 이유가
 * 없다. 여기 있는 것은 **다음에 들어올 때 다시 묻지 않기 위한 편의값**이다.
 *
 * 쿠키도 쓰지 않는다. 쿠키는 읽기만 하는 사람에게도 심기고(지금은 글을 쓸 때만
 * 생긴다) 서버로 매 요청 올라간다. localStorage 는 올라가지 않는다.
 *
 * ── 대가 ────────────────────────────────────────────────────
 * 서버는 이 값을 못 읽는다. 그래서 **첫 화면은 전국**이고, 마운트 뒤에 내 구로
 * 바뀐다. 전환이 한 번 보이는 것을 받아들였다 — 방침에 줄을 늘리는 것보다 싸다.
 * 브라우저 저장소를 지우면 다시 묻는다.
 *
 * 읽기·쓰기를 전부 try/catch 로 싼다. 시크릿 창·저장소 차단에서 접근 자체가 던진다.
 */

const KEY = "caretime_my_region";

export function readMyRegion(): MyRegion | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { sido?: unknown; sigungu?: unknown };
    const sido = SIDO_LIST.find((s) => s === parsed.sido);
    if (!sido) return null;
    const sigungu = typeof parsed.sigungu === "string" ? parsed.sigungu : null;

    /*
     * 저장소는 사용자가 고칠 수 있다. 목록에 없는 구가 들어오면 그 값으로 글이
     * 저장되고 어느 필터에도 걸리지 않는다. 그래서 읽을 때 한 번 본다.
     */
    const region: MyRegion = { sido, sigungu };
    if (!isKnownRegion(region)) return null;

    /*
     * 덜 고른 값은 **안 고른 것으로 읽는다.** 전에는 시/도만 고른 상태가 그대로
     * 저장돼서 홈에 "내 지역 서울"로 떴다 — 고른 것처럼 보이는데 "내 지역 보기"는
     * 서울 전체가 된다. 지금은 RegionPicker 가 끝난 값만 넘기지만, 그 전에 저장된
     * 값이 브라우저에 남아 있다. 여기서 걸러 다시 묻는다.
     */
    return isRegionComplete(region) ? region : null;
  } catch {
    return null;
  }
}

export function writeMyRegion(region: MyRegion): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(region));
  } catch {
    // 저장이 막혀도 이번 세션 동안은 화면 상태로 들고 간다. 다음에 다시 묻는다.
  }
}

export function clearMyRegion(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // 지울 수 없으면 그대로 둔다.
  }
}

/**
 * 내 지역 상태.
 *
 * 첫 렌더에서는 항상 null 이다 — 서버 렌더에 저장소가 없고, 여기서 값을 만들면
 * 서버와 브라우저가 달라진다(hydration). 마운트 뒤에 채운다.
 *
 * `asked` 는 "물어봤는지"다. 값이 null 이어도 마운트 전인지, 물어봤는데 안 고른
 * 것인지 구분해야 한다 — 구분하지 않으면 매번 깜빡이며 다시 묻는다.
 */
export function useMyRegion(): {
  region: MyRegion | null;
  loaded: boolean;
  save: (region: MyRegion) => void;
  clear: () => void;
} {
  const [region, setRegion] = useState<MyRegion | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setRegion(readMyRegion());
    setLoaded(true);
  }, []);

  const save = useCallback((next: MyRegion) => {
    writeMyRegion(next);
    setRegion(next);
  }, []);

  const clear = useCallback(() => {
    clearMyRegion();
    setRegion(null);
  }, []);

  return { region, loaded, save, clear };
}
