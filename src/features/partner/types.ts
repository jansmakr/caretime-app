import type {
  HospitalContactStatus,
  HospitalHours,
  HospitalLiveStatus,
  HospitalWaitingStatus,
  LiveStatusCode,
  LimitReasonCode,
} from "@/features/hospitals/types";
import type { CareCategory } from "@/features/hospitals/labels";
import type { ExtractedFacts } from "@/features/search-session/types";

/**
 * 병원 파트너 화면(/partner) 도메인 타입.
 *
 * 병원이 입력하는 값은 새 타입을 만들지 않고 hospitals/types 의 계층 타입을 그대로 쓴다.
 * 입력 화면과 보호자 화면이 같은 모양의 데이터를 보고 있어야
 * "병원이 누른 것"과 "보호자가 본 것"이 어긋나지 않는다.
 */

/**
 * 항목별 상태.
 *
 * 주 3버튼은 독립된 주장이 아니라 **이 값들을 한꺼번에 세팅하는 것**이다. 저장되는 것은
 * 항목값이고, 화면 위의 "오늘 어려움"은 그것을 접은 결과다. 그래서 주 버튼을 누른 뒤
 * 항목 하나를 바꾸는 것은 모순이 아니라 더 정확해지는 것이다.
 *
 * status 는 화면이 쓰는 옛 4값이다. 병원은 이 말로 입력한다.
 */
export interface PartnerServiceStatus {
  serviceId: string;
  category: CareCategory;
  status: LiveStatusCode;
  /** 이 항목의 만료 시각. 아직 누르지 않았으면 null. */
  expiresAt: string | null;
}

/** 오늘 진료상태 원탭 토글. null 은 "오늘 아직 확인하지 않음". */
export type TodayMode = "same_as_yesterday" | "limited" | "difficult";

/**
 * 어제 마지막으로 확인한 값.
 * "어제와 동일"은 이 값을 그대로 다시 쓰고 확인시각만 지금으로 바꾼다.
 * 오늘만 적용되는 값(todayCloseAt)은 어제에서 이어받지 않는다.
 */
export interface YesterdaySnapshot {
  status: LiveStatusCode;
  reasonCode: LimitReasonCode | null;
  customReason: string | null;
  detailText: string | null;
  /** "HH:MM". 병원이 어제 확인한 내원 마감. 미확인이면 null. */
  lastAdmissionClock: string | null;
  /**
   * 어제의 **항목별** 값. serviceId → 상태.
   *
   * 이 화면의 전부가 여기 달려 있다. 예외를 만든 병원도 다음 날은 1탭이어야 한다.
   * 예외 비용이 처음 한 번이고 그 뒤로 1탭으로 돌아오는 것 — 그게 깨지면 나머지가
   * 아무리 좋아도 병원이 안 쓴다.
   *
   * 기록이 없는 항목은 이 표에 없다. 그 항목은 status(병원 전체 값)를 쓴다.
   */
  services: Record<string, LiveStatusCode>;
}

export interface PartnerState {
  hospitalId: string;
  mode: TodayMode | null;
  liveStatus: HospitalLiveStatus;
  hours: HospitalHours;
  contact: HospitalContactStatus;
  /** 현재 대기. 내원예정(IncomingVisit)과 별개 필드이며 합산하지 않는다. */
  waiting: HospitalWaitingStatus;
  /** 항목별 상태. 저장되는 실체다. liveStatus 는 이것을 접은 결과다. */
  services: PartnerServiceStatus[];
  yesterday: YesterdaySnapshot;
}

export type VisitState = "on_the_way" | "arrived" | "cancelled";

/**
 * 보호자가 공유한 내원예정 1건.
 *
 * 이름·연락처는 병원에 넘기지 않는다. 병원은 CT-XXXX 임시코드로만 구분한다.
 * 상황 요약은 보호자가 입력한 사실(나이·부위·상황·지혈여부)만 담는다.
 * 판단·중증도 필드는 두지 않는다. (Release Blocker 7)
 */
export interface IncomingVisit {
  code: string;
  facts: Pick<ExtractedFacts, "ageYears" | "bodyPartId" | "situationId" | "hemostasis">;
  sharedAt: string;
  etaAt: string;
  state: VisitState;
}

export type HoursSaveError = "invalid_clock" | "admission_after_close";
