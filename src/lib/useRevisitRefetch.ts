"use client";

import { useEffect, useRef } from "react";

/**
 * "화면으로 돌아왔을 때 다시 읽기".
 *
 * 왜 필요한가: 항목별 상태(service_statuses)는 anon 에게 Realtime 이벤트가 오지 않는다.
 * 원본 테이블을 열지 않기로 한 결정의 대가다(migration 20260926 주석). 그래서 열어 둔
 * 화면은 병원이 "마감"을 눌러도 그것을 모른다 — 남은 TTL(최대 60분)이 지나 만료로
 * 떨어질 때까지 "접수 가능"이 남는다. 밤에 한 번 헛걸음하기에 충분한 시간이다.
 *
 * 이 훅은 그 구간을 없애지는 못한다. 가장 흔한 패턴 하나를 덮는다 —
 * 휴대폰 화면을 껐다 다시 보거나, 다른 앱에 갔다 돌아오는 경우.
 * 지연 상한을 만들지 못하므로 이것만으로 끝내지 않는다(Realtime broadcast 검증이 남았다).
 *
 * 두 사건을 모두 본다.
 *   visibilitychange  탭 전환·화면 잠금 해제·앱 복귀
 *   focus             창 포커스 복귀 (visibilitychange 가 안 오는 데스크톱 경우가 있다)
 * 둘이 같이 오는 경우가 많아서 짧은 간격의 중복 호출을 막는다.
 */

/** 같은 복귀로 두 번 읽지 않기 위한 최소 간격. */
export const REVISIT_MIN_GAP_MS = 5_000;

/**
 * 다시 읽을지 판정한다. 훅에서 분리해 둔 이유는 이 판정만 테스트로 고정하려는 것이다.
 * hidden 일 때 읽지 않는 이유: 보이지 않는 화면을 갱신하는 것은 사용자에게 아무 값도
 * 주지 않으면서 요청만 쓴다.
 */
export function shouldRefetchOnRevisit(
  lastAtMs: number,
  nowMs: number,
  hidden: boolean,
): boolean {
  if (hidden) return false;
  return nowMs - lastAtMs >= REVISIT_MIN_GAP_MS;
}

export function useRevisitRefetch(onRevisit: () => void): void {
  const callback = useRef(onRevisit);
  const lastAt = useRef(0);

  useEffect(() => {
    callback.current = onRevisit;
  }, [onRevisit]);

  useEffect(() => {
    const run = () => {
      const t = Date.now();
      if (!shouldRefetchOnRevisit(lastAt.current, t, document.hidden)) return;
      lastAt.current = t;
      callback.current();
    };

    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", run);
    return () => {
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", run);
    };
  }, []);
}
