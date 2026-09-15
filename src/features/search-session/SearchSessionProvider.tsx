"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ExtractedFacts, SearchSession } from "./types";
import { applyAnswer, createSession, findMissing } from "./extract";

/**
 * 건강정보를 URL 에 싣지 않기 위한 저장소.
 *
 * /search?age=5&part=forehead 같은 경로를 만들면 Referer, 서버 액세스 로그,
 * Analytics 에 아동 건강정보가 그대로 남는다. (Release Blocker 5)
 * 그래서 세션은 sessionStorage 에만 두고, 페이지는 id 조차 URL 로 받지 않는다.
 *
 * sessionStorage 를 쓰는 이유는 탭을 닫으면 사라지기 때문이다.
 * 2단계에서 care_sessions 테이블로 옮길 때도 만료시각을 함께 저장한다.
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
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) setSession(JSON.parse(raw) as SearchSession);
    } catch {
      // 저장소를 못 읽어도 앱은 동작해야 한다. 새 세션으로 시작한다.
    }
    setReady(true);
  }, []);

  const persist = useCallback((next: SearchSession | null) => {
    setSession(next);
    try {
      if (next) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // 저장 실패는 조용히 넘어간다. 화면 상태는 메모리로 유지된다.
    }
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

  const answer = useCallback(
    (patch: Partial<ExtractedFacts>) => {
      setSession((prev) => {
        if (!prev) return prev;
        const next = applyAnswer(prev, patch);
        try {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          /* noop */
        }
        return next;
      });
    },
    [],
  );

  const clear = useCallback(() => persist(null), [persist]);

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
