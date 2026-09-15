import type { Capability, HospitalView } from "./types";

/**
 * ⚠️ MOCK DATA — 실제 의료기관 정보가 아닙니다.
 *
 * 병원명·전화번호·좌표는 전부 가상입니다. 실제 의료기관을 식별할 수 없도록
 * "가상○○의원" 형태로만 두었습니다. 실제 공공데이터 연동은 8단계입니다.
 * UI 가 실제 연동인 것처럼 보이지 않도록 화면 상단에 Demo 배지를 항상 띄웁니다.
 */

export const CAPABILITIES: Capability[] = [
  { id: "cap_facial_laceration", label: "소아 안면열상", group: "facial" },
  { id: "cap_scalp_laceration", label: "두피 열상", group: "facial" },
  { id: "cap_hand_trauma", label: "손가락 외상", group: "hand" },
  { id: "cap_nail_injury", label: "손톱 손상", group: "hand" },
  { id: "cap_burn", label: "소아 화상", group: "burn" },
  { id: "cap_bite", label: "교상", group: "other" },
  { id: "cap_foreign_body", label: "이물 제거", group: "other" },
];

/** 지금 시각 기준으로 상대 시각을 만든다. 데모에서 항상 "몇 분 전"이 살아있게 하려는 것. */
function minutesAgo(n: number): string {
  return new Date(Date.now() - n * 60_000).toISOString();
}
function minutesLater(n: number): string {
  return new Date(Date.now() + n * 60_000).toISOString();
}

function hours(
  hospitalId: string,
  o: Partial<HospitalView["hours"] & object> & {
    regularCloseAt: string;
    verifiedBy: "hospital" | "operator";
    verifiedAt: string;
  },
): NonNullable<HospitalView["hours"]> {
  return {
    hospitalId,
    regularOpenAt: minutesAgo(600),
    todayCloseAt: null,
    lastAdmissionAt: null,
    admissionConfirmed: false,
    todayNote: null,
    ...o,
  } as NonNullable<HospitalView["hours"]>;
}

export const MOCK_HOSPITALS: HospitalView[] = [
  {
    id: "h_001",
    publicData: {
      hpid: "MOCK0001",
      name: "가상아이봄의원",
      address: "서울 강서구 (데모 주소)",
      tel: "02-000-0001",
      lat: 37.5509,
      lng: 126.8495,
      syncedAt: minutesAgo(600),
    },
    distanceKm: 1.2,
    travelMinutes: 12,
    capabilities: [
      {
        capabilityId: "cap_facial_laceration",
        customLabel: null,
        mappingStatus: "standard",
        ageMin: 3,
        ageMax: null,
        ageNote: null,
      },
      {
        capabilityId: "cap_scalp_laceration",
        customLabel: null,
        mappingStatus: "standard",
        ageMin: 3,
        ageMax: null,
        ageNote: null,
      },
    ],
    hours: hours("h_001", { regularCloseAt: minutesLater(162), todayCloseAt: minutesLater(102), lastAdmissionAt: minutesLater(42), admissionConfirmed: true, todayNote: "오늘은 평소보다 1시간 일찍 종료합니다", verifiedBy: "hospital", verifiedAt: minutesAgo(14) }),
    liveStatus: {
      hospitalId: "h_001",
      capabilityId: null,
      status: "normal",
      reasonCode: null,
      customReason: null,
      detailText: null,
      startsAt: null,
      expectedResumeAt: null,
      recheckAt: null,
      verifiedBy: "hospital",
      verifiedAt: minutesAgo(14),
      expiresAt: minutesLater(180),
    },
    contactStatus: {
      hospitalId: "h_001",
      status: "busy",
      customNote: null,
      verifiedAt: minutesAgo(14),
    },
    waiting: {
      hospitalId: "h_001",
      level: "normal",
      headcount: 6,
      verifiedAt: minutesAgo(14),
    },
    incoming: { hospitalId: "h_001", within10: 2, within30: 8, within60: 11 },
    isParticipating: true,
  },
  {
    id: "h_002",
    publicData: {
      hpid: "MOCK0002",
      name: "가상한빛외과의원",
      address: "서울 양천구 (데모 주소)",
      tel: "02-000-0002",
      lat: 37.5169,
      lng: 126.8664,
      syncedAt: minutesAgo(600),
    },
    distanceKm: 2.8,
    travelMinutes: 17,
    capabilities: [
      {
        capabilityId: "cap_facial_laceration",
        customLabel: null,
        mappingStatus: "standard",
        ageMin: 6,
        ageMax: null,
        ageNote: null,
      },
      {
        capabilityId: null,
        customLabel: "소아 손끝 찢어짐",
        mappingStatus: "pending",
        ageMin: null,
        ageMax: null,
        ageNote: "보호자 동반 시",
      },
    ],
    hours: hours("h_002", { regularCloseAt: minutesLater(78), lastAdmissionAt: minutesLater(18), admissionConfirmed: true, verifiedBy: "hospital", verifiedAt: minutesAgo(22) }),
    liveStatus: {
      hospitalId: "h_002",
      capabilityId: "cap_facial_laceration",
      status: "partial",
      reasonCode: "specialist_absent",
      customReason: null,
      detailText: "담당 전문의 복귀 후 재개 예정",
      startsAt: minutesAgo(50),
      expectedResumeAt: minutesLater(35),
      recheckAt: null,
      verifiedBy: "hospital",
      verifiedAt: minutesAgo(22),
      expiresAt: minutesLater(120),
    },
    contactStatus: {
      hospitalId: "h_002",
      status: "difficult",
      customNote: null,
      verifiedAt: minutesAgo(22),
    },
    waiting: { hospitalId: "h_002", level: "crowded", headcount: 11, verifiedAt: minutesAgo(22) },
    incoming: { hospitalId: "h_002", within10: 1, within30: 3, within60: 6 },
    isParticipating: true,
  },
  {
    id: "h_003",
    publicData: {
      hpid: "MOCK0003",
      name: "가상연세365의원",
      address: "서울 영등포구 (데모 주소)",
      tel: "02-000-0003",
      lat: 37.5264,
      lng: 126.896,
      syncedAt: minutesAgo(600),
    },
    distanceKm: 3.4,
    travelMinutes: 21,
    capabilities: [
      {
        capabilityId: "cap_burn",
        customLabel: null,
        mappingStatus: "standard",
        ageMin: null,
        ageMax: 15,
        ageNote: null,
      },
      {
        capabilityId: "cap_hand_trauma",
        customLabel: null,
        mappingStatus: "standard",
        ageMin: null,
        ageMax: null,
        ageNote: null,
      },
    ],
    // 운영자가 전화로 확인한 정보. 병원 직접확인과 다른 출처로 표시된다.
    hours: hours("h_003", { regularCloseAt: minutesLater(150), verifiedBy: "operator", verifiedAt: minutesAgo(95) }),
    liveStatus: {
      hospitalId: "h_003",
      capabilityId: null,
      status: "normal",
      reasonCode: null,
      customReason: null,
      detailText: null,
      startsAt: null,
      expectedResumeAt: null,
      recheckAt: minutesLater(60),
      verifiedBy: "operator",
      verifiedAt: minutesAgo(95),
      expiresAt: minutesLater(85),
    },
    contactStatus: {
      hospitalId: "h_003",
      status: "available",
      customNote: null,
      verifiedAt: minutesAgo(95),
    },
    waiting: null,
    incoming: { hospitalId: "h_003", within10: 0, within30: 2, within60: 4 },
    isParticipating: true,
  },
  {
    id: "h_004",
    publicData: {
      hpid: "MOCK0004",
      name: "가상새봄정형외과의원",
      address: "서울 구로구 (데모 주소)",
      tel: "02-000-0004",
      lat: 37.4954,
      lng: 126.8874,
      syncedAt: minutesAgo(600),
    },
    distanceKm: 4.9,
    travelMinutes: 26,
    capabilities: [
      {
        capabilityId: "cap_hand_trauma",
        customLabel: null,
        mappingStatus: "standard",
        ageMin: null,
        ageMax: null,
        ageNote: null,
      },
      {
        capabilityId: "cap_nail_injury",
        customLabel: null,
        mappingStatus: "standard",
        ageMin: null,
        ageMax: null,
        ageNote: null,
      },
    ],
    // 만료된 상태. 화면에서는 '현재 상태 확인 필요'로만 표시되어야 한다.
    hours: hours("h_004", { regularCloseAt: minutesLater(90), verifiedBy: "hospital", verifiedAt: minutesAgo(400) }),
    liveStatus: {
      hospitalId: "h_004",
      capabilityId: null,
      status: "normal",
      reasonCode: null,
      customReason: null,
      detailText: null,
      startsAt: null,
      expectedResumeAt: null,
      recheckAt: null,
      verifiedBy: "hospital",
      verifiedAt: minutesAgo(400),
      expiresAt: minutesAgo(40),
    },
    contactStatus: null,
    waiting: null,
    incoming: null,
    isParticipating: true,
  },
  {
    id: "h_005",
    publicData: {
      hpid: "MOCK0005",
      name: "가상미래의원",
      address: "서울 강서구 (데모 주소)",
      tel: "02-000-0005",
      lat: 37.5603,
      lng: 126.8352,
      syncedAt: minutesAgo(600),
    },
    distanceKm: 5.6,
    travelMinutes: 29,
    capabilities: [
      {
        capabilityId: "cap_foreign_body",
        customLabel: null,
        mappingStatus: "standard",
        ageMin: null,
        ageMax: null,
        ageNote: null,
      },
    ],
    // 참여 의료기관이 아니다. 공공정보만 있는 병원. 검색 결과에서 제외하지 않는다.
    hours: null,
    liveStatus: null,
    contactStatus: null,
    waiting: null,
    incoming: null,
    isParticipating: false,
  },
];
