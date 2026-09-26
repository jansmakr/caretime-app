import { minutesSince } from "@/lib/freshness";
import { normalizeName } from "./directory";
import { isTemplateUnfilled } from "./templates";
import {
  REPORT_BODY_MAX,
  REPORT_TOPIC_MAX,
  REPORT_WAITING_MAX,
  type ReportDraft,
  type UserReport,
} from "./types";

/**
 * 제보 규칙. 순수 함수만 둔다 — 6단계에서 서버 액션으로 그대로 옮긴다.
 * 여기서 병원 상태를 고치는 함수는 만들지 않는다. (README CI lint 룰 1번)
 */

/** '방금 전' / '10분 전'. 피드는 초 단위를 쓰지 않는다 — 1분 미만은 모두 '방금 전'이다. */
export function formatReportAgo(createdAt: string, now: Date = new Date()): string {
  const minutes = minutesSince(createdAt, now);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

/** 등록 버튼을 열어 줄지 판정한다. 막는 이유가 있으면 문장으로 돌려준다. */
export function validateDraft(draft: ReportDraft): { ok: true } | { ok: false; reason: string } {
  if (draft.target.hospitalName.trim() === "") {
    return { ok: false, reason: "제보할 의료기관을 먼저 지정해 주세요." };
  }
  if (draft.category === "other" && (draft.topic ?? "").trim() === "") {
    return { ok: false, reason: "증상이나 주제를 입력해 주세요." };
  }
  if (draft.body.trim() === "") {
    return { ok: false, reason: "현장에서 확인한 내용을 적어 주세요." };
  }
  if (isTemplateUnfilled(draft.body, draft.category)) {
    return { ok: false, reason: "확인한 항목을 한 줄이라도 채워 주세요." };
  }
  return { ok: true };
}

/** 저장 직전 정리. 길이 제한은 화면(maxLength)과 여기 두 곳에서 모두 막는다. */
export function normalizeDraft(draft: ReportDraft): ReportDraft {
  const waiting =
    draft.waitingHeadcount === null
      ? null
      : Math.min(REPORT_WAITING_MAX, Math.max(0, Math.trunc(draft.waitingHeadcount)));
  return {
    ...draft,
    target: { ...draft.target, hospitalName: draft.target.hospitalName.trim() },
    topic: draft.category === "other" ? (draft.topic ?? "").trim().slice(0, REPORT_TOPIC_MAX) : null,
    body: draft.body.trim().slice(0, REPORT_BODY_MAX),
    waitingHeadcount: waiting,
  };
}

/**
 * 이 병원의 제보만 고른다.
 * 수기 입력 제보는 이름이 정확히 같을 때만 붙인다. 비슷한 이름을 같은 병원으로 묶지 않는다.
 */
export function reportsForHospital(
  reports: UserReport[],
  hospital: { id: string; name: string },
): UserReport[] {
  const key = normalizeName(hospital.name);
  return reports.filter((r) =>
    r.target.kind === "listed"
      ? r.target.hospitalId === hospital.id
      : normalizeName(r.target.hospitalName) === key,
  );
}

export function byNewestFirst(a: UserReport, b: UserReport): number {
  return Date.parse(b.createdAt) - Date.parse(a.createdAt);
}
