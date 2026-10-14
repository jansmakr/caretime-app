import { describe, expect, it } from "vitest";
import { checkDryRun, extractMigrations } from "../scripts/check-dry-run.mjs";

// supabase CLI 가 실제로 찍는 모양을 흉내 낸다. 경로 접두와 같은 이름 두 번을 섞었다.
const ONE = `Connecting to remote database...
Would push these migrations:
 • 20261011120000_partner_inquiries.sql
Applying migration supabase/migrations/20261011120000_partner_inquiries.sql...
`;

describe("check-dry-run", () => {
  it("기대한 파일만 있으면 OK, exit 0", () => {
    expect(extractMigrations(ONE)).toEqual(["20261011120000_partner_inquiries.sql"]);
    const result = checkDryRun(ONE);
    expect(result.code).toBe(0);
    expect(result.lines[0]).toBe("OK: 기대한 마이그레이션만 있음");
  });

  it("다른 파일이 섞이면 섞인 것·빠진 것을 나열하고 exit 1", () => {
    const output = `Would push these migrations:
 • 20261007120000_accumulate.sql
 • 20261020120000_local-only.sql
`;
    const result = checkDryRun(output);
    expect(result.code).toBe(1);
    const text = result.lines.join("\n");
    expect(text).toContain("추가로 섞인 파일:");
    expect(text).toContain("+ 20261007120000_accumulate.sql");
    expect(text).toContain("+ 20261020120000_local-only.sql");
    expect(text).toContain("빠진 파일:");
    expect(text).toContain("- 20261011120000_partner_inquiries.sql");
    expect(result.lines.at(-1)).toBe("경고: db push 하지 마세요");
  });

  it("기대 파일이 다 있어도 하나라도 더 있으면 exit 1", () => {
    const result = checkDryRun(`${ONE} • 20261020120000_extra.sql\n`);
    expect(result.code).toBe(1);
    expect(result.lines.join("\n")).not.toContain("빠진 파일:");
  });

  it("인자로 기대 파일을 바꿀 수 있다", () => {
    expect(checkDryRun(ONE, ["20261011120000_partner_inquiries.sql"]).code).toBe(0);
    expect(checkDryRun(ONE, ["20261020120000_other.sql"]).code).toBe(1);
  });

  it("파일명이 하나도 없으면 exit 1", () => {
    const result = checkDryRun("Remote database is up to date.\n");
    expect(result).toEqual({
      code: 1,
      lines: ["적용할 마이그레이션 없음 또는 출력 형식 확인 필요"],
    });
  });
});
