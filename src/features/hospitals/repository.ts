import type { SupabaseClient } from "@supabase/supabase-js";
import { kstServiceDate } from "@/lib/kst";
import {
  CONTACT_COLUMNS,
  DAILY_HOURS_COLUMNS,
  HOSPITAL_SERVICE_PUBLIC_COLUMNS,
  LIVE_STATUS_COLUMNS,
  SERVICE_STATUS_PUBLIC_COLUMNS,
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
  /*
   * 항목별 공식 상태는 **원본 테이블이 아니라 공개 뷰**를 읽는다.
   * 원본(service_statuses·hospital_services)에는 anon 읽기 정책이 없다 — 의도다.
   * 뷰는 컬럼을 명시하므로 나중에 붙는 컬럼(updated_by 같은 것)이 자동 공개되지 않는다.
   * 카탈로그와 상태를 따로 읽는 이유: 상태 뷰는 만료된 행을 빼고 주므로 그것만으로는
   * "항목이 몇 개인가"를 알 수 없고, 접기 규칙이 모르는 항목을 세지 못한다.
   */
  /*
   * `!제약조건명` 은 어느 관계로 조인할지 못박는 것이다. 이름만 쓰면 PostgREST 가
   * hospitals ↔ 이 뷰 사이의 경로를 여러 개(직접 FK, service_statuses 를 거치는 다대다)로
   * 보고 PGRST201 로 거부한다. 경로를 고정해 두면 새 FK 가 생겨도 조인이 흔들리지 않는다.
   */
  `hospital_services_public!hospital_services_hospital_id_fkey(${HOSPITAL_SERVICE_PUBLIC_COLUMNS})`,
  `service_statuses_public!service_statuses_hospital_id_fkey(${SERVICE_STATUS_PUBLIC_COLUMNS})`,
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
