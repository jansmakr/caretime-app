"use client";

import { useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { MOCK_HOSPITALS } from "./mock";
import { fetchHospitalViews } from "./repository";
import type { HospitalView } from "./types";

type HospitalList =
  | { status: "loading"; hospitals: [] }
  | { status: "ready"; hospitals: HospitalView[] }
  | { status: "error"; hospitals: [] };

/**
 * 검색 결과용 병원 목록. 목록 카드와 상세 화면이 서로 다른 데이터를 보지 않도록
 * Supabase 연결 시에는 상세와 같은 repository 를 쓴다.
 * 목록은 구독하지 않는다. 카드에서 상세로 들어가면 그때부터 실시간이다.
 */
export function useHospitalList(): HospitalList {
  const [list, setList] = useState<HospitalList>(
    isSupabaseConfigured ? { status: "loading", hospitals: [] } : { status: "ready", hospitals: MOCK_HOSPITALS },
  );

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    fetchHospitalViews(getBrowserSupabase())
      .then((hospitals) => !cancelled && setList({ status: "ready", hospitals }))
      .catch(() => !cancelled && setList({ status: "error", hospitals: [] }));
    return () => {
      cancelled = true;
    };
  }, []);

  return list;
}
