import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ComposeOpenButton } from "@/components/chat/ComposeOpenButton";

/** 현장톡 "글쓰기" 버튼. jsdom 없이 서버 렌더 마크업으로 본다(vitest.config 주석). */

const html = renderToStaticMarkup(<ComposeOpenButton onOpen={() => undefined} />);

describe("글쓰기 — 작성창은 접혀 있고 누르면 펼친다", () => {
  it("★ 접힌 상태에는 입력칸이 없다 — 버튼 하나", () => {
    expect(html).toContain("글쓰기");
    expect(html).not.toContain("<textarea");
    expect(html).toContain('aria-expanded="false"');
  });

  it("주 버튼 모양이다(높이 56px · 17px)", () => {
    expect(html).toContain("ct-primary");
  });
});
