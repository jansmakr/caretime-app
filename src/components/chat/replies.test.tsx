import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatBubble } from "@/components/chat/ChatBubble";
import { ReplyComposerView, ReplyListView, ReplyToggle } from "@/components/chat/ReplySection";
import { NO_REPLIES, REPLIES_FAILED, REPLIES_LOADING } from "@/features/chat/replies";
import { ZERO_REACTIONS } from "@/features/chat/reactions";
import type { ChatMessageView } from "@/features/chat/types";
import { FACT_ONLY_NOTICE } from "@/lib/copy";

/**
 * 답글 화면. jsdom 없이 서버 렌더 결과(마크업)로 본다(vitest.config 주석).
 * 펼치기·올리기 같은 동작은 realtime 테스트(tests/guestWrites.realtime.test)가 서버를 붙든다.
 */

const now = new Date("2026-10-22T12:00:00Z");
const noop = () => undefined;

const message: ChatMessageView = {
  id: "11111111-1111-4111-8111-111111111111",
  category: "other",
  topic: null,
  body: "지금 대기 어때요",
  scope: { sido: "서울", sigungu: "강서구", hospitalId: null, hospitalName: null },
  handle: "보호자",
  createdAt: "2026-10-22T11:50:00Z",
  mine: false,
  baseReactions: ZERO_REACTIONS,
  reactions: ZERO_REACTIONS,
  myReactions: [],
};

const repliesProp = {
  count: 2,
  newCount: 1,
  canWrite: true,
  isMine: () => false,
  onChanged: noop,
  onSeen: noop,
};

function bubble(props: Partial<Parameters<typeof ChatBubble>[0]> = {}) {
  return renderToStaticMarkup(
    <ChatBubble
      message={message}
      now={now}
      onReact={async () => "saved"}
      onShared={noop}
      {...props}
    />,
  );
}

describe("글 카드의 답글 버튼", () => {
  it("기존 아래쪽 줄(신고·공유)에 '💬 답글 N개' 로 들어간다 — 새 줄을 만들지 않는다", () => {
    const html = bubble({ replies: repliesProp });
    expect(html).toContain("답글 2개");
    // 신고 버튼과 같은 줄(같은 div) 안에 있다.
    const row = html.slice(html.indexOf("답글 2개") - 600, html.indexOf("답글 2개") + 600);
    expect(row).toContain("신고");
  });

  it("'첫 답글을 남겨 주세요' 는 펼친 뒤에만 — 닫힌 카드에는 없다", () => {
    const html = bubble({ replies: { ...repliesProp, count: 0 } });
    expect(html).toContain("답글 0개");
    expect(html).not.toContain(NO_REPLIES);
    expect(html).toContain('aria-expanded="false"');
  });

  it("★ 답글을 못 읽었으면(답글 prop 없음) 답글 버튼이 없다 — 화면이 migration 보다 먼저 나간 경우", () => {
    const html = bubble();
    expect(html).not.toContain("답글");
  });

  it("남의 글에는 새 답글 표시가 없다", () => {
    expect(bubble({ replies: repliesProp })).not.toContain("새 답글");
  });

  it("내 글이면 '새 답글 N개' 를 함께 보인다", () => {
    const html = bubble({ message: { ...message, mine: true }, replies: repliesProp });
    expect(html).toContain("새 답글 1개");
  });

  it("버튼은 44px 이상, 14px", () => {
    const html = renderToStaticMarkup(
      <ReplyToggle count={1} newCount={0} open={false} controls="x" onToggle={noop} />,
    );
    expect(html).toContain("min-h-[44px]");
    expect(html).toContain("text-[14px]");
  });
});

describe("펼친 답글 목록", () => {
  const isMine = (id: string) => id === "mine";
  const list = (status: "loading" | "failed" | "ready", replies = [] as Parameters<typeof ReplyListView>[0]["replies"]) =>
    renderToStaticMarkup(
      <ReplyListView status={status} replies={replies} now={now} isMine={isMine} onShared={noop} onReported={noop} />,
    );

  it("답글이 없으면 '첫 답글을 남겨 주세요'", () => {
    expect(list("ready")).toContain(NO_REPLIES);
  });

  it("읽는 중·실패는 '답글 없음' 과 다른 말을 한다", () => {
    expect(list("loading")).toContain(REPLIES_LOADING);
    expect(list("failed")).toContain(REPLIES_FAILED);
    expect(list("failed")).not.toContain(NO_REPLIES);
  });

  it("답글은 연한 바탕, 본문 15px · 이름 14px, 남의 답글에는 신고가 있다", () => {
    const html = list("ready", [
      { id: "other", parentId: message.id, body: "방금 다녀왔어요", handle: "이웃", createdAt: "2026-10-22T11:55:00Z" },
      { id: "mine", parentId: message.id, body: "감사해요", handle: "나", createdAt: "2026-10-22T11:58:00Z" },
    ]);
    expect(html).toContain("bg-fill");
    expect(html).toContain("text-[15px]");
    expect(html).toContain("text-[14px]");
    expect(html.match(/>신고</g)).toHaveLength(1);
    expect(html).toContain("나 · 내 답글");
  });
});

describe("답글 작성칸", () => {
  const html = renderToStaticMarkup(
    <ReplyComposerView body="" sending={false} error={null} onChange={noop} onSend={noop} />,
  );

  it("글과 같은 고정 안내 한 줄", () => {
    expect(html).toContain(FACT_ONLY_NOTICE);
  });

  it("★ 빠른 문구 버튼이 없다 — 확인하지 않은 답을 한 번에 올리게 하지 않는다", () => {
    for (const phrase of ["지금 열려 있어요", "지금은 닫았어요", "대기 없었어요"]) {
      expect(html).not.toContain(phrase);
    }
    expect(html.match(/<button/g)).toHaveLength(1);
  });

  it("입력칸 16px(iOS 확대 방지), 올리기 버튼 44px", () => {
    expect(html).toContain("text-[16px]");
    expect(html).toContain("min-h-[44px]");
  });
});
