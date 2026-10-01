import { describe, expect, it } from "vitest";
import { parseLegalDocument } from "./documents";
import { formatPolicyVersion, parsePolicyVersion } from "./version";

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

  it("실제 저장소의 두 파일은 아직 준비되지 않았다", async () => {
    // 본문을 받으면 이 테스트가 깨진다. 그때 기대값을 true 로 바꾸는 것이 '적용'이다.
    const { loadLegalDocument } = await import("./documents");
    expect(loadLegalDocument("terms").ready).toBe(false);
    expect(loadLegalDocument("privacy").ready).toBe(false);
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
