import { getHospital } from "@/features/hospitals/service";
import type { HospitalView } from "@/features/hospitals/types";
import { formatClock } from "@/lib/freshness";
import type { IncomingVisit, PartnerState } from "./types";

/**
 * ⚠️ MOCK DATA — 파트너 화면 데모용.
 *
 * 병원 기본정보·진료기능은 보호자 화면과 같은 MOCK_HOSPITALS 의 h_001 을 쓴다.
 * 오늘 상태는 "아침에 파트너 화면을 처음 연 순간"을 재현한다 —
 * 어제 확인한 상태가 만료되어 보호자 화면에는 "현재 상태 확인 필요"로 나가는 중이다.
 *
 * 입력값은 브라우저 메모리에만 있다. 새로고침하면 초기화되고 보호자 화면에 반영되지 않는다.
 * 저장소 연동은 2단계(Supabase)에서 붙는다.
 */

export const PARTNER_DEMO_HOSPITAL_ID = "h_001";

export function getPartnerHospital(): HospitalView {
  const hospital = getHospital(PARTNER_DEMO_HOSPITAL_ID);
  if (!hospital) throw new Error(`partner demo hospital ${PARTNER_DEMO_HOSPITAL_ID} missing`);
  return hospital;
}

const MINUTE = 60_000;

/** 데모 시각을 10분 단위로 맞춘다. 진료시간이 21:37 처럼 보이지 않게. */
function at(now: Date, offsetMinutes: number): string {
  const t = now.getTime() + offsetMinutes * MINUTE;
  return new Date(Math.round(t / (10 * MINUTE)) * 10 * MINUTE).toISOString();
}

function ago(now: Date, minutes: number): string {
  return new Date(now.getTime() - minutes * MINUTE).toISOString();
}

function later(now: Date, minutes: number): string {
  return new Date(now.getTime() + minutes * MINUTE).toISOString();
}

export function createPartnerDemoState(now: Date): PartnerState {
  const hospital = getPartnerHospital();
  const id = hospital.id;
  const regularOpenAt = at(now, -600);
  const regularCloseAt = at(now, 162);
  const yesterdayVerifiedAt = ago(now, 14 * 60);

  return {
    hospitalId: id,
    mode: null,
    yesterday: {
      status: "normal",
      reasonCode: null,
      customReason: null,
      detailText: null,
      lastAdmissionClock: formatClock(new Date(new Date(regularCloseAt).getTime() - 60 * MINUTE).toISOString()),
    },
    liveStatus: {
      hospitalId: id,
      capabilityId: null,
      status: "normal",
      reasonCode: null,
      customReason: null,
      detailText: null,
      startsAt: null,
      expectedResumeAt: null,
      recheckAt: null,
      verifiedBy: "hospital",
      verifiedAt: yesterdayVerifiedAt,
      expiresAt: ago(now, 10 * 60),
    },
    hours: {
      hospitalId: id,
      regularOpenAt,
      regularCloseAt,
      todayCloseAt: null,
      lastAdmissionAt: null,
      admissionConfirmed: false,
      todayNote: null,
      verifiedBy: "hospital",
      verifiedAt: yesterdayVerifiedAt,
    },
    contact: {
      hospitalId: id,
      status: hospital.contactStatus?.status ?? "available",
      customNote: null,
      verifiedAt: ago(now, 14),
    },
    waiting: {
      hospitalId: id,
      level: hospital.waiting?.level ?? "normal",
      headcount: hospital.waiting?.headcount ?? 0,
      verifiedAt: ago(now, 14),
    },
  };
}

/**
 * 집계가 보호자 화면 mock(h_001: 10분 2 · 30분 8 · 1시간 11)과 맞도록 구성했다.
 * 끝의 세 건은 집계 제외 케이스(도착 확인 · 공유 취소 · 예정시각 초과)다.
 */
export function createIncomingDemoVisits(now: Date): IncomingVisit[] {
  const v = (
    code: string,
    etaMinutes: number,
    facts: IncomingVisit["facts"],
    state: IncomingVisit["state"] = "on_the_way",
  ): IncomingVisit => ({
    code,
    facts,
    etaAt: later(now, etaMinutes),
    sharedAt: ago(now, Math.max(5, 25 - etaMinutes)),
    state,
  });

  return [
    v("CT-4821", -4, { ageYears: 5, bodyPartId: "forehead", situationId: "laceration", hemostasis: "stopped" }),
    v("CT-7305", 7, { ageYears: 3, bodyPartId: "chin", situationId: "laceration", hemostasis: "bleeding" }),
    v("CT-1946", 12, { ageYears: 7, bodyPartId: "eyebrow", situationId: "laceration", hemostasis: "stopped" }),
    v("CT-5570", 16, { ageYears: 4, bodyPartId: "scalp", situationId: "laceration", hemostasis: null }),
    v("CT-2238", 19, { ageYears: 9, bodyPartId: "lip", situationId: "laceration", hemostasis: "stopped" }),
    v("CT-8612", 23, { ageYears: null, bodyPartId: "forehead", situationId: null, hemostasis: "stopped" }),
    v("CT-3094", 26, { ageYears: 6, bodyPartId: "nose", situationId: "abrasion", hemostasis: "stopped" }),
    v("CT-6457", 29, { ageYears: 11, bodyPartId: "ear", situationId: "laceration", hemostasis: "bleeding" }),
    v("CT-9183", 38, { ageYears: 4, bodyPartId: "forehead", situationId: "deep_laceration", hemostasis: "stopped" }),
    v("CT-4709", 47, { ageYears: 8, bodyPartId: "chin", situationId: "laceration", hemostasis: null }),
    v("CT-1352", 55, { ageYears: 5, bodyPartId: "scalp", situationId: "laceration", hemostasis: "stopped" }),
    v("CT-7021", -15, { ageYears: 6, bodyPartId: "eyebrow", situationId: "laceration", hemostasis: "stopped" }, "arrived"),
    v("CT-2866", 20, { ageYears: 3, bodyPartId: "lip", situationId: "laceration", hemostasis: "stopped" }, "cancelled"),
    v("CT-5148", -45, { ageYears: 10, bodyPartId: "forehead", situationId: "laceration", hemostasis: "stopped" }),
  ];
}
