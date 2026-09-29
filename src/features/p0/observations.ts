/**
 * 퀵 리액션 = 시점이 있는 관찰 (PRD §3.4).
 *
 * 좋아요가 아니다. 게시글별 공감이 아니라 **병원 × 카테고리 × 현재 시점 관찰**에 달린다.
 * 그래서 키가 post_id 가 아니라 (hospital, category, guest, metric) 이다.
 *
 * 표시는 "최근 15분 제보 건수"이며 **대기 인원 수로 읽히지 않게** 한다(§3.4 머리말).
 * 15분이 지나면 자동으로 집계에서 빠지고, 재확인은 사용자가 다시 눌러야 한다.
 */

/**
 * ⏳ 아직 어디서도 import 되지 않는다. 지금 화면의 리액션은 게시글별(features/chat/
 *    reactions.ts)이다. 관찰을 DB 로 옮기는 턴에 이 키 구조로 갈아탄다.
 *    그 전에 자동으로 바꾸지 않는다 — 두 구조는 세는 대상이 다르다.
 */

import type { TemplateCategory } from "./templates";

export type ObservationMetric = "queue" | "staff" | "reception";

/** metric 별로 허용되는 value. 다른 조합은 저장하지 않는다. */
export const OBSERVATION_VALUES = {
  queue: ["LE3"],
  staff: ["PRESENT_REPORTED"],
  reception: ["CLOSED_REPORTED"],
} as const satisfies Record<ObservationMetric, readonly string[]>;

export type ObservationValue = (typeof OBSERVATION_VALUES)[ObservationMetric][number];

export interface ObservationButton {
  metric: ObservationMetric;
  value: ObservationValue;
  label: string;
  emoji: string;
  /** 이 버튼이 무엇을 뜻하고 무엇을 뜻하지 않는지. 툴팁·인라인 설명에 그대로 쓴다. */
  meaning: string;
}

/** PRD §3.4 표를 그대로 옮긴 것. 세 개 외에 늘리지 않는다. */
export const OBSERVATION_BUTTONS: ObservationButton[] = [
  {
    metric: "queue",
    value: "LE3",
    label: "대기 3명 이하",
    emoji: "👍",
    meaning: "이용자가 관찰한 대기 규모입니다. 병원이 센 인원이 아닙니다.",
  },
  {
    metric: "staff",
    value: "PRESENT_REPORTED",
    label: "의사 계심",
    emoji: "🩺",
    meaning: "의료진이 있다고 안내받았다는 뜻이며, 해당 시술이 가능하다는 확정이 아닙니다.",
  },
  {
    metric: "reception",
    value: "CLOSED_REPORTED",
    label: "접수 마감",
    emoji: "⚠️",
    meaning: "해당 항목 접수 마감 안내를 받았다는 뜻입니다.",
  },
];

/** 첫 누름 전 한 번 보여주는 인라인 설명. (PRD §3.4) */
export const OBSERVATION_FIRST_USE_NOTICE = "직접 확인한 상황만 눌러주세요";

/** 관찰 유효기간 15분. 지나면 집계에서 빠진다. */
export const OBSERVATION_TTL_MINUTES = 15;
export const OBSERVATION_TTL_MS = OBSERVATION_TTL_MINUTES * 60_000;

export function buttonFor(metric: ObservationMetric): ObservationButton {
  return OBSERVATION_BUTTONS.find((b) => b.metric === metric) ?? OBSERVATION_BUTTONS[0];
}

export function isValidPair(metric: ObservationMetric, value: string): boolean {
  return (OBSERVATION_VALUES[metric] as readonly string[]).includes(value);
}

export function expiresAtFor(observedAt: Date): Date {
  return new Date(observedAt.getTime() + OBSERVATION_TTL_MS);
}

/**
 * 활성 관찰의 유일 키.
 *
 * PRD §3.4: "동일 guest/hospital/category/metric 은 활성 기록 1개; 값 교체는 원자적 처리."
 * DB 쪽 partial unique index 와 **같은 조합**이어야 한다. 한쪽만 바꾸면 중복이 들어온다.
 * queue·staff·reception 은 서로 다른 사실이므로 동시 선택이 가능하다 — metric 이 키에 있는 이유다.
 */
export function activeKey(input: {
  hospitalId: string;
  category: TemplateCategory;
  guestId: string;
  metric: ObservationMetric;
}): string {
  return [input.hospitalId, input.category, input.guestId, input.metric].join("|");
}

export interface ObservationRow {
  hospitalId: string;
  category: TemplateCategory;
  guestId: string;
  metric: ObservationMetric;
  value: string;
  observedAt: string;
  expiresAt: string;
  active: boolean;
  /** 신고로 격리된 기록은 집계에서 뺀다. (PRD §9.2) */
  quarantined?: boolean;
}

export type ObservationCounts = Record<ObservationMetric, number>;

export const ZERO_COUNTS: ObservationCounts = { queue: 0, staff: 0, reception: 0 };

/**
 * PRD §9.2: observation count = COUNT(active && expires_at > now && not quarantined)
 *
 * 서버와 화면이 같은 함수를 쓴다. 만료 정리 job 이 늦어도 숫자가 부풀지 않는다.
 */
export function countObservations(rows: ObservationRow[], now: Date): ObservationCounts {
  const counts: ObservationCounts = { ...ZERO_COUNTS };
  for (const row of rows) {
    if (!row.active) continue;
    if (row.quarantined) continue;
    const expiresAt = Date.parse(row.expiresAt);
    if (Number.isNaN(expiresAt) || expiresAt <= now.getTime()) continue;
    counts[row.metric] += 1;
  }
  return counts;
}

/** 공식 상태와 비교할 때 쓰는 두 방향. (→ status.detectConflict) */
export function closedReportCount(counts: ObservationCounts): number {
  return counts.reception;
}

/**
 * '접수 가능' 쪽 제보 수.
 *
 * queue(대기 적음)와 staff(의료진 있음)는 접수 가능을 **뜻하지 않는다** —
 * 대기가 없는 이유가 접수를 닫아서일 수도 있다. 그래서 공식 CLOSED 와의 충돌 판정에는
 * 이 두 개를 쓰지 않고, 접수 가능 관찰(L01·B01 계열 글)만 따로 센다.
 */
export function openReportCount(acceptanceObservationPosts: number): number {
  return acceptanceObservationPosts;
}

/** 화면 문구. "3명"처럼 인원으로 읽히지 않게 '건'으로 쓴다. (PRD §3.4) */
export function describeCount(metric: ObservationMetric, count: number): string {
  return count === 0 ? buttonFor(metric).label : `${buttonFor(metric).label} ${count}건`;
}

export function recentWindowText(): string {
  return `최근 ${OBSERVATION_TTL_MINUTES}분 제보`;
}

/**
 * 토글이 아니라 "원하는 상태"를 보낸다. (PRD §10 PUT observations/:metric)
 * 같은 요청이 두 번 도착해도 결과가 같아야 하므로 active 를 그대로 받는다.
 */
export function nextActiveState(current: boolean, desired: boolean): boolean {
  return desired;
}

/** 낙관적 갱신 후 서버 응답으로 교체할 때, 음수로 내려가지 않게 막는다. (PRD §3.4) */
export function clampCount(value: number): number {
  return value < 0 ? 0 : value;
}
