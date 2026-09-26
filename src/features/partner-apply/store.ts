import { normalizeApplication } from "./service";
import type { PartnerApplication, PartnerApplicationDraft } from "./types";

/**
 * 입점 신청 보관소 (브라우저 메모리).
 *
 * 신청을 받는 테이블은 아직 없다. 계정 발급이 운영자 수동 작업이라
 * (README 2단계: Allow new users to sign up 을 끈다) 자동 접수 경로를 먼저 만들면
 * 아무도 보지 않는 곳에 신청서가 쌓인다.
 *
 * 그래서 지금은 화면이 "무엇이 접수되었는지"를 되돌려 보여주고, 실제 전달은
 * 운영 연락처로 안내한다. 테이블이 생기면 submitApplication 안쪽만 바뀐다.
 *
 * 담당자명·연락처가 들어오므로 로그로 내보내지 않는다. 메모리에만 둔다.
 */

let submitted: PartnerApplication[] = [];
let sequence = 0;

export function submitApplication(
  draft: PartnerApplicationDraft,
  now: Date = new Date(),
): PartnerApplication {
  const application: PartnerApplication = {
    ...normalizeApplication(draft),
    id: `pa_${now.getTime().toString(36)}_${(sequence += 1).toString(36)}`,
    submittedAt: now.toISOString(),
  };
  submitted = [application, ...submitted];
  return application;
}

export function getApplications(): PartnerApplication[] {
  return submitted;
}

/** 테스트용. 화면에서는 쓰지 않는다. */
export function resetApplications(): void {
  submitted = [];
}
