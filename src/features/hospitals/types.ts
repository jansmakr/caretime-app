/**
 * CareTime 도메인 타입.
 *
 * 설계 규칙 ①: 정보 계층은 타입 단계에서 섞이지 않는다.
 *   공공정보(PublicHospitalData) / 진료기능(Capability) / 병원 직접확인(LiveStatus)
 *   / 사용자 공유(UserReport) 는 서로 다른 타입이며, 한 객체로 병합하지 않는다.
 *   화면에서 합쳐 보이더라도 출처 필드는 끝까지 따라다닌다.
 *
 * 설계 규칙 ②: 병원 객체에 결제·제휴 관련 필드를 두지 않는다.
 *   검색 정렬이 그 값에 접근할 수 있는 경로 자체를 만들지 않는다. (Release Blocker 8)
 */

/** 정보 출처. 화면에서 절대 하나로 합치지 않는다. (기획안 12항) */
export type InfoSource =
  | "hospital" // 🟢 의료기관 직접확인
  | "public" //  🔵 공식 공공정보
  | "operator" // 🟡 운영자 전화확인
  | "user"; //   ⚪ 사용자 공유·미확인

/** 출처가 붙은 값. 확인시각 없는 정보는 CareTime에 존재할 수 없다. */
export interface Sourced<T> {
  value: T;
  source: InfoSource;
  verifiedAt: string; // ISO8601
}

/** 표준 진료기능. 확장 가능하도록 문자열 id를 쓴다. (기획안 9항) */
export interface Capability {
  id: string;
  label: string;
  group: "facial" | "hand" | "burn" | "other";
}

/** 병원이 등록한 진료기능 + 연령조건. 하이브리드(표준 + 직접입력). (16항) */
export interface HospitalCapability {
  capabilityId: string | null; // 표준 매핑. 미매핑 custom이면 null
  customLabel: string | null; // 병원이 직접 입력한 문구
  mappingStatus: "mapped" | "pending" | "standard";
  ageMin: number | null; // 만 나이. null = 하한 없음
  ageMax: number | null;
  ageNote: string | null; // 직접 입력 조건
}

export type LiveStatusCode = "normal" | "partial" | "paused" | "difficult";

export type LimitReasonCode =
  | "staff"
  | "specialist_absent"
  | "in_procedure"
  | "emergency"
  | "crowded"
  | "equipment"
  | "space"
  | "custom";

/**
 * 병원이 직접 입력하는 시간가변 상태.
 * expectedResumeAt 이 지나도 자동으로 normal 로 돌리지 않는다. (기획안 18항)
 * 지난 시각은 '재확인 필요'라는 파생 상태를 만들 뿐이다. → lib/freshness.ts
 */
export interface HospitalLiveStatus {
  hospitalId: string;
  capabilityId: string | null; // null = 병원 전체
  status: LiveStatusCode;
  reasonCode: LimitReasonCode | null;
  customReason: string | null;
  detailText: string | null;
  startsAt: string | null;
  expectedResumeAt: string | null;
  recheckAt: string | null;
  verifiedBy: InfoSource; // hospital | operator
  verifiedAt: string;
  expiresAt: string;
}

/**
 * 진료시간. 평소값과 "오늘만" 값을 분리해서 보관한다.
 * todayCloseAt 은 당일 한정이며 다음날 자동으로 null 이 된다.
 *
 * lastAdmissionAt(내원 마감)은 admissionConfirmed 가 true 일 때만
 * 보호자에게 시각으로 표시된다. 미확인 상태에서 추정 시각을 노출하지 않는다.
 */
export interface HospitalHours {
  hospitalId: string;
  regularOpenAt: string;
  regularCloseAt: string;
  todayCloseAt: string | null;
  lastAdmissionAt: string | null;
  admissionConfirmed: boolean;
  todayNote: string | null;
  verifiedBy: InfoSource;
  verifiedAt: string;
}

export type ContactStatusCode =
  | "available"
  | "busy"
  | "difficult"
  | "prefer_app";

export interface HospitalContactStatus {
  hospitalId: string;
  status: ContactStatusCode;
  customNote: string | null;
  verifiedAt: string;
}

/** 현재 대기. 내원예정과 절대 합산하지 않는다. (기획안 26항) */
export interface HospitalWaitingStatus {
  hospitalId: string;
  level: "light" | "normal" | "crowded" | "very_crowded" | "check_needed";
  headcount: number | null; // 병원이 선택적으로 입력
  verifiedAt: string;
}

/** 내원예정 집계. 현재 대기와 별도 필드로만 존재한다. */
export interface IncomingAggregate {
  hospitalId: string;
  within10: number;
  within30: number;
  within60: number;
}

/** 공공데이터에서 온 기본정보. 병원이 수정할 수 없다. */
export interface PublicHospitalData {
  hpid: string; // 국립중앙의료원 기관ID
  name: string;
  address: string;
  tel: string;
  lat: number;
  lng: number;
  syncedAt: string;
}

/**
 * 항목별 공식 상태 (service_statuses). 병원당 여러 줄이다.
 *
 * 기존 HospitalLiveStatus(병원당 한 줄)와 **병존**한다. 옮기는 중이기 때문이다.
 *   services   : 항목별 목록. 아직 화면에 노출하지 않는다. (턴 1.6 에서 연다)
 *   liveStatus : 그 목록을 가장 보수적으로 접은 대표 하나. 화면이 지금 읽는 값이다.
 * 접기 규칙은 features/hospitals/serviceStatus.ts 에 있다.
 *
 * status 가 null 이면 병원이 이 항목에 아직 아무 값도 게시하지 않은 것이다.
 * 없는 값을 '가능'으로 읽지 않기 위해 null 을 그대로 들고 온다.
 */
export interface HospitalServiceStatus {
  serviceId: string;
  category: "laceration" | "burn" | "other";
  serviceCode: string;
  /** null = 미게시. 만료 판정은 읽는 시점에 한다(serviceStatus.effectiveStatusOf). */
  status: "AVAILABLE" | "LIMITED" | "CLOSED" | "PAUSED" | null;
  waitBucket: "UNKNOWN" | "LE30" | "FROM30TO60" | "GE60";
  validUntil: string | null;
  updatedAt: string | null;
  reopenAt: string | null;
  /**
   * 동시 수정 compare-and-swap 용. 화면은 쓰지 않는다.
   * null = 모름. 보호자 공개 경로(service_statuses_public 뷰)는 이 값을 내보내지 않는다.
   * CAS 를 하려면 병원 계정으로 원본 테이블을 다시 읽어야 한다.
   */
  version: number | null;
}

/** 화면 조립용 뷰 모델. 각 조각은 출처를 잃지 않은 채로 들어온다. */
export interface HospitalView {
  id: string;
  publicData: PublicHospitalData;
  distanceKm: number;
  travelMinutes: number;
  capabilities: HospitalCapability[];
  hours: HospitalHours | null;
  /**
   * 병원 대표 상태. services 를 가장 보수적으로 접은 값이다.
   * service_statuses 이행 전에는 옛 hospital_live_status 에서 그대로 온다.
   */
  liveStatus: HospitalLiveStatus | null;
  /**
   * 항목별 공식 상태 목록. **아직 화면에 노출하지 않는다.**
   * 이행 전에는 빈 배열이다. 턴 1.6 에서 카드·상세가 이 값을 읽는다.
   */
  services: HospitalServiceStatus[];
  contactStatus: HospitalContactStatus | null;
  waiting: HospitalWaitingStatus | null;
  incoming: IncomingAggregate | null;
  /** 참여 의료기관 여부. 정렬에는 쓰지 않는다. 안내 문구(37항) 표기에만 쓴다. */
  isParticipating: boolean;
}
