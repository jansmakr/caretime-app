import type { SupabaseClient } from "@supabase/supabase-js";
import { kstServiceDate } from "@/lib/kst";
import {
  CONTACT_COLUMNS,
  DAILY_HOURS_COLUMNS,
  LIVE_STATUS_COLUMNS,
  WAITING_COLUMNS,
  toHospitalView,
  type HospitalJoinedRow,
} from "./rows";
import type { HospitalView } from "./types";

/**
 * Supabase 읽기 경로. 보호자 화면·파트너 화면이 같은 조립 규칙(rows.ts)을 쓴다.
 * 결제·제휴 테이블은 조인하지 않는다. (Release Blocker 8)
 */

const HOSPITAL_SELECT = [
  "id,hpid,name,address,tel,lat,lng,synced_at,is_participating",
  "regular_open,regular_close,regular_hours_source,regular_hours_verified_at",
  "hospital_capabilities(capability_id,custom_label,mapping_status,age_min,age_max,age_note,sort_order)",
  `hospital_live_status(${LIVE_STATUS_COLUMNS})`,
  `hospital_daily_hours(${DAILY_HOURS_COLUMNS})`,
  `hospital_contact_status(${CONTACT_COLUMNS})`,
  `hospital_waiting_status(${WAITING_COLUMNS})`,
].join(",");

export async function fetchHospitalViews(client: SupabaseClient, now = new Date()): Promise<HospitalView[]> {
  const { data, error } = await client
    .from("hospitals")
    .select(HOSPITAL_SELECT)
    .eq("hospital_daily_hours.service_date", kstServiceDate(now));
  if (error) throw new Error(`hospitals 조회 실패: ${error.message}`);
  return (data as unknown as HospitalJoinedRow[]).map((row) => toHospitalView(row, now));
}

export async function fetchHospitalView(
  client: SupabaseClient,
  id: string,
  now = new Date(),
): Promise<HospitalView | null> {
  const { data, error } = await client
    .from("hospitals")
    .select(HOSPITAL_SELECT)
    .eq("id", id)
    .eq("hospital_daily_hours.service_date", kstServiceDate(now))
    .maybeSingle();
  if (error) throw new Error(`hospital ${id} 조회 실패: ${error.message}`);
  return data ? toHospitalView(data as unknown as HospitalJoinedRow, now) : null;
}
