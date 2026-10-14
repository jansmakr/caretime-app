import { describe, expect, it } from "vitest";
import { RETENTION_DAYS, formatRetention } from "./retention";

describe("formatRetention", () => {
  it("365 의 배수는 연 단위로 적는다 — 방침 문서와 같은 말", () => {
    expect(formatRetention(365)).toBe("1년");
    expect(formatRetention(730)).toBe("2년");
  });

  it("나머지는 일 단위", () => {
    expect(formatRetention(30)).toBe("30일");
  });

  it("사전 신청 폼은 방침 1-6 의 '1년'과 같게 나온다", () => {
    expect(formatRetention(RETENTION_DAYS.partner_inquiries)).toBe("1년");
  });
});
