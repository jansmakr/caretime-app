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
 * ── 언제 null 인가 ──────────────────────────────────────────
 * 두 가지 경우다.
 *   ① 두 문서 중 하나라도 본문이 없다 — 동의할 문서가 없다.
 *   ② 시행일이 **아직 오지 않았다** — 문서는 있지만 시행 전이다.
 *
 * ②를 따로 두는 이유: 시행일을 미리 적어 공개하는 것은 정상이다(사전 고지).
 * 그 기간에 세션을 만들면서 "미래 날짜의 방침에 동의했다"고 적으면, 그것은
 * null 보다 나쁘다 — 없는 동의를 **있는 것처럼** 기록하는 것이다.
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
 * 오늘(서울 기준) 날짜. `YYYY-MM-DD` 라 문자열 비교로 날짜를 견줄 수 있다.
 *
 * 시행일은 달력 날짜다. 서버가 UTC 로 돌면 한국 시간 9시간 동안 "어제"로 판정하므로
 * 시간대를 고정해서 읽는다 — 시행일이 하루 늦게 켜지는 것을 막는다.
 */
export function todayInSeoul(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function readyDateOf(id: LegalDocId): string | null {
  const doc = loadLegalDocument(id);
  return doc.hasBody ? doc.effectiveDate : null;
}

/**
 * 지금 시행 중인 버전. **서버에서만 부른다**(파일을 읽는다).
 * 본문이 없거나 시행일이 아직 오지 않았으면 null 이고, 세션에도 null 이 들어간다.
 */
export function currentPolicyVersion(now: Date = new Date()): string | null {
  const version = formatPolicyVersion(readyDateOf("terms"), readyDateOf("privacy"));
  if (version === null) return null;

  const today = todayInSeoul(now);
  const parsed = parsePolicyVersion(version);
  if (!parsed) return null;
  // 둘 중 늦은 시행일이 와야 '두 문서가 함께 시행 중'이다.
  const inForceFrom = parsed.terms > parsed.privacy ? parsed.terms : parsed.privacy;
  return today >= inForceFrom ? version : null;
}

/**
 * 두 문서를 보여 줄 수 있는가 — **본문이 있는가**만 본다. 시행일은 보지 않는다.
 *
 * 시행일이 미정이거나 아직 오지 않아도 문서는 **보여 준다.** 미리 읽을 수 있어야
 * 하고, 교정도 실제 화면에서 한다. 다만 "동의하는 것으로 봅니다"는 시행 뒤에만
 * 적는다(isPolicyInForce).
 */
export function areLegalDocsReadable(): boolean {
  return loadLegalDocument("terms").hasBody && loadLegalDocument("privacy").hasBody;
}

/** 지금 효력이 있는가. 동의 문구를 적을지, policy_version 을 박을지의 판정이다. */
export function isPolicyInForce(now: Date = new Date()): boolean {
  return currentPolicyVersion(now) !== null;
}
