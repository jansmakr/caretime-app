import { isExpired } from "@/lib/freshness";
import type { HospitalLiveStatus, HospitalServiceStatus, LiveStatusCode } from "./types";
import type { ServiceStatus } from "@/features/p0/status";

/**
 * 항목별 공식 상태 → 병원 대표 상태 접기.
 *
 * 왜 접는가: 화면(HospitalCard · HospitalDetail)은 아직 "병원의 상태는 하나"를 전제로
 * pill 하나·문구 하나를 그린다. 이 턴에서는 화면을 고치지 않으므로, 데이터 계층에서
 * 항목 목록을 받아 대표 하나로 접어 기존 liveStatus 모양으로 돌려준다.
 * 항목별 표시는 다음 턴(1.6)에서 화면을 바꿀 때 열린다. 그래서 두 값이 병존한다.
 *
 * ── 접기 규칙: 가장 보수적인 항목으로 접는다. 좋은 쪽으로 접지 않는다. ──
 *
 *   CLOSED > PAUSED > LIMITED > UNKNOWN > AVAILABLE
 *
 * 항목이 하나라도 CLOSED 면 대표는 CLOSED 다. 전부 AVAILABLE 일 때만 대표가 AVAILABLE 이다.
 * 미설정·만료(UNKNOWN)도 AVAILABLE 보다 앞이다 — 모르는 항목이 하나라도 있으면
 * 병원 전체를 "지금 접수 가능"으로 말할 수 없다.
 *
 * 이유(안전 판단):
 *   봉합=AVAILABLE / 화상=CLOSED 인 병원을 "지금 접수 가능"으로 접으면
 *   화상 환자 보호자가 그걸 보고 야간에 출발한다.
 *   헛걸음을 없애는 게 이 서비스의 목적인데 접기 규칙이 헛걸음을 만든다.
 *   검색에서 덜 보이는 손해보다 잘못 보내는 손해가 크다.
 *
 * 만료는 읽는 시점에 판정한다. 만료된 항목은 저장값이 무엇이든 UNKNOWN 으로 본다.
 * 판정은 lib/freshness.isExpired 하나를 쓴다 — 여기서 다시 쓰지 않는다.
 */

/** 낮은 값이 더 보수적이다. 정렬이 아니라 '누가 이기는가'의 순서다. */
const FOLD_RANK: Record<ServiceStatus, number> = {
  CLOSED: 0,
  PAUSED: 1,
  LIMITED: 2,
  UNKNOWN: 3,
  AVAILABLE: 4,
};

export const FOLD_PRIORITY: ServiceStatus[] = ["CLOSED", "PAUSED", "LIMITED", "UNKNOWN", "AVAILABLE"];

/**
 * 항목 하나의 지금 상태. 만료됐으면 저장값이 아니라 UNKNOWN 이다.
 * 항목에 상태가 아예 게시되지 않았으면(validUntil === null) 역시 UNKNOWN 이다.
 */
export function effectiveStatusOf(service: HospitalServiceStatus, now: Date): ServiceStatus {
  if (service.status === null || service.validUntil === null) return "UNKNOWN";
  return isExpired({ expiresAt: service.validUntil }, now) ? "UNKNOWN" : service.status;
}

export interface Representative {
  status: ServiceStatus;
  /**
   * 대표를 결정한 항목. 대표가 UNKNOWN 이고 그 이유가 "항목이 아예 없음"이면 null 이다.
   * 화면이 확인시각·사유를 읽을 때 이 항목을 본다.
   */
  source: HospitalServiceStatus | null;
}

/**
 * 목록 → 대표 하나.
 *
 * 빈 목록은 UNKNOWN 이다. AVAILABLE 로 떨어지지 않는다 —
 * reduce 의 초기값을 AVAILABLE 로 두면 항목이 없는 병원이 "접수 가능"이 된다.
 */
export function foldRepresentative(
  services: HospitalServiceStatus[],
  now: Date = new Date(),
): Representative {
  if (services.length === 0) return { status: "UNKNOWN", source: null };

  let best: Representative = { status: "AVAILABLE", source: null };
  let bestRank = FOLD_RANK.AVAILABLE;
  let sawAny = false;

  for (const service of services) {
    const status = effectiveStatusOf(service, now);
    const rank = FOLD_RANK[status];
    if (!sawAny || rank < bestRank) {
      best = { status, source: service };
      bestRank = rank;
      sawAny = true;
    }
  }
  return best;
}

// ─── 기존 화면으로 가는 다리 ────────────────────────────────

/**
 * 새 5값 → 기존 live_status_code 4값.
 *
 * 화면과 lib/freshness.describeStatus 가 아직 옛 enum 을 읽으므로 되돌려 준다.
 * UNKNOWN 은 옛 enum 에 없다 — 옛 구조에서 '모름'은 행이 없거나 만료된 것으로 표현했다.
 * 그래서 UNKNOWN 은 값이 아니라 null(상태 없음)로 내린다. describeStatus(null) 이
 * "현재 상태 확인 필요"를 돌려준다.
 */
const TO_LEGACY: Record<Exclude<ServiceStatus, "UNKNOWN">, LiveStatusCode> = {
  AVAILABLE: "normal",
  LIMITED: "partial",
  PAUSED: "paused",
  CLOSED: "difficult",
};

/**
 * 대표 상태를 기존 HospitalLiveStatus 모양으로 만든다.
 *
 * 이 값은 **읽기 전용 파생물**이다. 저장하지 않는다.
 * verifiedBy 는 'hospital' 이다 — service_statuses 는 병원 계정만 쓸 수 있다(RLS).
 * capabilityId 는 null 이다. 항목 개념이 옛 타입의 capability 와 1:1 이 아니므로
 * 억지로 매핑하지 않는다. 항목별 정보가 필요하면 services 목록을 직접 읽는다.
 */
export function toLegacyLiveStatus(
  hospitalId: string,
  rep: Representative,
): HospitalLiveStatus | null {
  if (rep.status === "UNKNOWN" || rep.source === null) return null;
  const src = rep.source;
  if (src.validUntil === null || src.updatedAt === null) return null;

  return {
    hospitalId,
    capabilityId: null,
    status: TO_LEGACY[rep.status],
    reasonCode: null,
    customReason: null,
    detailText: null,
    startsAt: null,
    // 재개 예정 시각은 PAUSED 에서만 의미가 있다. (p0/status.showsReopenAt 와 같은 규칙)
    expectedResumeAt: rep.status === "PAUSED" ? src.reopenAt : null,
    recheckAt: null,
    verifiedBy: "hospital",
    verifiedAt: src.updatedAt,
    expiresAt: src.validUntil,
  };
}

/** 목록 → 기존 화면이 읽는 단일 값. 한 번에 접는다. */
export function representativeLiveStatus(
  hospitalId: string,
  services: HospitalServiceStatus[],
  now: Date = new Date(),
): HospitalLiveStatus | null {
  return toLegacyLiveStatus(hospitalId, foldRepresentative(services, now));
}
