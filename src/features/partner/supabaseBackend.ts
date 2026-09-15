import type { SupabaseClient } from "@supabase/supabase-js";
import type { HospitalChange } from "@/features/hospitals/realtime";
import { fetchHospitalView } from "@/features/hospitals/repository";
import {
  CONTACT_COLUMNS,
  DAILY_HOURS_COLUMNS,
  LIVE_STATUS_COLUMNS,
  WAITING_COLUMNS,
  toContact,
  toLiveStatus,
  toWaiting,
  type DailyHoursRow,
  type ContactStatusRow,
  type LiveStatusRow,
  type WaitingStatusRow,
} from "@/features/hospitals/rows";
import type { HospitalLiveStatus, HospitalView } from "@/features/hospitals/types";
import { formatClock } from "@/lib/freshness";
import { kstServiceDate } from "@/lib/kst";
import { deriveTodayMode } from "./service";
import type { PartnerState, YesterdaySnapshot } from "./types";

/**
 * 파트너 화면 ↔ Supabase.
 * 쓰기 권한은 RLS(hospital_members)가 판정한다. 여기서 권한을 흉내 내지 않는다.
 * 확인시각(verified_at)은 DB 트리거가 찍으므로 보내지 않고, 응답 행의 값을 화면에 다시 반영한다.
 */

export type PartnerSlice = "live" | "hours" | "contact" | "waiting";

export const SLICE_OF_TABLE: Record<HospitalChange["table"], PartnerSlice> = {
  hospital_live_status: "live",
  hospital_daily_hours: "hours",
  hospital_contact_status: "contact",
  hospital_waiting_status: "waiting",
};

/** 운영자가 계정을 병원에 연결하지 않았거나, 병원 기본정보가 부족해 입력을 받을 수 없는 경우. */
export class PartnerSetupError extends Error {}

export async function fetchMembership(client: SupabaseClient): Promise<{ hospitalId: string } | null> {
  const { data, error } = await client
    .from("hospital_members")
    .select("hospital_id")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`소속 병원 조회 실패: ${error.message}`);
  return data ? { hospitalId: (data as { hospital_id: string }).hospital_id } : null;
}

export async function loadPartnerState(
  client: SupabaseClient,
  hospitalId: string,
  now: Date,
): Promise<{ hospital: HospitalView; state: PartnerState }> {
  const today = kstServiceDate(now);
  const [hospital, liveRes, lastLiveRes, lastDailyRes] = await Promise.all([
    fetchHospitalView(client, hospitalId, now),
    client
      .from("hospital_live_status")
      .select(LIVE_STATUS_COLUMNS)
      .eq("hospital_id", hospitalId)
      .is("capability_id", null)
      .maybeSingle(),
    // "어제"는 달력상 어제가 아니라 오늘 이전의 마지막 진료일이다. (휴진일 다음 날에도 동작)
    client
      .from("hospital_update_log")
      .select("row_data")
      .eq("hospital_id", hospitalId)
      .eq("table_name", "hospital_live_status")
      .is("row_data->>capability_id", null)
      .lt("service_date", today)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from("hospital_daily_hours")
      .select(DAILY_HOURS_COLUMNS)
      .eq("hospital_id", hospitalId)
      .lt("service_date", today)
      .order("service_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  for (const res of [liveRes, lastLiveRes, lastDailyRes]) {
    if (res.error) throw new Error(`파트너 상태 조회 실패: ${res.error.message}`);
  }
  if (!hospital) throw new PartnerSetupError("소속 병원 정보를 찾을 수 없습니다. CareTime 운영팀에 문의해 주세요.");
  if (!hospital.hours) {
    throw new PartnerSetupError(
      "평소 진료시간이 등록되지 않은 병원입니다. CareTime 운영팀에 진료시간 등록을 요청해 주세요.",
    );
  }

  // 한 번도 확인한 적 없는 병원은 "이미 만료된 상태"로 시작한다. 현재값처럼 보이지 않게.
  const never = hospital.publicData.syncedAt;
  const liveStatus: HospitalLiveStatus = liveRes.data
    ? toLiveStatus(liveRes.data as unknown as LiveStatusRow)
    : {
        hospitalId,
        capabilityId: null,
        status: "normal",
        reasonCode: null,
        customReason: null,
        detailText: null,
        startsAt: null,
        expectedResumeAt: null,
        recheckAt: null,
        verifiedBy: "hospital",
        verifiedAt: never,
        expiresAt: never,
      };

  const lastLive = (lastLiveRes.data as { row_data: LiveStatusRow } | null)?.row_data;
  const lastDaily = lastDailyRes.data as unknown as DailyHoursRow | null;
  const yesterday: YesterdaySnapshot = {
    status: lastLive?.status ?? liveStatus.status,
    reasonCode: lastLive ? lastLive.reason_code : liveStatus.reasonCode,
    customReason: lastLive ? lastLive.custom_reason : liveStatus.customReason,
    detailText: lastLive ? lastLive.detail_text : liveStatus.detailText,
    lastAdmissionClock: lastDaily?.last_admission_at ? formatClock(lastDaily.last_admission_at) : null,
  };

  return {
    hospital,
    state: {
      hospitalId,
      mode: deriveTodayMode(liveStatus, now),
      liveStatus,
      hours: hospital.hours,
      contact: hospital.contactStatus ?? { hospitalId, status: "available", customNote: null, verifiedAt: never },
      waiting: hospital.waiting ?? { hospitalId, level: "normal", headcount: 0, verifiedAt: never },
      yesterday,
    },
  };
}

/** 한 조각을 저장하고, DB 가 확정한 행(서버 확인시각 포함)을 돌려준다. */
export async function saveSlice(
  client: SupabaseClient,
  slice: PartnerSlice,
  state: PartnerState,
  now: Date,
): Promise<HospitalChange> {
  const hospital_id = state.hospitalId;

  switch (slice) {
    case "live": {
      const l = state.liveStatus;
      const { data, error } = await client
        .from("hospital_live_status")
        .upsert(
          {
            hospital_id,
            capability_id: null,
            status: l.status,
            reason_code: l.reasonCode,
            custom_reason: l.customReason,
            detail_text: l.detailText,
            starts_at: l.startsAt,
            expected_resume_at: l.expectedResumeAt,
            recheck_at: l.recheckAt,
            verified_by: "hospital",
            expires_at: l.expiresAt,
          },
          { onConflict: "hospital_id,capability_id" },
        )
        .select(LIVE_STATUS_COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      return { table: "hospital_live_status", row: data as unknown as LiveStatusRow };
    }
    case "hours": {
      const h = state.hours;
      const { data, error } = await client
        .from("hospital_daily_hours")
        .upsert(
          {
            hospital_id,
            service_date: kstServiceDate(now),
            today_close_at: h.todayCloseAt,
            last_admission_at: h.admissionConfirmed ? h.lastAdmissionAt : null,
            admission_confirmed: h.admissionConfirmed && h.lastAdmissionAt !== null,
            today_note: h.todayNote,
            verified_by: "hospital",
          },
          { onConflict: "hospital_id,service_date" },
        )
        .select(DAILY_HOURS_COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      return { table: "hospital_daily_hours", row: data as unknown as DailyHoursRow };
    }
    case "contact": {
      const { data, error } = await client
        .from("hospital_contact_status")
        .upsert(
          { hospital_id, status: state.contact.status, custom_note: state.contact.customNote },
          { onConflict: "hospital_id" },
        )
        .select(CONTACT_COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      return { table: "hospital_contact_status", row: data as unknown as ContactStatusRow };
    }
    case "waiting": {
      const { data, error } = await client
        .from("hospital_waiting_status")
        .upsert(
          { hospital_id, level: state.waiting.level, headcount: state.waiting.headcount },
          { onConflict: "hospital_id" },
        )
        .select(WAITING_COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      return { table: "hospital_waiting_status", row: data as unknown as WaitingStatusRow };
    }
  }
}

/** DB 에서 확정된 행(내 저장 응답 또는 다른 기기의 변경)을 파트너 상태에 반영한다. */
export function applyHospitalChange(state: PartnerState, change: HospitalChange, now: Date): PartnerState {
  switch (change.table) {
    case "hospital_live_status": {
      if (change.row.capability_id !== null) return state; // 파트너 화면은 병원 전체 상태만 다룬다.
      const liveStatus = toLiveStatus(change.row);
      return { ...state, liveStatus, mode: deriveTodayMode(liveStatus, now) };
    }
    case "hospital_daily_hours": {
      const row = change.row;
      if (row.service_date !== kstServiceDate(now)) return state;
      return {
        ...state,
        hours: {
          ...state.hours,
          todayCloseAt: row.today_close_at,
          lastAdmissionAt: row.last_admission_at,
          admissionConfirmed: row.admission_confirmed,
          todayNote: row.today_note,
          verifiedBy: row.verified_by,
          verifiedAt: row.verified_at,
        },
      };
    }
    case "hospital_contact_status":
      return { ...state, contact: toContact(change.row) };
    case "hospital_waiting_status":
      return { ...state, waiting: toWaiting(change.row) };
  }
}
