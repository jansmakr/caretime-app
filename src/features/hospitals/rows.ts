import { addDays, kstDateTime, kstServiceDate } from "@/lib/kst";
import type {
  ContactStatusCode,
  HospitalCapability,
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

export function withLiveStatusRow(view: HospitalView, row: LiveStatusRow): HospitalView {
  // 병원 전체 상태가 이미 있으면 진료기능별 변경으로 덮어쓰지 않는다.
  if (row.capability_id !== null && view.liveStatus && view.liveStatus.capabilityId === null) {
    return view;
  }
  return { ...view, liveStatus: toLiveStatus(row) };
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

// ─── 조립 ───────────────────────────────────────────────────

export interface HospitalJoinedRow extends HospitalRow {
  hospital_capabilities: HospitalCapabilityRow[] | null;
  hospital_live_status: LiveStatusRow[] | null;
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
    liveStatus: pickLiveStatus(row.hospital_live_status ?? []),
    contactStatus: contact ? toContact(contact) : null,
    waiting: waiting ? toWaiting(waiting) : null,
    // 내원예정은 5단계(Visit Intent)에서 테이블이 생긴다. 그 전까지 보호자 화면에 표시하지 않는다.
    incoming: null,
    isParticipating: row.is_participating,
  };
}
