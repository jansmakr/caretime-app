import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatRoom } from "@/components/chat/ChatRoom";
import { EMPTY_FILTER, type ChatMessage } from "@/features/chat/types";

/**
 * 현장톡 화면을 서버 렌더로 한 번 그려 본다(jsdom 없이). 첫 HTML 에 무엇이 있고
 * 무엇이 없는지만 본다 — 마운트 뒤의 동작(위치·저장소)은 features/chat/viewRegion 테스트가 본다.
 */

const RENDERED_AT = "2026-10-15T12:00:00.000Z";

function message(id: string): ChatMessage {
  return {
    id,
    category: "other",
    topic: null,
    body: "테스트 본문",
    scope: { sido: null, sigungu: null, hospitalId: null, hospitalName: null },
    handle: "테스트별명",
    mine: false,
    baseReactions: {} as ChatMessage["baseReactions"],
    createdAt: "2026-10-15T11:50:00.000Z",
  };
}

function render(props: Partial<Parameters<typeof ChatRoom>[0]>): string {
  return renderToStaticMarkup(createElement(ChatRoom, { renderedAt: RENDERED_AT, ...props }));
}

describe("(4) 고른 지역에 글이 없을 때", () => {
  it("'이 지역엔 아직 글이 없어요'와 '전국 글 보기'가 보인다", () => {
    const html = render({ initialFilter: { ...EMPTY_FILTER, sido: "제주" } });
    expect(html).toContain("이 지역엔 아직 글이 없어요");
    expect(html).toContain("전국 글 보기");
    // 가상 글로 빈자리를 채우지 않는다.
    expect(html).not.toContain("테스트 본문");
  });
});

describe("(5) 기간 탭이 없다", () => {
  const html = render({ initialMessages: [message("m1")] });

  it("'최근 1개월 / 이전 글도 보기' 탭과 '보는 기간' 묶음이 그려지지 않는다", () => {
    expect(html).not.toContain("보는 기간");
    expect(html).not.toContain("이전 글도 보기");
    expect(html).not.toMatch(/>최근 1개월</);
  });

  it("지역은 한 줄이고, 기간은 목록 맨 아래 '이전 글 더 보기'다", () => {
    expect(html).toContain("지역 바꾸기 ›");
    expect(html).not.toContain("보는 지역\""); // 예전 지역 탭 묶음(aria-label="보는 지역")
    expect(html).toContain("이전 글 더 보기");
  });
});
