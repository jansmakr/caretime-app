import { addDays, kstDateTime, kstServiceDate } from "@/lib/kst";
import type {
  ContactStatusCode,
  HospitalCapability,
  HospitalServiceStatus,
  HospitalContactStatus,
  HospitalHours,
  HospitalLiveStatus,
  HospitalView,
  HospitalWaitingStatus,
  InfoSource,
  LimitReasonCode,
  LiveStatusCode,
} from "./types";
import { DEMO_ORIGIN, distanceKm, estimateTravelMinutes } from "./location";
import { mergeConservative, representativeLiveStatus } from "./serviceStatus";

/**
 * DB 행 ↔ 도메인 타입 변환.
 * 테이블 모양은 supabase/migrations 가 원본이다. 컬럼을 바꾸면 여기와 같이 바꾼다.
 * 화면 코드는 행 타입을 직접 쓰지 않고 항상 types.ts 의 도메인 타입만 받는다.
 */

export interface HospitalRow {
  id: string;
  hpid: string;
  name: string;
  address: string;
  tel: string;
  lat: number;
  lng: number;
  synced_at: string;
  is_participating: boolean;
  regular_open: string | null; // "09:00:00" (KST)
  regular_close: string | null;
  regular_hours_source: InfoSource;
  regular_hours_verified_at: string | null;
}

export interface HospitalCapabilityRow {
  capability_id: string | null;
  custom_label: string | null;
  mapping_status: HospitalCapability["mappingStatus"];
  age_min: number | null;
  age_max: number | null;
  age_note: string | null;
  sort_order: number;
}

export interface LiveStatusRow {
  hospital_id: string;
  capability_id: string | null;
  status: LiveStatusCode;
  reason_code: LimitReasonCode | null;
  custom_reason: string | null;
  detail_text: string | null;
  starts_at: string | null;
  expected_resume_at: string | null;
  recheck_at: string | null;
  verified_by: InfoSource;
  verified_at: string;
  expires_at: string;
}

export interface DailyHoursRow {
  hospital_id: string;
  service_date: string; // YYYY-MM-DD
  today_close_at: string | null;
  last_admission_at: string | null;
  admission_confirmed: boolean;
  today_note: string | null;
  verified_by: InfoSource;
  verified_at: string;
}

export interface ContactStatusRow {
  hospital_id: string;
  status: ContactStatusCode;
  custom_note: string | null;
  verified_at: string;
}

export interface WaitingStatusRow {
  hospital_id: string;
  level: HospitalWaitingStatus["level"];
  headcount: number | null;
  verified_at: string;
}

/**
 * 항목별 공식 상태 행. (migration 20260926120000)
 *
 * 보호자 경로는 원본 테이블이 아니라 service_statuses_public 뷰를 읽는다.
 * 뷰는 만료되지 않은 행만, 참여 병원만, 그리고 updated_by·version 을 뺀 컬럼만 준다.
 * 그래서 version 이 optional 이다 — 공개 경로에서는 오지 않는다.
 */
export interface ServiceStatusRow {
  hospital_id: string;
  service_id: string;
  status: "AVAILABLE" | "LIMITED" | "CLOSED" | "PAUSED";
  wait_bucket: "UNKNOWN" | "LE30" | "FROM30TO60" | "GE60";
  reason_code: string | null;
  reopen_at: string | null;
  valid_until: string;
  updated_at: string;
  /** 동시수정 CAS 용. 공개 뷰에는 없다. 쓰려면 병원 계정으로 원본을 읽어야 한다. */
  version?: number;
}

/**
 * 항목 카탈로그 행. 상태가 아니라 "이 병원에 이 항목이 있다"는 사실이다.
 * 원본 hospital_services 와 공개 뷰 hospital_services_public 의 컬럼 이름이 같아
 * 두 경로가 같은 타입을 쓴다.
 */
export interface HospitalServiceRow {
  id: string;
  hospital_id: string;
  category: "laceration" | "burn" | "other";
  service_code: string;
  reported_age_min: number | null;
  reported_age_max: number | null;
  capability_note: string | null;
  profile_verified_at: string | null;
}

/** 공개 뷰가 내보내는 컬럼. version·updated_by 는 없다. */
export const SERVICE_STATUS_PUBLIC_COLUMNS =
  "hospital_id,service_id,status,wait_bucket,reason_code,reopen_at,valid_until,updated_at";
export const HOSPITAL_SERVICE_PUBLIC_COLUMNS =
  "id,hospital_id,category,service_code,reported_age_min,reported_age_max,capability_note,profile_verified_at";

export const LIVE_STATUS_COLUMNS =
  "hospital_id,capability_id,status,reason_code,custom_reason,detail_text,starts_at,expected_resume_at,recheck_at,verified_by,verified_at,expires_at";
export const DAILY_HOURS_COLUMNS =
  "hospital_id,service_date,today_close_at,last_admission_at,admission_confirmed,today_note,verified_by,verified_at";
export const CONTACT_COLUMNS = "hospital_id,status,custom_note,verified_at";
export const WAITING_COLUMNS = "hospital_id,level,headcount,verified_at";

// ─── 행 → 도메인 ─────────────────────────────────────────────

export function toCapability(row: HospitalCapabilityRow): HospitalCapability {
  return {
    capabilityId: row.capability_id,
    customLabel: row.custom_label,
    mappingStatus: row.mapping_status,
    ageMin: row.age_min,
    ageMax: row.age_max,
    ageNote: row.age_note,
  };
}

export function toLiveStatus(row: LiveStatusRow): HospitalLiveStatus {
  return {
    hospitalId: row.hospital_id,
    capabilityId: row.capability_id,
    status: row.status,
    reasonCode: row.reason_code,
    customReason: row.custom_reason,
    detailText: row.detail_text,
    startsAt: row.starts_at,
    expectedResumeAt: row.expected_resume_at,
    recheckAt: row.recheck_at,
    verifiedBy: row.verified_by,
    verifiedAt: row.verified_at,
    expiresAt: row.expires_at,
  };
}

export function toContact(row: ContactStatusRow): HospitalContactStatus {
  return {
    hospitalId: row.hospital_id,
    status: row.status,
    customNote: row.custom_note,
    verifiedAt: row.verified_at,
  };
}

export function toWaiting(row: WaitingStatusRow): HospitalWaitingStatus {
  return {
    hospitalId: row.hospital_id,
    level: row.level,
    headcount: row.headcount,
    verifiedAt: row.verified_at,
  };
}

/**
 * 항목 행 → 도메인. 상태가 게시되지 않은 항목도 **목록에서 빼지 않는다.**
 * 빼면 "항목이 없는 병원"과 "항목은 있는데 아직 안 누른 병원"을 구분할 수 없다.
 * 전자는 접수 개념이 없고, 후자는 눌러 주기를 기다리는 상태다.
 */
export function toServiceStatuses(
  catalog: HospitalServiceRow[],
  statuses: ServiceStatusRow[],
): HospitalServiceStatus[] {
  const byService = new Map(statuses.map((s) => [s.service_id, s]));
  return catalog.map((row) => {
    const status = byService.get(row.id) ?? null;
    return {
      serviceId: row.id,
      category: row.category,
      serviceCode: row.service_code,
      status: status?.status ?? null,
      waitBucket: status?.wait_bucket ?? "UNKNOWN",
      validUntil: status?.valid_until ?? null,
      updatedAt: status?.updated_at ?? null,
      reopenAt: status?.reopen_at ?? null,
      // 공개 뷰에는 version 이 없다. 0 같은 거짓 값을 넣지 않고 모른다고 둔다.
      version: status?.version ?? null,
    };
  });
}

/** 병원 전체 상태를 우선하고, 없으면 진료기능별 상태 중 하나를 쓴다. */
export function pickLiveStatus(rows: LiveStatusRow[]): HospitalLiveStatus | null {
  const row = rows.find((r) => r.capability_id === null) ?? rows[0];
  return row ? toLiveStatus(row) : null;
}

/**
 * 오늘 진료시간 = 평소 진료시간(병원 테이블) + 오늘 진료일 행(있으면).
 * 진료일이 다른 행은 무시한다. 어제의 "오늘만" 값이 오늘로 새지 않게 하려는 것.
 */
export function toTodayHours(
  hospital: HospitalRow,
  daily: DailyHoursRow | null,
  now: Date,
): HospitalHours | null {
  if (!hospital.regular_open || !hospital.regular_close) return null;

  const serviceDate = kstServiceDate(now);
  const openAt = kstDateTime(serviceDate, hospital.regular_open);
  let closeAt = kstDateTime(serviceDate, hospital.regular_close);
  if (closeAt.getTime() <= openAt.getTime()) {
    closeAt = kstDateTime(addDays(serviceDate, 1), hospital.regular_close);
  }

  const today = daily && daily.service_date === serviceDate ? daily : null;
  return {
    hospitalId: hospital.id,
    regularOpenAt: openAt.toISOString(),
    regularCloseAt: closeAt.toISOString(),
    todayCloseAt: today?.today_close_at ?? null,
    lastAdmissionAt: today?.last_admission_at ?? null,
    admissionConfirmed: today?.admission_confirmed ?? false,
    todayNote: today?.today_note ?? null,
    verifiedBy: today?.verified_by ?? hospital.regular_hours_source,
    verifiedAt: today?.verified_at ?? hospital.regular_hours_verified_at ?? hospital.synced_at,
  };
}

// ─── 실시간 변경 적용 (보호자 화면·파트너 화면 공용) ───────────

export function withLiveStatusRow(
  view: HospitalView,
  row: LiveStatusRow,
  now: Date = new Date(),
): HospitalView {
  // 병원 전체 상태가 이미 있으면 진료기능별 변경으로 덮어쓰지 않는다.
  if (row.capability_id !== null && view.liveStatus && view.liveStatus.capabilityId === null) {
    return view;
  }
  /*
   * 옛 출처의 이벤트도 항목별 접기 결과와 병합한다.
   * 이벤트 하나가 보수적 판정을 뒤집지 않게 하려는 것 — 화상=마감인 병원에
   * "전체 정상" 이벤트가 오면 그것만 보고 '진료 가능'으로 바꾸면 안 된다.
   */
  return {
    ...view,
    liveStatus: mergeConservative(
      representativeLiveStatus(view.id, view.services, now),
      toLiveStatus(row),
    ),
  };
}

export function withDailyHoursRow(view: HospitalView, row: DailyHoursRow, now: Date): HospitalView {
  if (!view.hours || row.service_date !== kstServiceDate(now)) return view;
  return {
    ...view,
    hours: {
      ...view.hours,
      todayCloseAt: row.today_close_at,
      lastAdmissionAt: row.last_admission_at,
      admissionConfirmed: row.admission_confirmed,
      todayNote: row.today_note,
      verifiedBy: row.verified_by,
      verifiedAt: row.verified_at,
    },
  };
}

export function withContactRow(view: HospitalView, row: ContactStatusRow): HospitalView {
  return { ...view, contactStatus: toContact(row) };
}

export function withWaitingRow(view: HospitalView, row: WaitingStatusRow): HospitalView {
  return { ...view, waiting: toWaiting(row) };
}

/**
 * 전체 재조회 결과를 현재 화면 값에 합칠 때, 조각별로 확인시각이 더 최신인 쪽을 남긴다.
 * 재조회 요청이 변경 전에 읽고 이벤트 뒤에 도착하면, 방금 받은 새 값을 옛 값으로 되돌리기 때문이다.
 */
export function mergeFresher(current: HospitalView, fresh: HospitalView): HospitalView {
  const newer = <T extends { verifiedAt: string }>(a: T | null, b: T | null): T | null => {
    if (!a || !b) return b ?? a;
    return Date.parse(a.verifiedAt) > Date.parse(b.verifiedAt) ? a : b;
  };
  return {
    ...fresh,
    liveStatus: newer(current.liveStatus, fresh.liveStatus),
    hours: newer(current.hours, fresh.hours),
    contactStatus: newer(current.contactStatus, fresh.contactStatus),
    waiting: newer(current.waiting, fresh.waiting),
  };
}

// ─── 조립 ───────────────────────────────────────────────────

export interface HospitalJoinedRow extends HospitalRow {
  hospital_capabilities: HospitalCapabilityRow[] | null;
  hospital_live_status: LiveStatusRow[] | null;
  /** 항목 카탈로그(공개 뷰). 상태가 없는 항목도 여기 들어 있다 — 접기의 분모다. */
  hospital_services_public: HospitalServiceRow[] | null;
  /** 만료되지 않은 항목별 상태(공개 뷰). 카탈로그보다 적을 수 있다. */
  service_statuses_public: ServiceStatusRow[] | null;
  hospital_daily_hours: DailyHoursRow[] | DailyHoursRow | null;
  hospital_contact_status: ContactStatusRow[] | ContactStatusRow | null;
  hospital_waiting_status: WaitingStatusRow[] | WaitingStatusRow | null;
}

/** PostgREST 는 1:1 관계를 객체로, 1:N 을 배열로 준다. 어느 쪽이 와도 받는다. */
function one<T>(v: T[] | T | null): T | null {
  if (v === null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export function toHospitalView(row: HospitalJoinedRow, now: Date): HospitalView {
  const km = distanceKm(DEMO_ORIGIN, { lat: row.lat, lng: row.lng });
  const capabilities = [...(row.hospital_capabilities ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const contact = one(row.hospital_contact_status);
  const waiting = one(row.hospital_waiting_status);
  const daily = Array.isArray(row.hospital_daily_hours)
    ? (row.hospital_daily_hours.find((d) => d.service_date === kstServiceDate(now)) ?? null)
    : row.hospital_daily_hours;

  // 항목별 상태. 카탈로그(항목의 존재)와 상태를 따로 읽어 합친다.
  // 상태 뷰는 만료된 행을 빼고 주므로, 여기서 status=null 이 된 항목은
  // "아직 안 누름"과 "눌렀지만 만료됨"을 합친 것이다. 둘 다 결론은 모름이라 같게 다룬다.
  const services = toServiceStatuses(
    row.hospital_services_public ?? [],
    row.service_statuses_public ?? [],
  );

  return {
    id: row.id,
    publicData: {
      hpid: row.hpid,
      name: row.name,
      address: row.address,
      tel: row.tel,
      lat: row.lat,
      lng: row.lng,
      syncedAt: row.synced_at,
    },
    distanceKm: Math.round(km * 10) / 10,
    travelMinutes: estimateTravelMinutes(km),
    capabilities: capabilities.map(toCapability),
    hours: toTodayHours(row, daily, now),
    /*
     * 대표 상태 = 항목별 접기 결과와 옛 출처(hospital_live_status) 중 더 보수적인 쪽.
     * 이행 기간 동안 두 출처가 함께 있으므로 병합한다. 어느 한쪽보다 낙관적인 답은 나오지 않는다.
     * (병합 규칙과 그 예외: features/hospitals/serviceStatus.mergeConservative)
     */
    liveStatus: mergeConservative(
      representativeLiveStatus(row.id, services, now),
      pickLiveStatus(row.hospital_live_status ?? []),
    ),
    contactStatus: contact ? toContact(contact) : null,
    waiting: waiting ? toWaiting(waiting) : null,
    // 내원예정은 5단계(Visit Intent)에서 테이블이 생긴다. 그 전까지 보호자 화면에 표시하지 않는다.
    incoming: null,
    services,
    isParticipating: row.is_participating,
  };
}
