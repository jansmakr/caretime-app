import { normalizeDraft } from "./service";
import type { ReportDraft, UserReport } from "./types";

/**
 * 등록된 제보 보관소 (브라우저 메모리).
 *
 * 6단계(Realtime Feed)에서 Supabase 테이블 + 구독으로 바뀔 자리다. 그래서 지금도
 * 구독 가능한 모양(subscribe/getSnapshot)으로 두었다 — 화면 코드를 고치지 않고 backend 만 갈아낀다.
 * 지금은 새로고침하면 사라진다. 그 사실을 피드가 문장으로 알린다.
 *
 * 서버 스냅샷은 항상 빈 배열이다. 서버에는 제보가 없으므로 hydration 이 어긋날 일이 없다.
 */

let submitted: UserReport[] = [];
const EMPTY: UserReport[] = [];
const listeners = new Set<() => void>();
let sequence = 0;

export function subscribeReports(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** useSyncExternalStore 용. 변경이 없으면 같은 배열 참조를 유지한다. */
export function getSubmittedReports(): UserReport[] {
  return submitted;
}

export function getSubmittedReportsOnServer(): UserReport[] {
  return EMPTY;
}

export function submitReport(draft: ReportDraft, now: Date = new Date()): UserReport {
  const report: UserReport = {
    ...normalizeDraft(draft),
    id: `ur_${now.getTime().toString(36)}_${(sequence += 1).toString(36)}`,
    // 출처는 인자로 받지 않는다. 사용자 공유 제보가 다른 출처로 올라갈 길을 만들지 않는다.
    source: "user",
    createdAt: now.toISOString(),
  };
  submitted = [report, ...submitted];
  for (const listener of listeners) listener();
  return report;
}

/** 테스트·데모 초기화용. 화면에서는 쓰지 않는다. */
export function resetReports(): void {
  submitted = EMPTY;
  for (const listener of listeners) listener();
}
