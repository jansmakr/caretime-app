"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { HospitalView } from "@/features/hospitals/types";
import { seedReports } from "./seed";
import type { HospitalRef } from "./directory";
import { byNewestFirst, reportsForHospital } from "./service";
import {
  getSubmittedReports,
  getSubmittedReportsOnServer,
  subscribeReports,
} from "./store";
import type { UserReport } from "./types";

/**
 * 병원 1곳의 제보 피드.
 *
 * 데모 제보(renderedAt 기준 고정 오프셋) + 이번 브라우저에서 등록한 제보를 합쳐
 * 최신순으로 돌려준다. 등록하면 store 가 알려 주므로 새로고침 없이 목록에 올라간다.
 * 상대시각("10분 전")은 화면이 들고 있는 now 로 계산한다 — HospitalDetail 의 now 와 같은 값이다.
 */
export function useReportFeed(hospital: HospitalView, renderedAt: string): UserReport[] {
  const id = hospital.id;
  const name = hospital.publicData.name;
  const address = hospital.publicData.address;
  // 실시간 갱신으로 hospital 객체가 새로 만들어져도 데모 제보는 다시 만들지 않는다.
  const ref: HospitalRef = useMemo(() => ({ id, name, address }), [id, name, address]);
  const seeded = useMemo(() => seedReports(ref, renderedAt), [ref, renderedAt]);
  const submitted = useSyncExternalStore(
    subscribeReports,
    getSubmittedReports,
    getSubmittedReportsOnServer,
  );

  return useMemo(
    () =>
      reportsForHospital([...submitted, ...seeded], { id, name }).sort(byNewestFirst),
    [submitted, seeded, id, name],
  );
}
