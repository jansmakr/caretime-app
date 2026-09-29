"use client";

import { useEffect, useState } from "react";
import { getPublicBrowserSupabase } from "@/lib/supabase/browser";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { MOCK_HOSPITALS } from "./mock";
import { fetchHospitalViews } from "./repository";
import type { HospitalView } from "./types";

/** 만료·"N분 전" 재판정 주기. 상세 화면(useHospitalLive)과 같은 값을 쓴다. */
const TICK_MS = 30_000;

type HospitalList =
  | { status: "loading"; hospitals: [] }
  | { status: "ready"; hospitals: HospitalView[] }
  | { status: "error"; hospitals: [] };

/**
 * 검색 결과용 병원 목록. 목록 카드와 상세 화면이 서로 다른 데이터를 보지 않도록
 * Supabase 연결 시에는 상세와 같은 repository 를 쓴다.
 * 목록은 구독하지 않는다. 카드에서 상세로 들어가면 그때부터 실시간이다.
 *
 * now 를 같이 돌려준다. 화면 하나가 시각 하나를 쓰게 하려는 것이다 —
 * 카드가 스스로 new Date() 를 만들면 카드마다, 심지어 한 카드 안에서도
 * 판정 기준 시각이 갈린다(features/hospitals/statusView 주석 참고).
 *
 * 첫 렌더의 now 는 null 이다. 이 화면은 서버에서 미리 렌더되므로(정적 라우트)
 * 그 시점에 new Date() 를 부르면 빌드 시각이 굳어 하이드레이션 때 문구가 어긋난다.
 * 사용자의 시계는 마운트된 뒤에만 알 수 있다. 그래서 모르는 동안은 모른다고 둔다.
 */
export function useHospitalList(): HospitalList & { now: Date | null } {
  const [list, setList] = useState<HospitalList>(
    isSupabaseConfigured ? { status: "loading", hospitals: [] } : { status: "ready", hospitals: MOCK_HOSPITALS },
  );
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    fetchHospitalViews(getPublicBrowserSupabase())
      .then((hospitals) => !cancelled && setList({ status: "ready", hospitals }))
      .catch(() => !cancelled && setList({ status: "error", hospitals: [] }));
    return () => {
      cancelled = true;
    };
  }, []);

  return { ...list, now };
}
