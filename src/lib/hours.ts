import type { HospitalHours } from "@/features/hospitals/types";

/**
 * 진료시간과 내원(접수) 마감.
 *
 * 보호자에게 가장 중요한 숫자는 "진료 종료"가 아니라 "언제까지 도착해야 하는가"다.
 * 진료가 22시까지라도 처치를 받으려면 21시에는 도착해야 하는 경우가 많고,
 * 이 차이를 모른 채 출발하는 것이 CareTime 이 없애려는 헛걸음 그 자체다.
 * 그래서 내원 마감을 카드 1순위로, 진료 종료를 보조 정보로 표시한다.
 *
 * 핵심 원칙: 내원 마감 시각을 CareTime 이 임의로 계산해 확정처럼 보여주지 않는다.
 * "종료 1시간 전"은 병원 입력 화면의 제안값일 뿐이고, 병원이 확인·저장한 값만
 * 보호자에게 시각으로 표시된다. 확인값이 없으면 시각 대신 "의료기관 확인 필요"로 둔다.
 * 추정 마감을 믿고 갔다가 거절당하면 그 책임은 CareTime 이 지게 된다.
 */

export type AdmissionState =
  | "none" //    진료시간 정보 자체가 없음
  | "unknown" // 종료시각은 있으나 내원 마감 미확인
  | "ample" //   여유 있음
  | "hurry" //   서둘러야 함
  | "now" //     지금 출발해야 함
  | "toolate" // 지금 출발해도 마감 이후 도착
  | "closed"; // 이미 마감

export interface AdmissionWindow {
  state: AdmissionState;
  closeLabel: string | null;
  regularLabel: string | null;
  shortenedToday: boolean;
  admissionLabel: string | null;
  minutesLeft: number | null;
  note: string | null;
}

function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function getAdmissionWindow(
  hours: HospitalHours | null,
  travelMinutes: number,
  now: Date = new Date(),
): AdmissionWindow {
  if (!hours) {
    return {
      state: "none",
      closeLabel: null,
      regularLabel: null,
      shortenedToday: false,
      admissionLabel: null,
      minutesLeft: null,
      note: null,
    };
  }

  const closeAt = hours.todayCloseAt ?? hours.regularCloseAt;
  const base = {
    closeLabel: hhmm(closeAt),
    regularLabel: hhmm(hours.regularCloseAt),
    shortenedToday: hours.todayCloseAt !== null,
    note: hours.todayNote,
  };

  // 병원이 확인하지 않은 마감 시각은 만들어내지 않는다.
  if (!hours.lastAdmissionAt || !hours.admissionConfirmed) {
    return { ...base, state: "unknown", admissionLabel: null, minutesLeft: null };
  }

  const minutesLeft = Math.floor(
    (new Date(hours.lastAdmissionAt).getTime() - now.getTime()) / 60000,
  );
  const spare = minutesLeft - travelMinutes;

  const state: AdmissionState =
    minutesLeft <= 0 ? "closed"
    : spare <= 0 ? "toolate"
    : spare <= 15 ? "now"
    : spare <= 45 ? "hurry"
    : "ample";

  return { ...base, state, admissionLabel: hhmm(hours.lastAdmissionAt), minutesLeft };
}

/** 카드 맨 위에 들어갈 한 줄. 진료 종료보다 큰 글씨로 쓴다. */
export function admissionHeadline(
  w: AdmissionWindow,
  travelMinutes: number,
): { tone: "confirmed" | "caution" | "limited" | "unverified"; big: string; sub: string } {
  switch (w.state) {
    case "none":
      return { tone: "unverified", big: "진료시간 정보 없음", sub: "전화로 확인해 주세요" };
    case "unknown":
      return {
        tone: "unverified",
        big: `진료 종료 ${w.closeLabel}`,
        sub: "내원 마감 시각은 의료기관 확인이 필요합니다",
      };
    case "closed":
      return {
        tone: "limited",
        big: "오늘 내원 마감",
        sub: `내원 마감 ${w.admissionLabel} · 진료 종료 ${w.closeLabel}`,
      };
    case "toolate":
      return {
        tone: "limited",
        big: `내원 마감 ${w.admissionLabel}`,
        sub: `지금 출발해도 이동 ${travelMinutes}분이라 마감 이후 도착합니다`,
      };
    case "now":
      return {
        tone: "caution",
        big: `내원 마감까지 ${w.minutesLeft}분`,
        sub: `이동 ${travelMinutes}분 · 지금 출발해야 합니다`,
      };
    case "hurry":
      return {
        tone: "caution",
        big: `내원 마감까지 ${w.minutesLeft}분`,
        sub: `내원 마감 ${w.admissionLabel} · 이동 ${travelMinutes}분`,
      };
    case "ample":
      return {
        tone: "confirmed",
        big: `내원 마감 ${w.admissionLabel}`,
        sub: `남은 시간 ${w.minutesLeft}분 · 이동 ${travelMinutes}분`,
      };
  }
}

/** 병원 입력 화면의 제안값. 저장 전까지는 보호자에게 노출되지 않는다. */
export function suggestAdmissionAt(closeAtIso: string, leadMinutes = 60): string {
  return new Date(new Date(closeAtIso).getTime() - leadMinutes * 60000).toISOString();
}
