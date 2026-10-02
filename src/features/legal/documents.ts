import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyCompanyTokens } from "./company";

/**
 * 약관 · 개인정보 처리방침.
 *
 * 본문은 `docs/legal/*.md` 에 있고 라우트가 그것을 그대로 읽는다. 코드에 넣지 않는
 * 이유: 법무 문구는 개발자가 아닌 사람이 고치고, 고칠 때마다 소스 파일을 손대야 하면
 * "일단 코드에 적어 두고 나중에"가 된다.
 *
 * 본문의 사업자 정보는 토큰으로 적는다(`{{상호}}` 등). 값은 features/legal/company
 * 한 곳에 있고 푸터도 같은 값을 읽는다 — 두 군데에 적으면 갈라진다.
 *
 * **준비되지 않은 상태를 구분한다.** 시행일이 `미정` 이거나 본문대기 표시가 남아
 * 있으면 준비되지 않은 것으로 보고, 하단 동의 문구와 링크를 아예 내린다 —
 * 빈 방침으로 가는 링크를 만들지 않는다. 동의했다고 적지도 않는다.
 */

export type LegalDocId = "terms" | "privacy";

export const LEGAL_DOC_IDS: readonly LegalDocId[] = ["terms", "privacy"];

export const LEGAL_DOC_FILE: Record<LegalDocId, string> = {
  terms: "terms.md",
  privacy: "privacy.md",
};

export const LEGAL_DOC_PATH: Record<LegalDocId, string> = {
  terms: "/terms",
  privacy: "/privacy",
};

/** 본문을 아직 받지 못했다는 표시. 이 줄이 있으면 준비되지 않은 것이다. */
const PENDING_MARK = "<!-- 본문대기 -->";

export interface LegalDocument {
  id: LegalDocId;
  /** 첫 줄의 `# 제목`. 없으면 빈 문자열. */
  title: string;
  /** `시행일: YYYY-MM-DD`. `미정` 이거나 형식이 다르면 null. */
  effectiveDate: string | null;
  /** 머리글 두 줄을 뺀 본문. */
  body: string;
  /** 보여 줄 수 있는 문서인가. 시행일이 있고 본문대기 표시가 없어야 한다. */
  ready: boolean;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 파일 내용을 문서로 읽는다. 순수 함수다 — 파일을 읽는 일과 해석하는 일을 나눠 둔다.
 * 머리글이 틀렸을 때 던지지 않는다. 방침 파일 하나의 오타로 서비스가 멈추면 안 된다.
 * 대신 `ready: false` 가 되고, 그러면 화면은 "준비 중"을 말한다.
 */
export function parseLegalDocument(id: LegalDocId, raw: string): LegalDocument {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");

  const titleLine = lines[0] ?? "";
  const title = titleLine.startsWith("# ") ? titleLine.slice(2).trim() : "";

  const dateLine = (lines[1] ?? "").trim();
  const dateValue = dateLine.startsWith("시행일:") ? dateLine.slice("시행일:".length).trim() : "";
  const effectiveDate = DATE.test(dateValue) ? dateValue : null;

  // 사업자 정보는 값을 본문에 쓰지 않고 토큰으로 쓴다. 여기서 한 번만 바꾼다.
  const body = applyCompanyTokens(lines.slice(2).join("\n").trim());
  const ready = effectiveDate !== null && !body.includes(PENDING_MARK) && body !== "";

  return { id, title, effectiveDate, body: body.replace(PENDING_MARK, "").trim(), ready };
}

/**
 * 파일에서 읽는다. **서버에서만 부른다.**
 *
 * 없거나 읽을 수 없으면 빈 문서로 돌려준다(ready: false). 배포에 파일이 빠져도
 * 화면이 터지지 않게 — 그때 보여야 하는 것은 500 이 아니라 "준비 중"이다.
 * 배포에 파일을 포함시키는 설정은 next.config.mjs 의 outputFileTracingIncludes 다.
 */
export function loadLegalDocument(id: LegalDocId): LegalDocument {
  try {
    return parseLegalDocument(id, readLegalSource(id));
  } catch {
    return { id, title: "", effectiveDate: null, body: "", ready: false };
  }
}

/**
 * 파일 원문. **토큰을 바꾸지 않은 상태**다.
 *
 * `loadLegalDocument` 는 사업자 정보 토큰을 값으로 바꿔서 돌려주므로, "본문에 값이
 * 직접 적혀 있는가"를 그 결과로는 알 수 없다 — 바뀐 값과 직접 적은 값이 같아 보인다.
 * 그래서 원문을 읽는 길을 따로 둔다. 테스트가 쓴다.
 */
export function readLegalSource(id: LegalDocId): string {
  return readFileSync(join(process.cwd(), "docs", "legal", LEGAL_DOC_FILE[id]), "utf8");
}
