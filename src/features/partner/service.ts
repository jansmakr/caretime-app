import type {
  ContactStatusCode,
  HospitalHours,
  HospitalLiveStatus,
  IncomingAggregate,
  LimitReasonCode,
} from "@/features/hospitals/types";
import { labelForBodyPart, labelForSituation } from "@/features/search-session/types";
import { formatClock, isExpired } from "@/lib/freshness";
import { addDays, kstDateTime, kstParts, kstServiceDate } from "@/lib/kst";
import type {
  HoursSaveError,
  IncomingVisit,
  PartnerState,
  TodayMode,
} from "./types";

/**
 * /partner 입력 규칙. 전부 순수 함수다 — (state, now) → state.
 * 2단계에서 저장소가 Supabase 로 바뀌어도 이 규칙은 그대로 서버 액션 안으로 옮겨간다.
 */

/** 진료 종료가 이미 지났을 때 상태를 유지하는 최소 시간. */
export const MIN_STATUS_TTL_MINUTES = 60;

/**
 * 도착 예정 시각이 지난 뒤에도 "곧 도착"으로 집계하는 시간.
 * 이 시간이 지나도록 도착 확인이 없으면 집계에서 뺀다. 숫자가 계속 부풀지 않게 하려는 것.
 */
export const INCOMING_OVERDUE_GRACE_MINUTES = 30;

const MINUTE = 60_000;

/**
 * 병원이 입력한 오늘 상태는 오늘 진료 종료까지만 유효하다.
 * 종료가 이미 지났으면 최소 TTL 만 준다. 다음 날로 넘어가지 않게 한다.
 */
export function statusExpiresAt(hours: HospitalHours, now: Date): string {
  const closeAt = new Date(hours.todayCloseAt ?? hours.regularCloseAt).getTime();
  const floor = now.getTime() + MIN_STATUS_TTL_MINUTES * MINUTE;
  return new Date(Math.max(closeAt, floor)).toISOString();
}

/**
 * "HH:MM" → 오늘 진료일 기준 ISO.
 * 진료 시작보다 이른 시각은 자정을 넘긴 다음 날로 본다. (야간 진료 00:30 종료 등)
 */
export function clockToIso(clock: string, regularOpenAt: string): string | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(clock);
  if (!m) return null;
  const open = new Date(regularOpenAt);
  const { date } = kstParts(open);
  let d = kstDateTime(date, clock);
  if (d.getTime() < open.getTime()) d = kstDateTime(addDays(date, 1), clock);
  return d.toISOString();
}

/**
 * 저장된 상태에서 원탭 토글 표시를 복원한다. (DB 에는 버튼이 아니라 상태만 저장된다)
 * 오늘 진료일에 확인되지 않았거나 만료됐으면 아무 버튼도 켜지 않는다.
 * "정상"은 원탭 토글에서 "어제와 동일"로만 만들 수 있으므로 그 버튼으로 표시한다.
 */
export function deriveTodayMode(live: HospitalLiveStatus, now: Date): TodayMode | null {
  const confirmedToday = kstServiceDate(new Date(live.verifiedAt)) === kstServiceDate(now);
  if (!confirmedToday || isExpired(live, now)) return null;
  if (live.status === "partial") return "limited";
  if (live.status === "difficult" || live.status === "paused") return "difficult";
  return "same_as_yesterday";
}

/** 어제 값을 그대로 쓰고 확인시각만 갱신한다. */
export function confirmSameAsYesterday(state: PartnerState, now: Date): PartnerState {
  const verifiedAt = now.toISOString();
  const y = state.yesterday;
  const lastAdmissionAt = y.lastAdmissionClock
    ? clockToIso(y.lastAdmissionClock, state.hours.regularOpenAt)
    : null;

  const hours: HospitalHours = {
    ...state.hours,
    todayCloseAt: null, // "오늘만" 값은 어제에서 이어받지 않는다.
    lastAdmissionAt,
    admissionConfirmed: lastAdmissionAt !== null,
    todayNote: null,
    verifiedBy: "hospital",
    verifiedAt,
  };

  return {
    ...state,
    mode: "same_as_yesterday",
    hours,
    liveStatus: {
      ...state.liveStatus,
      capabilityId: null,
      status: y.status,
      reasonCode: y.reasonCode,
      customReason: y.customReason,
      detailText: y.detailText,
      startsAt: null,
      expectedResumeAt: null,
      recheckAt: null,
      verifiedBy: "hospital",
      verifiedAt,
      expiresAt: statusExpiresAt(hours, now),
    },
  };
}

export function setTodayMode(
  state: PartnerState,
  mode: Exclude<TodayMode, "same_as_yesterday">,
  now: Date,
): PartnerState {
  const verifiedAt = now.toISOString();
  return {
    ...state,
    mode,
    liveStatus: {
      ...state.liveStatus,
      capabilityId: null,
      status: mode === "limited" ? "partial" : "difficult",
      // 사유는 새로 고른다. 이전 사유가 새 상태에 딸려가면 사실과 다른 문구가 된다.
      reasonCode: null,
      customReason: null,
      detailText: null,
      startsAt: verifiedAt,
      expectedResumeAt: null,
      recheckAt: null,
      verifiedBy: "hospital",
      verifiedAt,
      expiresAt: statusExpiresAt(state.hours, now),
    },
  };
}

export function setLimitReason(
  state: PartnerState,
  reasonCode: LimitReasonCode | null,
  now: Date,
): PartnerState {
  return {
    ...state,
    liveStatus: { ...state.liveStatus, reasonCode, verifiedAt: now.toISOString() },
  };
}

/**
 * 오늘 진료시간 저장. 저장하는 순간 내원 마감이 "병원 확인값"이 된다.
 * 제안값(종료 1시간 전)은 화면에만 있고, 저장 전까지는 보호자에게 노출되지 않는다. → lib/hours.ts
 */
export function saveTodayHours(
  state: PartnerState,
  input: { closeClock: string; admissionClock: string | null },
  now: Date,
): { state: PartnerState; error: null } | { state: null; error: HoursSaveError } {
  const { regularOpenAt, regularCloseAt } = state.hours;
  const closeAt = clockToIso(input.closeClock, regularOpenAt);
  const admissionAt = input.admissionClock
    ? clockToIso(input.admissionClock, regularOpenAt)
    : null;

  if (!closeAt || (input.admissionClock && !admissionAt)) {
    return { state: null, error: "invalid_clock" };
  }
  if (admissionAt && new Date(admissionAt).getTime() > new Date(closeAt).getTime()) {
    return { state: null, error: "admission_after_close" };
  }

  const hours: HospitalHours = {
    ...state.hours,
    todayCloseAt: input.closeClock === formatClock(regularCloseAt) ? null : closeAt,
    lastAdmissionAt: admissionAt,
    admissionConfirmed: admissionAt !== null,
    verifiedBy: "hospital",
    verifiedAt: now.toISOString(),
  };

  return {
    state: {
      ...state,
      hours,
      // 종료시각이 바뀌면 오늘 상태의 유효시간도 같이 따라간다.
      liveStatus: { ...state.liveStatus, expiresAt: statusExpiresAt(hours, now) },
    },
    error: null,
  };
}

export function setContactStatus(
  state: PartnerState,
  status: ContactStatusCode,
  now: Date,
): PartnerState {
  return {
    ...state,
    contact: { ...state.contact, status, customNote: null, verifiedAt: now.toISOString() },
  };
}

export const WAITING_MAX = 99;

export function setWaitingHeadcount(
  state: PartnerState,
  headcount: number,
  now: Date,
): PartnerState {
  const clamped = Math.min(WAITING_MAX, Math.max(0, Math.round(headcount)));
  return {
    ...state,
    waiting: { ...state.waiting, headcount: clamped, verifiedAt: now.toISOString() },
  };
}

// ─── 내원예정 ────────────────────────────────────────────────

export function minutesUntil(iso: string, now: Date): number {
  return Math.round((new Date(iso).getTime() - now.getTime()) / MINUTE);
}

/** 집계 대상: 이동 중이고, 예정시각이 유예시간 이상 지나지 않은 건. */
export function isCountable(visit: IncomingVisit, now: Date): boolean {
  return (
    visit.state === "on_the_way" &&
    minutesUntil(visit.etaAt, now) >= -INCOMING_OVERDUE_GRACE_MINUTES
  );
}

/**
 * 내원예정 집계. 10/30/60 은 누적 구간이다(30분 이내에 10분 이내가 포함).
 * 병원 화면은 이 숫자를 그대로 쓴다. 보호자 화면은 hospitals/service 의 임계값 규칙을 거친다.
 * 결과는 IncomingAggregate 로만 나가며, 현재 대기 인원과 더하는 함수는 만들지 않는다.
 */
export function aggregateIncoming(
  hospitalId: string,
  visits: IncomingVisit[],
  now: Date,
): IncomingAggregate {
  const agg: IncomingAggregate = { hospitalId, within10: 0, within30: 0, within60: 0 };
  for (const v of visits) {
    if (!isCountable(v, now)) continue;
    const m = minutesUntil(v.etaAt, now);
    if (m <= 10) agg.within10 += 1;
    if (m <= 30) agg.within30 += 1;
    if (m <= 60) agg.within60 += 1;
  }
  return agg;
}

export type VisitTone = "confirmed" | "caution" | "limited" | "unverified";

export function describeVisit(
  visit: IncomingVisit,
  now: Date,
): { tone: VisitTone; badge: string; eta: string } {
  const m = minutesUntil(visit.etaAt, now);
  const clock = formatClock(visit.etaAt);

  if (visit.state === "cancelled") {
    return { tone: "unverified", badge: "공유 취소", eta: `${clock} 도착 예정이었음` };
  }
  if (visit.state === "arrived") {
    return { tone: "confirmed", badge: "도착 확인", eta: `${clock} 도착 예정` };
  }
  if (m < -INCOMING_OVERDUE_GRACE_MINUTES) {
    return { tone: "unverified", badge: "집계 제외", eta: `${clock} 예정 · ${-m}분 지남` };
  }
  if (m < 0) {
    return { tone: "caution", badge: "예정시각 지남", eta: `${clock} 예정 · ${-m}분 지남` };
  }
  if (m <= 10) {
    return { tone: "caution", badge: "곧 도착", eta: `${clock} 도착 예정 · ${m}분 후` };
  }
  return { tone: "unverified", badge: "이동 중", eta: `${clock} 도착 예정 · ${m}분 후` };
}

const HEMOSTASIS_TEXT = { stopped: "지혈됨", bleeding: "출혈 계속" } as const;

/** 보호자가 입력한 사실만 나열한다. 없는 값은 "미입력"으로 두고 추측하지 않는다. */
export function summarizeVisit(visit: IncomingVisit): string {
  const f = visit.facts;
  return [
    f.ageYears !== null ? `만 ${f.ageYears}세` : "나이 미입력",
    labelForBodyPart(f.bodyPartId) ?? "부위 미입력",
    labelForSituation(f.situationId) ?? "상황 미입력",
    f.hemostasis ? HEMOSTASIS_TEXT[f.hemostasis] : "지혈여부 미입력",
  ].join(" · ");
}

/** 목록 순서: 집계 중인 건을 도착 예정 순으로 먼저, 나머지는 뒤로. */
export function sortVisits(visits: IncomingVisit[], now: Date): IncomingVisit[] {
  return [...visits].sort((a, b) => {
    const ca = isCountable(a, now);
    const cb = isCountable(b, now);
    if (ca !== cb) return ca ? -1 : 1;
    return new Date(a.etaAt).getTime() - new Date(b.etaAt).getTime();
  });
}
