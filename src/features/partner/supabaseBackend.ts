import type { SupabaseClient } from "@supabase/supabase-js";
import type { HospitalChange } from "@/features/hospitals/realtime";
import { fetchHospitalView } from "@/features/hospitals/repository";
import {
  CONTACT_COLUMNS,
  DAILY_HOURS_COLUMNS,
  HOSPITAL_SERVICE_PUBLIC_COLUMNS,
  SERVICE_STATUS_PUBLIC_COLUMNS,
  WAITING_COLUMNS,
  toContact,
  toLiveStatus,
  toServiceStatuses,
  toWaiting,
  type DailyHoursRow,
  type ContactStatusRow,
  type HospitalServiceRow,
  type LiveStatusRow,
  type ServiceStatusRow,
  type WaitingStatusRow,
} from "@/features/hospitals/rows";
import { representativeLiveStatus } from "@/features/hospitals/serviceStatus";
import type { ServiceStatus } from "@/features/p0/status";
import type {
  HospitalLiveStatus,
  HospitalView,
  LimitReasonCode,
  LiveStatusCode,
} from "@/features/hospitals/types";
import { formatClock } from "@/lib/freshness";
import { kstServiceDate } from "@/lib/kst";
import { deriveTodayMode } from "./service";
import type { PartnerServiceStatus, PartnerState, YesterdaySnapshot } from "./types";

/**
 * 파트너 화면 ↔ Supabase.
 * 쓰기 권한은 RLS(hospital_members)가 판정한다. 여기서 권한을 흉내 내지 않는다.
 * 확인시각(verified_at)은 DB 트리거가 찍으므로 보내지 않고, 응답 행의 값을 화면에 다시 반영한다.
 */

export type PartnerSlice = "live" | "hours" | "contact" | "waiting";

export const SLICE_OF_TABLE: Record<HospitalChange["table"], PartnerSlice> = {
  service_statuses: "live",
  hospital_daily_hours: "hours",
  hospital_contact_status: "contact",
  hospital_waiting_status: "waiting",
};

/** 운영자가 계정을 병원에 연결하지 않았거나, 병원 기본정보가 부족해 입력을 받을 수 없는 경우. */
export class PartnerSetupError extends Error {}

export interface Membership {
  hospitalId: string;
  role: "owner" | "staff";
  /** 선택 화면에 보여줄 기관명. hospitals 는 공개 읽기라 조인으로 가져온다. */
  hospitalName: string;
}

/**
 * 로그인한 사용자의 소속 기관 **전부**.
 *
 * RLS 의 "own membership" 정책이 user_id = auth.uid() 행만 돌려주므로
 * 클라이언트가 타인의 소속을 볼 수 없다. 서버에서 다시 걸러야 할 값이 아니다.
 *
 * 한 곳이면 바로 진입하고, 여러 곳이면 선택 화면을 띄운다. 그래서 limit 을 걸지 않는다.
 * (이전 구현은 .limit(1) 로 첫 행만 가져와 겸직 직원이 다른 기관으로 못 들어갔다)
 */
export async function fetchMemberships(client: SupabaseClient): Promise<Membership[]> {
  const { data, error } = await client
    .from("hospital_members")
    .select("hospital_id, role, hospitals(name)")
    .order("created_at");
  if (error) throw new Error(`소속 병원 조회 실패: ${error.message}`);

  type Row = { hospital_id: string; role: "owner" | "staff"; hospitals: { name: string } | { name: string }[] | null };
  return (data as unknown as Row[]).map((row) => {
    const joined = Array.isArray(row.hospitals) ? row.hospitals[0] : row.hospitals;
    return {
      hospitalId: row.hospital_id,
      role: row.role,
      hospitalName: joined?.name ?? row.hospital_id,
    };
  });
}

export async function loadPartnerState(
  client: SupabaseClient,
  hospitalId: string,
  now: Date,
): Promise<{ hospital: HospitalView; state: PartnerState }> {
  const today = kstServiceDate(now);
  const [hospital, current, lastEventsRes, lastDailyRes] = await Promise.all([
    fetchHospitalView(client, hospitalId, now),
    // 현재 상태: 항목별 원본을 읽는다(만료된 값도 본다). 대표는 그것을 접은 결과다.
    readCurrentStatus(client, hospitalId, now),
    /*
     * "어제와 동일"이 읽는 이력.
     *
     * 옛 경로는 hospital_update_log 를 봤다. 쓰기가 service_statuses 로 옮겨졌으므로
     * 이제 status_events 를 본다(같은 migration 의 log_write 트리거가 쌓는다).
     *
     * "어제"는 달력상 어제가 아니라 **오늘 이전의 마지막 진료일**이다(휴진일 다음 날에도
     * 동작해야 한다). status_events 에는 진료일 컬럼이 없고 created_at 만 있어서,
     * 최근 것부터 조금 받아 와 진료일 경계를 코드에서 판정한다. KST 경계 판정을
     * SQL 과 코드 두 곳에 쓰지 않으려는 것이다(lib/kst 하나만 쓴다).
     */
    client
      .from("status_events")
      .select("new_json, created_at")
      .eq("hospital_id", hospitalId)
      .order("id", { ascending: false })
      .limit(YESTERDAY_EVENT_SCAN),
    client
      .from("hospital_daily_hours")
      .select(DAILY_HOURS_COLUMNS)
      .eq("hospital_id", hospitalId)
      .lt("service_date", today)
      .order("service_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  for (const res of [lastEventsRes, lastDailyRes]) {
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
  const liveStatus: HospitalLiveStatus = current.representative
    ? toLiveStatus(current.representative)
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

  /*
   * 오늘 이전의 마지막 진료일에 남은 값을 찾는다. 오늘 쌓인 이력은 건너뛴다 —
   * 그건 "어제"가 아니라 방금 누른 값이다.
   */
  const events = (lastEventsRes.data ?? []) as { new_json: ServiceStatusRow; created_at: string }[];
  const beforeToday = events.filter((e) => kstServiceDate(new Date(e.created_at)) < today);
  const lastEvent = beforeToday[0];

  /*
   * 어제의 **항목별** 값. 항목마다 가장 최근 것 하나씩.
   * events 는 id 내림차순이라 먼저 만나는 것이 그 항목의 마지막 값이다.
   *
   * 이게 있어야 다음 날 "어제와 동일"이 예외까지 되살린다. 없으면 예외를 만든 병원이
   * 매일 항목을 다시 눌러야 하고, 그러면 아무도 예외를 쓰지 않는다.
   */
  const yesterdayServices: Record<string, LiveStatusCode> = {};
  for (const e of beforeToday) {
    const id = e.new_json.service_id;
    if (id && !(id in yesterdayServices)) {
      yesterdayServices[id] = TO_LEGACY_STATUS[e.new_json.status];
    }
  }
  const lastLive = lastEvent
    ? {
        // 옛 4값으로 되돌려 화면에 넘긴다. 화면이 아직 4값으로 입력을 받는다.
        status: TO_LEGACY_STATUS[lastEvent.new_json.status],
        reason_code: asLimitReason(lastEvent.new_json.reason_code),
        custom_reason: null,
        detail_text: null,
      }
    : null;
  const lastDaily = lastDailyRes.data as unknown as DailyHoursRow | null;
  const yesterday: YesterdaySnapshot = {
    status: lastLive?.status ?? liveStatus.status,
    reasonCode: lastLive ? lastLive.reason_code : liveStatus.reasonCode,
    customReason: lastLive ? lastLive.custom_reason : liveStatus.customReason,
    detailText: lastLive ? lastLive.detail_text : liveStatus.detailText,
    lastAdmissionClock: lastDaily?.last_admission_at ? formatClock(lastDaily.last_admission_at) : null,
    services: yesterdayServices,
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
      services: current.services,
      yesterday,
    },
  };
}

/** 한 조각을 저장하고, DB 가 확정한 행(서버 확인시각 포함)을 돌려준다. */
/**
 * 옛 4값 → 새 5값. serviceStatus.ts 의 TO_LEGACY 와 정확히 반대다.
 * 파트너 화면이 아직 옛 4값으로 입력을 받기 때문에 쓰기 직전에 한 번 변환한다.
 * 화면이 항목별·5값으로 바뀌면 이 표가 사라진다.
 */
const TO_SERVICE_STATUS: Record<HospitalLiveStatus["status"], ServiceStatus> = {
  normal: "AVAILABLE",
  partial: "LIMITED",
  paused: "PAUSED",
  difficult: "CLOSED",
};

/**
 * service_statuses.reason_code 는 자유 문자열(≤40자)이고, 화면이 읽는 사유는 enum 이다.
 * 파트너가 쓴 값은 그 enum 이지만 타입이 그것을 보장하지 않는다. 그래서 아는 값만 통과시키고
 * 모르는 값은 null 로 떨어뜨린다 — 캐스팅으로 아는 척하지 않는다.
 */
function asLimitReason(value: string | null): LimitReasonCode | null {
  return value !== null && LIMIT_REASONS.includes(value as LimitReasonCode)
    ? (value as LimitReasonCode)
    : null;
}

const LIMIT_REASONS: LimitReasonCode[] = [
  "staff",
  "specialist_absent",
  "in_procedure",
  "emergency",
  "crowded",
  "equipment",
  "space",
  "custom",
];

/** 이력을 화면으로 되돌릴 때 쓰는 반대 방향. UNKNOWN 은 이력에 저장되지 않는다(CHECK). */
const TO_LEGACY_STATUS: Record<
  Exclude<ServiceStatus, "UNKNOWN">,
  HospitalLiveStatus["status"]
> = {
  AVAILABLE: "normal",
  LIMITED: "partial",
  PAUSED: "paused",
  CLOSED: "difficult",
};

/**
 * "어제와 동일"을 찾기 위해 훑는 이력 건수.
 *
 * 한 번 누르면 항목 수만큼(현재 1~2건) 이력이 쌓인다. 오늘 여러 번 눌렀더라도
 * 그 앞의 진료일까지 닿을 만큼은 넉넉해야 하고, 무한히 받아 올 필요는 없다.
 * 닿지 못하면 "어제 값 없음"으로 떨어지고 화면은 현재값을 기본으로 쓴다 —
 * 없는 값을 지어내지 않는다.
 */
const YESTERDAY_EVENT_SCAN = 60;

/** 병원 계정이 읽는 항목별 상태. 공개 뷰가 아니라 **원본**을 읽는다. */
const MEMBER_STATUS_COLUMNS = `${SERVICE_STATUS_PUBLIC_COLUMNS},version`;

/**
 * 이 병원의 항목별 상태를 읽어 대표 하나로 접는다.
 *
 * 공개 뷰(service_statuses_public)를 쓰지 않는 이유: 뷰는 만료된 행을 숨긴다.
 * 파트너 화면은 만료된 값을 **봐야 한다** — "어제 확인한 상태가 만료됨"을 보여 주고
 * 다시 누르게 하는 것이 이 화면의 첫 화면이다. 숨기면 그 안내를 만들 수 없다.
 */
interface CurrentStatus {
  /** 접힌 대표. 항목이 하나도 게시되지 않았으면 null. */
  representative: LiveStatusRow | null;
  /** 항목별 값. 게시되지 않은 항목은 "정상"으로 시작한다(화면의 기본 선택). */
  services: PartnerServiceStatus[];
}

async function readCurrentStatus(
  client: SupabaseClient,
  hospitalId: string,
  now: Date,
): Promise<CurrentStatus> {
  const [catalogRes, statusRes] = await Promise.all([
    client.from("hospital_services").select(HOSPITAL_SERVICE_PUBLIC_COLUMNS).eq("hospital_id", hospitalId),
    client.from("service_statuses").select(MEMBER_STATUS_COLUMNS).eq("hospital_id", hospitalId),
  ]);
  if (catalogRes.error) throw new Error(catalogRes.error.message);
  if (statusRes.error) throw new Error(statusRes.error.message);

  const services = toServiceStatuses(
    (catalogRes.data ?? []) as unknown as HospitalServiceRow[],
    (statusRes.data ?? []) as unknown as ServiceStatusRow[],
  );
  const partnerServices: PartnerServiceStatus[] = services.map((svc) => ({
    serviceId: svc.serviceId,
    category: svc.category,
    // 아직 누르지 않은 항목은 "정상"을 기본 선택으로 둔다. 저장되기 전까지는 아무 주장도 아니다.
    status: svc.status === null ? "normal" : TO_LEGACY_STATUS[svc.status],
    expiresAt: svc.validUntil,
  }));

  const rep = representativeLiveStatus(hospitalId, services, now);
  if (!rep) return { representative: null, services: partnerServices };

  // 화면이 읽는 모양(DB 행)으로 맞춘다. 저장하지 않는 파생물이다.
  return {
    services: partnerServices,
    representative: {
      hospital_id: rep.hospitalId,
      capability_id: null,
      status: rep.status,
      reason_code: rep.reasonCode,
      custom_reason: rep.customReason,
      detail_text: rep.detailText,
      starts_at: rep.startsAt,
      expected_resume_at: rep.expectedResumeAt,
      recheck_at: rep.recheckAt,
      verified_by: rep.verifiedBy,
      verified_at: rep.verifiedAt,
      expires_at: rep.expiresAt,
    },
  };
}

export async function saveSlice(
  client: SupabaseClient,
  slice: PartnerSlice,
  state: PartnerState,
  now: Date,
): Promise<HospitalChange> {
  const hospital_id = state.hospitalId;

  switch (slice) {
    case "live": {
      /*
       * 병원 상태는 service_statuses 에 쓴다. hospital_live_status 에는 더 쓰지 않는다.
       * 테이블은 남아 있고 읽기 정책도 그대로다(비파괴) — 과거 값이 필요하면 그때 읽는다.
       *
       * 지금 파트너 화면의 상태 입력은 **병원 전체 하나**다. 그래서 그 값을 이 병원의
       * 모든 항목에 같이 쓴다. 이건 없던 정보를 만드는 것이 아니다 — 병원이 "우리 병원은
       * 지금 X"라고 누른 것이고, 그 주장의 범위가 병원 전체이므로 모든 항목이 X다.
       * (시드 이행에서 같은 복제를 거부한 것과 다르다. 그건 출처를 모르는 과거 값이었다.)
       *
       * 항목별로 다르게 누르는 화면은 아직 만들지 않는다. 야간 당직자가 3번 눌러야 하는
       * 화면이 되면 "어제와 동일 한 번이면 끝"이 깨지고, 그러면 아무도 쓰지 않는다.
       * 이 서비스는 병원이 눌러야 데이터가 생긴다. (docs/UI-PRINCIPLES.md 원칙 1·4)
       *
       * 시각·작성자·만료·version 은 DB 트리거가 찍는다(stamp_write). 보내지 않는다 —
       * 기기 시계가 몇 초 어긋나면 TTL CHECK 에 걸려 "저장 실패"가 된다.
       */
      const services = state.services;

      if (services.length === 0) {
        // 조용히 성공하면 병원은 눌렀는데 화면에 아무것도 안 나온다. 그건 더 나쁘다.
        throw new PartnerSetupError(
          "이 의료기관에 등록된 진료 항목이 없어 상태를 저장할 수 없습니다. 운영자에게 문의해 주세요.",
        );
      }

      const { error } = await client.from("service_statuses").upsert(
        services.map((svc) => ({
          hospital_id,
          service_id: svc.serviceId,
          status: TO_SERVICE_STATUS[svc.status],
          wait_bucket: "UNKNOWN",
          reason_code: state.liveStatus.reasonCode,
          // 재개 예정 시각은 '일시 중단'에서만 뜻이 있다. 항목마다 따로 본다.
          reopen_at: svc.status === "paused" ? state.liveStatus.expectedResumeAt : null,
          /*
           * 만료는 서버가 정한다(stamp_write → clamp_status_valid_until).
           * 얼마나 유효한지는 병원이 고르는 값이 아니라 우리 정책이고, 기기 시계를 끼우면
           * 몇 초 차이로 TTL CHECK 에 걸려 "저장 실패"가 된다.
           *
           * 그런데 **빼지 않고 null 을 명시해서 보낸다.** 빼면 upsert 의 SET 목록에서도
           * 빠져서, 두 번째 누름부터 트리거가 보는 new.valid_until 이 **이전 값**이 된다.
           * 그러면 다시 눌러도 창이 늘지 않는다 — 50분 전에 눌러 둔 병원이 다시 눌렀을 때
           * 10분만 유효해진다. 그건 병원이 방금 확인한 사실과 다르다.
           */
          valid_until: null,
        })),
        { onConflict: "hospital_id,service_id" },
      );
      if (error) throw new Error(error.message);

      /*
       * 저장된 결과를 다시 읽어 대표 하나로 접어 돌려준다.
       * 화면은 아직 "병원의 상태는 하나"를 전제하므로 옛 모양(HospitalLiveStatus)으로
       * 맞춰 준다. 이 값은 읽기 전용 파생물이다 — 어디에도 저장되지 않는다.
       */
      const fresh = await readCurrentStatus(client, hospital_id, now);
      if (!fresh.representative) throw new Error("상태를 저장했지만 다시 읽지 못했습니다.");
      return { table: "service_statuses", row: fresh.representative };
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
    case "service_statuses": {
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
