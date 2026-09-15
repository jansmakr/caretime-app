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

/** 화면 조립용 뷰 모델. 각 조각은 출처를 잃지 않은 채로 들어온다. */
export interface HospitalView {
  id: string;
  publicData: PublicHospitalData;
  distanceKm: number;
  travelMinutes: number;
  capabilities: HospitalCapability[];
  hours: HospitalHours | null;
  liveStatus: HospitalLiveStatus | null;
  contactStatus: HospitalContactStatus | null;
  waiting: HospitalWaitingStatus | null;
  incoming: IncomingAggregate | null;
  /** 참여 의료기관 여부. 정렬에는 쓰지 않는다. 안내 문구(37항) 표기에만 쓴다. */
  isParticipating: boolean;
}
