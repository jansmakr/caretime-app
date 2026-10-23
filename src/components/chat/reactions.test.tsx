import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatReactions } from "@/components/chat/ChatReactions";
import { ReactionGuideCard } from "@/components/chat/ReactionGuide";
import {
  OWN_POST_NO_REACTION,
  OWN_POST_REACTION_GUIDE,
  ROOM_REACTION_GUIDE,
  ZERO_REACTIONS,
  reactionNotice,
} from "@/features/chat/reactions";

/**
 * 빠른 반응 칩이 "누르는 버튼"으로 읽히는가.
 *
 * jsdom 을 들이지 않으므로(vitest.config 주석) 서버 렌더 결과(마크업)로 확인한다.
 * 누르는 동작은 store 테스트(features/chat/pressReaction.test)가 붙든다.
 */

const press = async () => "saved" as const;

describe("남의 글 — 누를 수 있다", () => {
  it("안내는 방 위쪽 한 곳에 있다. 카드에는 안내 문구를 붙이지 않는다", () => {
    expect(renderToStaticMarkup(<ReactionGuideCard onClose={() => undefined} />)).toContain(
      ROOM_REACTION_GUIDE,
    );
    const card = renderToStaticMarkup(
      <ChatReactions counts={ZERO_REACTIONS} mine={[]} onPress={press} />,
    );
    expect(card).not.toContain(ROOM_REACTION_GUIDE);
    expect(card).not.toContain(OWN_POST_REACTION_GUIDE);
  });

  it("안내는 닫을 수 있다(44px 버튼)", () => {
    const html = renderToStaticMarkup(<ReactionGuideCard onClose={() => undefined} />);
    expect(html).toContain('aria-label="안내 닫기"');
    expect(html).toContain("h-11 w-11");
  });

  it("세 칩 모두 버튼이고, 안 눌린 칩에도 테두리가 있다", () => {
    const html = renderToStaticMarkup(
      <ChatReactions counts={ZERO_REACTIONS} mine={[]} onPress={press} />,
    );
    expect(html.match(/<button/g)).toHaveLength(3);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(3);
    expect(html.match(/border-ink-faint/g)).toHaveLength(3);
    expect(html).toContain("min-h-[44px]");
    expect(html).toContain("gap-2");
  });

  it("눌린 칩은 aria-pressed 와 ✓ 로 표시한다 — 색만으로 말하지 않는다", () => {
    const html = renderToStaticMarkup(
      <ChatReactions
        counts={{ low_wait: 2, doctor_present: 0, closed: 0 }}
        mine={["low_wait"]}
        onPress={press}
      />,
    );
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain("✓");
    expect(html).toContain('aria-label="대기 3명 이하, 2명이 알려 줌"');
  });

  it("이미 누른 칩을 다시 누르면 '이미 알려 주셨어요'", () => {
    expect(reactionNotice("already")).toBe("이미 알려 주셨어요");
    expect(reactionNotice("saved")).toBeNull();
  });
});

describe("내 글 — 읽기 전용", () => {
  it("반응이 있으면 '다른 분들이 눌러 준 반응이에요' 와 받은 것만 보인다", () => {
    const html = renderToStaticMarkup(
      <ChatReactions
        counts={{ low_wait: 0, doctor_present: 3, closed: 0 }}
        mine={[]}
        readOnly
        onPress={press}
      />,
    );
    expect(html).toContain(OWN_POST_REACTION_GUIDE);
    expect(html).not.toContain("<button");
    expect(html).toContain("선생님 계심");
    expect(html).not.toContain("대기 3명 이하");
    expect(html).not.toContain("접수 마감됨");
  });

  it("반응이 없으면 빈 상태 문구 한 줄만 — 0 을 늘어놓지 않는다", () => {
    const html = renderToStaticMarkup(
      <ChatReactions counts={ZERO_REACTIONS} mine={[]} readOnly onPress={press} />,
    );
    expect(html).toContain(OWN_POST_NO_REACTION);
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<ul");
  });
});
