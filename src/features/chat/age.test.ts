import { describe, expect, it } from "vitest";
import { formatPostTime } from "./age";

/**
 * 글 시간 한 줄 — "상대 시간 · 정확한 시각", 서울 시간.
 * 시각은 전부 고정한다. 서버(UTC)에서 돌아도 서울 날짜로 그려야 한다.
 */

// 서울 2026-10-26 17:22 = UTC 08:22
const NOW = new Date("2026-10-26T08:22:00Z");
// 서울 2026-10-26 22:00 = UTC 13:00 — 10/23 21:40 에서 3일이 지난 저녁
const EVENING = new Date("2026-10-26T13:00:00Z");

describe("formatPostTime", () => {
  it("★ 오늘 글은 '10분 전 · 오후 5:12'", () => {
    const t = formatPostTime("2026-10-26T08:12:00Z", NOW);
    expect(t?.text).toBe("10분 전 · 오후 5:12");
    expect(t?.stale).toBe(false);
  });

  it("★ 지난 글은 '3일 전 · 10/23 21:40' — 24시간제, 서울 날짜", () => {
    // 서울 10/23 21:40 = UTC 12:40
    const t = formatPostTime("2026-10-23T12:40:00Z", EVENING);
    expect(t?.text).toBe("3일 전 · 10/23 21:40");
    expect(t?.stale).toBe(true);
  });

  it("★ UTC 로는 어제여도 서울로 오늘이면 오늘이다", () => {
    // 서울 10/26 00:30 = UTC 10/25 15:30
    expect(formatPostTime("2026-10-25T15:30:00Z", NOW)?.text).toBe("16시간 전 · 오전 12:30");
  });

  it("서울로 어제면 날짜를 쓴다 — 24시간이 안 지났어도", () => {
    // 서울 10/25 23:50 = UTC 14:50
    const t = formatPostTime("2026-10-25T14:50:00Z", NOW);
    expect(t?.text).toBe("17시간 전 · 10/25 23:50");
    expect(t?.stale).toBe(false);
  });

  it("해가 다르면 연도를 붙인다", () => {
    expect(formatPostTime("2025-03-14T01:05:00Z", NOW)?.text).toMatch(/· 2025\/3\/14 10:05$/);
  });

  it("★ 24시간 경계 — 딱 24시간이면 옅게", () => {
    expect(formatPostTime("2026-10-25T08:22:01Z", NOW)?.stale).toBe(false);
    expect(formatPostTime("2026-10-25T08:22:00Z", NOW)?.stale).toBe(true);
  });

  it("★ 스크린리더에는 정확한 시각을 문장으로", () => {
    const t = formatPostTime("2026-10-23T12:40:00Z", EVENING);
    expect(t?.spoken).toBe("2026년 10월 23일 오후 9시 40분, 3일 전");
    expect(t?.iso).toBe("2026-10-23T12:40:00.000Z");
  });

  it("정오·자정 표기", () => {
    expect(formatPostTime("2026-10-26T03:00:00Z", NOW)?.text).toBe("5시간 전 · 오후 12:00");
  });

  it("읽을 수 없는 시각이면 그리지 않는다", () => {
    expect(formatPostTime("not-a-date", NOW)).toBeNull();
  });
});
