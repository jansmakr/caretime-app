import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PostTime } from "@/components/chat/PostTime";

/** 글·답글 시간 한 줄. jsdom 없이 서버 렌더 마크업으로 본다(vitest.config 주석). */

const NOW = new Date("2026-10-26T08:22:00Z");
const html = (createdAt: string) => renderToStaticMarkup(<PostTime createdAt={createdAt} now={NOW} />);

describe("PostTime", () => {
  it("★ <time dateTime> 이고, 스크린리더에는 정확한 시각을 읽힌다", () => {
    const out = html("2026-10-23T12:40:00Z");
    expect(out).toContain('<time dateTime="2026-10-23T12:40:00.000Z"');
    expect(out).toContain('<span aria-hidden="true">2일 전 · 10/23 21:40</span>');
    expect(out).toContain('<span class="sr-only">2026년 10월 23일 오후 9시 40분, 2일 전</span>');
  });

  it("★ 한 줄로 묶고, 14px 이다", () => {
    const out = html("2026-10-26T08:12:00Z");
    expect(out).toContain("whitespace-nowrap");
    expect(out).toContain("text-[14px]");
  });

  it("★ 24시간 안은 진한 회색, 지나면 옅은 회색, 30일 지나면 주의 색", () => {
    expect(html("2026-10-26T08:12:00Z")).toContain("text-ink-muted");
    expect(html("2026-10-23T12:40:00Z")).toContain("text-ink-faint");
    expect(html("2026-09-01T12:40:00Z")).toContain("text-caution-ink");
  });
});
