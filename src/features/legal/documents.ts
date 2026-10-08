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
 * **세 상태를 구분한다.**
 *   ① 본문이 없다        — 라우트가 "준비 중", 하단 링크 없음, policy_version null
 *   ② 본문 있고 시행 전   — 본문을 보여주되 "아직 효력이 없습니다", policy_version null
 *   ③ 시행일이 지났다     — 평소 화면, 동의 문구, policy_version 이 박힌다
 *
 * ②를 따로 두는 이유: 시행일을 미리 적어 공개하는 것(사전 고지)과 시행일을 아직
 * 정하지 않은 것 모두 정상이고, 그동안에도 본문은 읽을 수 있어야 한다. 그러나 효력이
 * 없는 문서에 "동의하는 것으로 봅니다"를 적으면 없는 동의를 기록하는 것이 된다.
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
  /** `# 제목` 줄에서 읽은 제목. 없으면 빈 문자열. */
  title: string;
  /** 시행일. 항상 `YYYY-MM-DD` 로 맞춰 둔다. 읽을 수 없으면 null. */
  effectiveDate: string | null;
  /** 머리글을 뺀 본문. */
  body: string;
  /**
   * 보여 줄 본문이 있는가.
   *
   * **시행일은 보지 않는다.** 시행일이 미정이어도 본문은 보여준다 — 교정하러 띄워
   * 읽어야 하고, 사전 고지도 정상이다. 효력이 있는지는 따로 본다
   * (features/legal/version.isPolicyInForce).
   */
  hasBody: boolean;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** `2026년 10월 8일` · `2026. 10. 8.` 처럼 사람이 쓰는 모양도 받는다. */
const KO_DATE = /^(\d{4})\D{1,2}\s*(\d{1,2})\D{1,2}\s*(\d{1,2})\D?$/;

/** 머리글을 찾을 범위. 이보다 아래의 `시행일:` 은 본문의 일부로 본다. */
const HEADER_SCAN_LINES = 10;

function normalizeDate(value: string): string | null {
  const text = value.trim();

  const iso = ISO_DATE.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const ko = KO_DATE.exec(text);
  if (!ko) return null;

  const month = ko[2].padStart(2, "0");
  const day = ko[3].padStart(2, "0");
  if (Number(month) < 1 || Number(month) > 12) return null;
  if (Number(day) < 1 || Number(day) > 31) return null;
  return `${ko[1]}-${month}-${day}`;
}

/**
 * 파일 내용을 문서로 읽는다. 순수 함수다 — 파일을 읽는 일과 해석하는 일을 나눠 둔다.
 *
 * 머리글을 **찾아서** 읽는다. 줄 번호를 고정하지 않는 이유: 본문을 쓰는 사람이
 * 개발자가 아니고, 제목과 시행일 사이에 빈 줄을 두는 것이 자연스럽다. 사람에게
 * 모양을 맞추게 하는 대신 여기서 찾는다. 날짜도 `2026년 10월 8일` 로 쓸 수 있고,
 * 안에서는 `YYYY-MM-DD` 로 바꿔 둔다 — policy_version 과 날짜 비교가 그 모양을 쓴다.
 *
 * 머리글이 틀렸을 때 던지지 않는다. 방침 파일 하나의 오타로 서비스가 멈추면 안 된다.
 * 대신 `ready: false` 가 되고, 그러면 화면은 "준비 중"을 말한다.
 */
export function parseLegalDocument(id: LegalDocId, raw: string): LegalDocument {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const head = lines.slice(0, HEADER_SCAN_LINES);

  const titleIndex = head.findIndex((line) => line.trim().startsWith("# "));
  const title = titleIndex >= 0 ? head[titleIndex].trim().slice(2).trim() : "";

  const dateIndex = head.findIndex((line) => line.trim().startsWith("시행일"));
  const effectiveDate =
    dateIndex >= 0 ? normalizeDate(head[dateIndex].trim().replace(/^시행일\s*[:：]?/, "")) : null;

  /*
   * 본문은 머리글 **아래**부터다. 제목과 시행일 중 늦게 나온 줄 다음이고, 바로 뒤에
   * 붙은 빈 줄과 구분선은 뗀다 — 제목 바로 아래 가로줄은 읽는 데 보탬이 없다.
   */
  const bodyStart = Math.max(titleIndex, dateIndex) + 1;
  const bodyLines = lines.slice(bodyStart < 1 ? 0 : bodyStart);
  while (
    bodyLines.length > 0 &&
    (bodyLines[0].trim() === "" || /^-{3,}$/.test(bodyLines[0].trim()))
  ) {
    bodyLines.shift();
  }

  // 사업자 정보는 값을 본문에 쓰지 않고 토큰으로 쓴다. 여기서 한 번만 바꾼다.
  const body = applyCompanyTokens(bodyLines.join("\n").trim());
  const hasBody = !body.includes(PENDING_MARK) && body !== "";

  return { id, title, effectiveDate, body: body.replace(PENDING_MARK, "").trim(), hasBody };
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
    return { id, title: "", effectiveDate: null, body: "", hasBody: false };
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
