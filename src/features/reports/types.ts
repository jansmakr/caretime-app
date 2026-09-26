/**
 * 보호자 실시간 제보 (사용자 공유 계층).
 *
 * 설계 규칙: 이 타입은 병원 직접확인 계층과 절대 합쳐지지 않는다.
 *   UserReport 는 HospitalLiveStatus / HospitalWaitingStatus 로 승격되는 경로가 없고,
 *   source 는 "user" 리터럴로 고정이라 다른 출처로 바뀔 수 없다.
 *   (README 「8단계 CI lint 룰」 1번 — 사용자 입력이 hospital_live_status 에 write 하는 경로 금지)
 *
 * 그래서 이 모듈은 features/hospitals 의 쓰기 함수를 import 하지 않는다.
 * 읽기 전용으로 HospitalView 타입만 참조한다(자동완성 목록 구성).
 */

import type { Sido } from "./regions";

/** 제보 카테고리 3분할. 늘리기 전에 "정말 이 칩이 필요한가"를 먼저 본다. */
export type ReportCategory = "laceration" | "burn" | "other";

/**
 * 제보 대상 의료기관.
 * listed: 목록(공공/참여 의료기관)에서 고른 병원. hospitalId 가 있다.
 * manual: 목록에 없어 보호자가 직접 적은 병원. hospitalId 가 없고, 끝까지 없다.
 *         수기 입력을 나중에 특정 병원으로 자동 연결하지 않는다 — 오연결은 되돌릴 수 없다.
 */
export interface ReportTarget {
  kind: "listed" | "manual";
  hospitalId: string | null;
  hospitalName: string;
  sido: Sido | null;
  sigungu: string | null;
}

/** 작성 폼이 들고 있는 값. 아직 시각도 id 도 없다. */
export interface ReportDraft {
  target: ReportTarget;
  category: ReportCategory;
  /** "기타"에서만 쓰는 증상·주제 직접 입력. 나머지 카테고리에서는 null. */
  topic: string | null;
  body: string;
  /** 보호자가 센 현재 대기 인원. null = 확인하지 못함(추정값을 넣지 않는다). */
  waitingHeadcount: number | null;
}

export interface UserReport extends ReportDraft {
  id: string;
  /** 항상 "user". SourceBadge 가 비어 있는 점선 원으로 그린다. */
  source: "user";
  createdAt: string; // ISO8601
}

export const REPORT_BODY_MAX = 500;
export const REPORT_TOPIC_MAX = 30;
export const REPORT_WAITING_MAX = 99;
