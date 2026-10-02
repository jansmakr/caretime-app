import { describe, expect, it } from "vitest";
import { COMPANY, applyCompanyTokens, unknownTokens } from "./company";
import { loadLegalDocument, parseLegalDocument } from "./documents";
import { currentPolicyVersion, formatPolicyVersion, parsePolicyVersion } from "./version";

/**
 * 방침 문서를 읽는 규칙.
 *
 * 여기서 고정하려는 것은 하나다 — **준비되지 않은 문서를 방침으로 보여 주지 않는다.**
 * 빈 문서가 "개인정보 처리방침"이라는 제목으로 나가면 읽은 사람은 그게 전부라고 믿는다.
 */

const READY = `# 개인정보 처리방침
시행일: 2026-10-15

## 수집하는 항목

글 본문과 별명만 저장합니다.

- 이름을 저장하지 않습니다
- 연락처를 저장하지 않습니다
`;

describe("문서 읽기", () => {
  it("머리글 두 줄에서 제목과 시행일을 읽는다", () => {
    const doc = parseLegalDocument("privacy", READY);
    expect(doc.title).toBe("개인정보 처리방침");
    expect(doc.effectiveDate).toBe("2026-10-15");
    expect(doc.ready).toBe(true);
    // 머리글은 본문에서 빠진다. 제목이 두 번 나오면 안 된다.
    expect(doc.body.startsWith("## 수집하는 항목")).toBe(true);
  });

  it("★ 시행일이 미정이면 준비되지 않은 것으로 본다", () => {
    const doc = parseLegalDocument("terms", "# 이용약관\n시행일: 미정\n\n내용이 조금 있어도.");
    expect(doc.effectiveDate).toBeNull();
    expect(doc.ready).toBe(false);
  });

  it("★ 본문대기 표시가 남아 있으면 시행일이 있어도 준비되지 않은 것으로 본다", () => {
    const doc = parseLegalDocument(
      "terms",
      "# 이용약관\n시행일: 2026-10-15\n\n<!-- 본문대기 -->\n\n아직 안 받았습니다.",
    );
    expect(doc.ready).toBe(false);
  });

  it("★ 본문이 비어 있으면 준비되지 않은 것으로 본다", () => {
    expect(parseLegalDocument("terms", "# 이용약관\n시행일: 2026-10-15\n\n").ready).toBe(false);
  });

  it("머리글이 틀려도 던지지 않는다 — 파일 오타로 서비스가 멈추면 안 된다", () => {
    const doc = parseLegalDocument("terms", "이용약관\n시행일 2026-10-15\n본문");
    expect(doc.title).toBe("");
    expect(doc.effectiveDate).toBeNull();
    expect(doc.ready).toBe(false);
  });

  /*
   * 전에는 "두 파일은 아직 준비되지 않았다(false)"를 고정해 두고, 본문을 받으면
   * 손으로 true 로 바꾸게 했다. 그 방식을 버렸다 — 기대값을 손으로 뒤집는 테스트는
   * 본문이 들어온 날 **고치는 사람이 무엇을 확인해야 하는지**를 알려 주지 않는다.
   * 지금은 상태가 아니라 **규칙**을 고정한다. 본문이 없을 때도, 들어온 뒤에도 그대로
   * 통과하고, 어긋난 조합에서만 깨진다.
   */
  it("★ 두 문서는 함께 준비된다 — 한쪽만 켜지지 않는다", () => {
    const terms = loadLegalDocument("terms");
    const privacy = loadLegalDocument("privacy");

    /*
     * 하나만 준비되면 하단 링크가 한쪽만 가리키거나, 동의 문구가 없는 문서를
     * 가리킨다. policy_version 도 그 경우 null 이라 "동의한 버전"을 잃는다.
     */
    expect(terms.ready).toBe(privacy.ready);
  });

  it("★ 준비됐다면 policy_version 이 만들어지고 되읽힌다", () => {
    const version = currentPolicyVersion();
    const ready = loadLegalDocument("terms").ready && loadLegalDocument("privacy").ready;

    expect(version !== null).toBe(ready);
    if (version !== null) {
      // 콘솔에서 본 값으로 어느 문서인지 알 수 있어야 한다.
      expect(parsePolicyVersion(version)).not.toBeNull();
    }
  });

  it("★ 본문에 바꾸지 못한 토큰이 없다 — 오타 하나가 공개된다", () => {
    for (const id of ["terms", "privacy"] as const) {
      const doc = loadLegalDocument(id);
      /*
       * 사업자 정보는 토큰으로 적는다(features/legal/company). 토큰 이름을 틀리면
       * 화면에 `{{상호}}` 가 그대로 나간다. 조용히 빈칸으로 만들지 않는 대신
       * 여기서 잡는다.
       */
      expect(unknownTokens(doc.body), `${id}: 모르는 토큰`).toEqual([]);
    }
  });
});

describe("사업자 정보 — 한 곳에서만 적는다", () => {
  it("★ 문서 본문의 토큰이 같은 값으로 바뀐다", () => {
    const filled = applyCompanyTokens(
      "상호 {{상호}} / 대표 {{대표자}} / 번호 {{사업자등록번호}} / " +
        "주소 {{주소}} / 책임자 {{보호책임자}} / 메일 {{이메일}}",
    );
    expect(filled).toBe(
      `상호 ${COMPANY.name} / 대표 ${COMPANY.ceo} / 번호 ${COMPANY.registrationNumber} / ` +
        `주소 ${COMPANY.address} / 책임자 ${COMPANY.privacyOfficer} / 메일 ${COMPANY.email}`,
    );
  });

  it("모르는 토큰은 바꾸지 않고 그대로 남긴다 — 빈칸이 되면 안 보인다", () => {
    const text = "담당 {{담당자}}";
    expect(applyCompanyTokens(text)).toBe(text);
    expect(unknownTokens(text)).toEqual(["{{담당자}}"]);
  });

  it("값이 비어 있지 않다", () => {
    for (const [key, value] of Object.entries(COMPANY)) {
      expect(value.trim().length, key).toBeGreaterThan(1);
    }
  });

  it("★ 이메일 모양이고, 그 값이 토큰 표와 같다", () => {
    expect(COMPANY.email).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i);
    expect(applyCompanyTokens("{{이메일}}")).toBe(COMPANY.email);
  });
});

describe("policy_version", () => {
  it("두 문서의 시행일을 함께 적는다", () => {
    expect(formatPolicyVersion("2026-10-15", "2026-11-01")).toBe(
      "terms=2026-10-15;privacy=2026-11-01",
    );
  });

  it("★ 하나라도 준비되지 않으면 null — 없는 동의를 기록하지 않는다", () => {
    expect(formatPolicyVersion(null, "2026-11-01")).toBeNull();
    expect(formatPolicyVersion("2026-10-15", null)).toBeNull();
    expect(formatPolicyVersion(null, null)).toBeNull();
  });

  it("되읽을 수 있다. 콘솔에서 본 값으로 어느 문서인지 안다", () => {
    expect(parsePolicyVersion("terms=2026-10-15;privacy=2026-11-01")).toEqual({
      terms: "2026-10-15",
      privacy: "2026-11-01",
    });
    expect(parsePolicyVersion("v1")).toBeNull();
    expect(parsePolicyVersion(null)).toBeNull();
  });
});
