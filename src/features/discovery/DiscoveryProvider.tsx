"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Sido } from "@/features/reports/regions";
import {
  EMPTY_CONDITIONS,
  NO_ORIGIN,
  type CareCategory,
  type DiscoveryConditions,
  type FollowupGoal,
  type Origin,
  type VisitPurpose,
} from "./types";

/**
 * 탐색 조건 보관소.
 *
 * 저장 정책 (요구사항 3):
 *  - 나이 · 진료 항목 · 방문 목적 · 후속 목적은 **메모리에만** 둔다. 새로고침하면 사라진다.
 *  - 지역만 sessionStorage 에 둔다. 일반 정보이고 URL 로도 나가는 값이다.
 *  - 좌표는 어디에도 저장하지 않는다. 이 Provider 의 state 에만 있고 초기화·수동 지역
 *    전환 때 버린다.
 *
 * 초기화(reset)는 이 Provider 의 값만 지우는 것이 아니라, 예전 구현이 sessionStorage 에
 * 남겨 둔 검색 세션 키(`caretime.search-session.v1`)까지 정리한다. 그 키에는 나이·부위·
 * 상황이 그대로 들어 있었다.
 */

const REGION_KEY = "caretime.discovery.region.v1";
/** 예전 구현이 건강정보를 담아 두던 키. 초기화 때 같이 지운다. */
const LEGACY_SESSION_KEY = "caretime.search-session.v1";

interface DiscoveryContextValue {
  conditions: DiscoveryConditions;
  origin: Origin;
  ready: boolean;
  setRegion: (sido: Sido | null, sigungu: string | null) => void;
  setCategory: (category: CareCategory | null) => void;
  setVisitPurpose: (purpose: VisitPurpose | null) => void;
  setFollowupGoal: (goal: FollowupGoal | null) => void;
  setChild: (isChild: boolean) => void;
  setChildAge: (age: number | null) => void;
  /** [내 주변] 허용 시 호출. 좌표는 메모리에만 남는다. */
  useDeviceOrigin: (coords: { lat: number; lng: number }) => void;
  reset: () => void;
}

const DiscoveryContext = createContext<DiscoveryContextValue | null>(null);

function readStoredRegion(): DiscoveryConditions["region"] {
  if (typeof window === "undefined") return EMPTY_CONDITIONS.region;
  try {
    const raw = window.sessionStorage.getItem(REGION_KEY);
    if (!raw) return EMPTY_CONDITIONS.region;
    const parsed = JSON.parse(raw) as { sido?: unknown; sigungu?: unknown };
    return {
      sido: typeof parsed.sido === "string" ? (parsed.sido as Sido) : null,
      sigungu: typeof parsed.sigungu === "string" ? parsed.sigungu : null,
    };
  } catch {
    return EMPTY_CONDITIONS.region;
  }
}

export function DiscoveryProvider({ children }: { children: React.ReactNode }) {
  const [conditions, setConditions] = useState<DiscoveryConditions>(EMPTY_CONDITIONS);
  const [origin, setOrigin] = useState<Origin>(NO_ORIGIN);
  const [ready, setReady] = useState(false);

  // 지역만 복원한다. 첫 렌더에서 읽지 않는 이유는 서버 렌더와 값이 달라지면 안 되기 때문이다.
  useEffect(() => {
    const region = readStoredRegion();
    if (region.sido !== null) {
      setConditions((c) => ({ ...c, region }));
      // 저장된 지역은 '수동 선택'이다. 현재 위치로 취급하지 않는다.
      setOrigin({ kind: "region", coords: null });
    }
    setReady(true);
  }, []);

  const persistRegion = useCallback((region: DiscoveryConditions["region"]) => {
    if (typeof window === "undefined") return;
    try {
      if (region.sido === null) window.sessionStorage.removeItem(REGION_KEY);
      else window.sessionStorage.setItem(REGION_KEY, JSON.stringify(region));
    } catch {
      // 저장소를 못 써도 이번 세션은 메모리로 동작한다.
    }
  }, []);

  const setRegion = useCallback(
    (sido: Sido | null, sigungu: string | null) => {
      const region = { sido, sigungu: sido === null ? null : sigungu };
      setConditions((c) => ({ ...c, region }));
      persistRegion(region);
      // 수동으로 지역을 바꾸면 기기 좌표를 버린다.
      // 지역 중심과의 거리를 '현재 위치에서의 거리'로 보여주는 일이 생기지 않게.
      setOrigin(sido === null ? NO_ORIGIN : { kind: "region", coords: null });
    },
    [persistRegion],
  );

  const useDeviceOrigin = useCallback((coords: { lat: number; lng: number }) => {
    setOrigin({ kind: "device", coords });
  }, []);

  const reset = useCallback(() => {
    setConditions(EMPTY_CONDITIONS);
    setOrigin(NO_ORIGIN);
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.removeItem(REGION_KEY);
      // 예전 구현이 남긴 건강정보 키까지 정리한다.
      window.sessionStorage.removeItem(LEGACY_SESSION_KEY);
    } catch {
      // 지우지 못해도 메모리 값은 비워졌다.
    }
  }, []);

  const value = useMemo<DiscoveryContextValue>(
    () => ({
      conditions,
      origin,
      ready,
      setRegion,
      setCategory: (category) => setConditions((c) => ({ ...c, category })),
      setVisitPurpose: (visitPurpose) =>
        setConditions((c) => ({
          ...c,
          visitPurpose,
          // '처음 진료'로 바꾸면 후속 목적은 의미가 없다. 남겨 두면 결과 문구가 어긋난다.
          followupGoal: visitPurpose === "followup" ? c.followupGoal : null,
        })),
      setFollowupGoal: (followupGoal) =>
        setConditions((c) => ({
          ...c,
          followupGoal,
          // 목적을 고르면 방문 목적도 '치료 후 방문'으로 맞춘다.
          visitPurpose: followupGoal === null ? c.visitPurpose : "followup",
        })),
      setChild: (isChild) =>
        setConditions((c) => ({ ...c, isChild, childAgeYears: isChild ? c.childAgeYears : null })),
      setChildAge: (childAgeYears) =>
        setConditions((c) => ({
          ...c,
          childAgeYears,
          isChild: childAgeYears === null ? c.isChild : true,
        })),
      useDeviceOrigin,
      reset,
    }),
    [conditions, origin, ready, setRegion, useDeviceOrigin, reset],
  );

  return <DiscoveryContext.Provider value={value}>{children}</DiscoveryContext.Provider>;
}

export function useDiscovery(): DiscoveryContextValue {
  const ctx = useContext(DiscoveryContext);
  if (!ctx) throw new Error("useDiscovery must be used inside DiscoveryProvider");
  return ctx;
}
