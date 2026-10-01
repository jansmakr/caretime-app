import { loadLegalDocument, type LegalDocId } from "./documents";

/**
 * `guest_sessions.policy_version` 에 들어갈 값.
 *
 * ── 형식 ────────────────────────────────────────────────────
 *     terms=2026-10-15;privacy=2026-10-15
 *
 * 왜 날짜 두 개인가:
 *   · 두 문서는 따로 바뀐다. 방침만 고치는 일이 약관까지 고치는 일보다 잦다.
 *     한 번호(v1, v2)로 묶으면 "이 사람이 어느 방침에 동의했나"를 답할 수 없다.
 *   · 날짜는 **시행일**이다. 동의한 시각이 아니다 — 그건 created_at 이 이미 안다.
 *     같은 값을 두 번 저장하지 않는다.
 *   · 사람이 읽을 수 있다. 콘솔에서 이 값을 보고 바로 어느 문서인지 안다.
 *     숫자 번호였다면 번호와 문서를 잇는 표를 또 들고 있어야 한다.
 *
 * 길이는 40자 안쪽이고 text 컬럼이라 제한이 없다.
 *
 * ── 지금은 null 이다 ────────────────────────────────────────
 * 두 문서 중 하나라도 준비되지 않으면 null 을 쓴다. 동의할 문서가 없는데
 * "동의한 버전"을 적으면 그건 없는 동의를 기록하는 것이다.
 */

export function formatPolicyVersion(
  termsDate: string | null,
  privacyDate: string | null,
): string | null {
  if (termsDate === null || privacyDate === null) return null;
  return `terms=${termsDate};privacy=${privacyDate}`;
}

export function parsePolicyVersion(
  value: string | null,
): { terms: string; privacy: string } | null {
  if (!value) return null;
  const match = /^terms=(\d{4}-\d{2}-\d{2});privacy=(\d{4}-\d{2}-\d{2})$/.exec(value.trim());
  return match ? { terms: match[1], privacy: match[2] } : null;
}

/**
 * 지금 시행 중인 버전. **서버에서만 부른다**(파일을 읽는다).
 * 문서가 준비되지 않았으면 null 이고, 세션에도 null 이 들어간다.
 */
export function currentPolicyVersion(): string | null {
  const dateOf = (id: LegalDocId) => {
    const doc = loadLegalDocument(id);
    return doc.ready ? doc.effectiveDate : null;
  };
  return formatPolicyVersion(dateOf("terms"), dateOf("privacy"));
}

/** 두 문서가 다 준비됐는가. 하단 동의 문구·링크를 낼지 판단하는 값이다. */
export function areLegalDocsReady(): boolean {
  return currentPolicyVersion() !== null;
}
