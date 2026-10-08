"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ExtractedFacts, SearchSession } from "./types";
import { applyAnswer, createSession, findMissing } from "./extract";

/**
 * 건강정보를 URL 에 싣지 않기 위한 저장소.
 *
 * /search?age=5&part=forehead 같은 경로를 만들면 Referer, 서버 액세스 로그,
 * Analytics 에 아동 건강정보가 그대로 남는다. (Release Blocker 5)
 * 그래서 페이지는 id 조차 URL 로 받지 않는다.
 *
 * 저장 정책이 바뀌었다 — 이제 **메모리에만** 둔다.
 *   나이·부위·상황·자유입력은 이번 검색의 조건이지 계정의 정보가 아니다.
 *   sessionStorage 에 자동 저장하면 탭을 닫기 전까지 남고, 다른 화면·다른 사람이
 *   같은 기기에서 열었을 때도 남아 있다. 그래서 쓰지 않는다.
 *   Provider 는 (consumer) 레이아웃에 있으므로 화면 이동에는 값이 유지되고,
 *   새로고침하면 사라진다.
 *
 * 예전 구현이 남긴 키는 마운트 때 정리한다. 지역은 DiscoveryProvider 가 따로 맡는다.
 */

const STORAGE_KEY = "caretime.search-session.v1";

interface SearchSessionContextValue {
  session: SearchSession | null;
  start: (rawInput: string) => SearchSession;
  startFromPick: (patch: Partial<ExtractedFacts>) => SearchSession;
  answer: (patch: Partial<ExtractedFacts>) => void;
  clear: () => void;
  ready: boolean;
}

const SearchSessionContext = createContext<SearchSessionContextValue | null>(null);

export function SearchSessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SearchSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // 예전 구현이 남긴 건강정보를 정리한다. 읽어서 복원하지 않는다.
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // 지우지 못해도 이 Provider 는 저장된 값을 쓰지 않는다.
    }
    setReady(true);
  }, []);

  /**
   * 메모리에만 둔다. sessionStorage 에 쓰지 않는다.
   * 나이·부위·상황·자유입력은 이번 검색의 조건이지 보관할 정보가 아니다.
   * 화면 이동에는 Provider 가 (consumer) 레이아웃에 있어 값이 유지된다.
   */
  const persist = useCallback((next: SearchSession | null) => {
    setSession(next);
  }, []);

  const start = useCallback(
    (rawInput: string) => {
      const next = createSession(rawInput);
      persist(next);
      return next;
    },
    [persist],
  );

  const startFromPick = useCallback(
    (patch: Partial<ExtractedFacts>) => {
      const facts: ExtractedFacts = {
        ageYears: null,
        sex: null,
        bodyPartId: null,
        situationId: null,
        hemostasis: null,
        basicTreatment: null,
        priorGuidance: null,
        ...patch,
      };
      const next: SearchSession = {
        id: crypto.randomUUID(),
        facts,
        rawInput: null,
        createdAt: new Date().toISOString(),
        missing: findMissing(facts),
      };
      persist(next);
      return next;
    },
    [persist],
  );

  // 되묻기 답도 메모리에만 반영한다.
  const answer = useCallback((patch: Partial<ExtractedFacts>) => {
    setSession((prev) => (prev ? applyAnswer(prev, patch) : prev));
  }, []);

  /** 초기화. 메모리를 비우고, 예전 키가 남아 있으면 같이 지운다. */
  const clear = useCallback(() => {
    persist(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* noop */
    }
  }, [persist]);

  const value = useMemo(
    () => ({ session, start, startFromPick, answer, clear, ready }),
    [session, start, startFromPick, answer, clear, ready],
  );

  return (
    <SearchSessionContext.Provider value={value}>{children}</SearchSessionContext.Provider>
  );
}

export function useSearchSession(): SearchSessionContextValue {
  const ctx = useContext(SearchSessionContext);
  if (!ctx) throw new Error("useSearchSession must be used inside SearchSessionProvider");
  return ctx;
}
