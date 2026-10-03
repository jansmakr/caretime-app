import { describe, expect, it } from "vitest";
import { COMPANY, applyCompanyTokens, unknownTokens } from "./company";
import { LEGAL_DOC_IDS, loadLegalDocument, parseLegalDocument, readLegalSource } from "./documents";
import {
  currentPolicyVersion,
  formatPolicyVersion,
  parsePolicyVersion,
  todayInSeoul,
} from "./version";

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
    expect(doc.hasBody).toBe(true);
    // 머리글은 본문에서 빠진다. 제목이 두 번 나오면 안 된다.
    expect(doc.body.startsWith("## 수집하는 항목")).toBe(true);
  });

  it("★ 시행일이 미정이어도 본문은 보여준다 — 효력만 없다", () => {
    /*
     * 세 상태를 구분한다. 본문 없음 / 본문 있고 시행 전 / 시행 중.
     * 미정인 동안에도 읽을 수는 있어야 한다 — 교정도 실제 화면에서 하고, 사전 고지도
     * 정상이다. 효력 여부는 isPolicyInForce 가 따로 본다.
     */
    const doc = parseLegalDocument("terms", "# 이용약관\n시행일: 미정\n\n내용이 조금 있어도.");
    expect(doc.effectiveDate).toBeNull();
    expect(doc.hasBody).toBe(true);
  });

  it("★ 본문대기 표시가 남아 있으면 시행일이 있어도 준비되지 않은 것으로 본다", () => {
    const doc = parseLegalDocument(
      "terms",
      "# 이용약관\n시행일: 2026-10-15\n\n<!-- 본문대기 -->\n\n아직 안 받았습니다.",
    );
    expect(doc.hasBody).toBe(false);
  });

  it("★ 본문이 비어 있으면 보여 줄 것이 없다", () => {
    expect(parseLegalDocument("terms", "# 이용약관\n시행일: 2026-10-15\n\n").hasBody).toBe(false);
  });

  it("★ 본문의 사업자 정보 토큰이 실제로 바뀐다 — 파서에 연결돼 있는가", () => {
    /*
     * applyCompanyTokens 가 **호출되고 있는지**를 본다. 함수만 따로 테스트하면
     * 파서에 연결하는 줄이 빠져도 통과한다 — 실제로 그렇게 빠져 있었고,
     * 띄워서 `{{상호}}` 가 화면에 그대로 찍힌 것을 보고 찾았다.
     */
    const doc = parseLegalDocument(
      "terms",
      "# 이용약관\n시행일: 2026-10-08\n\n본 약관은 {{상호}}가 운영합니다.",
    );
    expect(doc.body).toContain(COMPANY.name);
    expect(doc.body).not.toContain("{{상호}}");
  });

  it("제목 표시(# )가 없으면 제목은 빈 문자열 — 던지지 않는다", () => {
    // 콜론이 없는 `시행일 2026-10-15` 도 읽는다. 사람이 두 가지로 쓴다.
    const doc = parseLegalDocument("terms", "이용약관\n시행일 2026-10-15\n본문");
    expect(doc.title).toBe("");
    expect(doc.effectiveDate).toBe("2026-10-15");
  });

  it("★ 사람이 쓰는 날짜 모양을 읽고 YYYY-MM-DD 로 맞춘다", () => {
    /*
     * policy_version 과 날짜 비교가 YYYY-MM-DD 를 쓴다. 본문을 쓰는 사람에게 그
     * 모양을 강요하지 않고 여기서 맞춘다 — 실제로 `2026년 10월 8일` 로 들어왔다.
     */
    for (const shape of ["2026-10-08", "2026년 10월 8일", "2026. 10. 8.", "2026년 10월 08일"]) {
      const doc = parseLegalDocument("terms", `# 약관\n\n시행일: ${shape}\n\n본문`);
      expect(doc.effectiveDate, shape).toBe("2026-10-08");
    }
  });

  it("★ 제목과 시행일 사이에 빈 줄이 있어도 읽는다 — 그게 자연스러운 모양이다", () => {
    const doc = parseLegalDocument("privacy", "# 방침\n\n시행일: 2026-10-08\n\n---\n\n## 1. 수집");
    expect(doc.title).toBe("방침");
    expect(doc.effectiveDate).toBe("2026-10-08");
    // 제목 바로 아래 가로줄은 본문에서 뗀다.
    expect(doc.body.startsWith("## 1. 수집")).toBe(true);
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
    expect(terms.hasBody).toBe(privacy.hasBody);
  });

  it("★ 준비됐다면 policy_version 이 만들어지고 되읽힌다", () => {
    const version = currentPolicyVersion();
    const ready = loadLegalDocument("terms").hasBody && loadLegalDocument("privacy").hasBody;

    /*
     * 값이 있는 것은 **본문이 있고 시행일이 지났을 때**뿐이다. 본문이 들어온 뒤에도
     * 시행일 전이면 null 이다 — 미래 날짜를 동의한 버전으로 적지 않는다.
     */
    const effective = loadLegalDocument("terms").effectiveDate ?? "9999-12-31";
    const inForce = ready && todayInSeoul() >= effective;
    expect(version !== null).toBe(inForce);
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

describe("시행일 — 오기 전에는 효력이 없다", () => {
  /*
   * 시행일을 미리 적어 공개하는 것은 정상이다(사전 고지). 그 기간에 세션을 만들면서
   * "미래 날짜의 방침에 동의했다"고 적으면 null 보다 나쁘다 — 없는 동의를 있는
   * 것처럼 기록하는 것이다. 그래서 currentPolicyVersion 이 시행일을 함께 본다.
   */
  it("★ 서울 기준 날짜를 쓴다 — UTC 로 읽으면 하루 늦게 켜진다", () => {
    // 한국 2026-10-13 00:30 = UTC 2026-10-12 15:30
    expect(todayInSeoul(new Date("2026-10-12T15:30:00Z"))).toBe("2026-10-13");
    expect(todayInSeoul(new Date("2026-10-12T14:30:00Z"))).toBe("2026-10-12");
  });

  it("YYYY-MM-DD 모양이라 문자열로 견줄 수 있다", () => {
    expect(todayInSeoul(new Date("2026-10-13T03:00:00Z"))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("★ 저장소의 문서는 아직 시행 중이 아니다 — policy_version 이 null 이다", () => {
    /*
     * 본문이 없으면 null, 본문이 있고 시행일이 미래여도 null, 시행일이 지나면 값이다.
     * 세 경우 모두 "지금 시행 중인가"를 묻는 한 함수로 답한다.
     */
    expect(currentPolicyVersion()).toBeNull();
  });
});

describe("문서 본문에 사업자 정보를 직접 적지 않는다", () => {
  /*
   * 값을 본문에 적으면 푸터와 문서가 갈라진다. 주소를 옮기거나 보호책임자가 바뀌는
   * 날 한쪽만 고쳐지고, 표기 의무가 있는 값이라 "둘 중 하나가 틀린" 상태가 그대로
   * 위반이다. 그래서 본문에는 토큰을 쓰고 값은 company.ts 한 곳에 둔다.
   *
   * 이 테스트는 **원문**을 본다(토큰을 바꾸기 전). 바꾼 뒤를 보면 토큰으로 적은
   * 것과 직접 적은 것이 같아 보여 아무것도 못 잡는다.
   */
  const SHOULD_BE_TOKEN: [value: string, token: string][] = [
    [COMPANY.name, "{{상호}}"],
    [COMPANY.address, "{{주소}}"],
    [COMPANY.registrationNumber, "{{사업자등록번호}}"],
    [COMPANY.email, "{{이메일}}"],
  ];

  for (const id of LEGAL_DOC_IDS) {
    it(`★ ${id}: 값이 아니라 토큰으로 적혀 있다`, () => {
      const source = readLegalSource(id);
      const typed = SHOULD_BE_TOKEN.filter(([value]) => source.includes(value)).map(
        ([value, token]) => `${value} → ${token}`,
      );
      /*
       * 깨지면 고치는 방법이 메시지에 있다. 본문의 그 값을 토큰으로 바꾸면 된다 —
       * 화면에는 같은 글자가 나가고, 바꾸는 곳만 한 곳이 된다.
       */
      expect(typed, `${id} 본문에 직접 적힌 값: ${typed.join(" / ")}`).toEqual([]);
    });
  }

  it("대표자·보호책임자 이름은 검사하지 않는다 — 두 글자 이름이 본문에 우연히 섞인다", () => {
    /*
     * "박대수"·"강혁" 같은 짧은 이름은 다른 문장에 우연히 들어갈 수 있다. 잘못 잡는
     * 테스트는 고치려고 본문을 비틀게 만든다. 그 둘은 토큰을 쓰라고 README 에 적고
     * 검사는 하지 않는다. 적지 않기로 한 것을 적어 두는 쪽을 골랐다.
     */
    expect(SHOULD_BE_TOKEN.map(([, token]) => token)).not.toContain("{{대표자}}");
  });
});