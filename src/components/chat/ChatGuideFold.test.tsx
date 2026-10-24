import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatGuideFoldView } from "@/components/chat/ChatGuideFold";
import { USER_REPORT_DISCLAIMER } from "@/lib/copy";

/** 현장톡 맨 위 "안내 보기" 한 줄. jsdom 없이 서버 렌더 마크업으로 본다(vitest.config 주석). */

const noop = () => undefined;
const view = (open: boolean, unseen = false) =>
  renderToStaticMarkup(<ChatGuideFoldView open={open} unseen={unseen} onToggle={noop} />);

describe("안내 보기 — 베타·유의·케타를 한 줄로 접는다", () => {
  it("★ 기본(접힘)에는 세 덩어리가 없다 — 한 줄만", () => {
    const html = view(false);
    expect(html).toContain("안내 보기");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain(USER_REPORT_DISCLAIMER);
    expect(html).not.toContain("AI 아님");
    expect(html).not.toContain("베타로 운영 중입니다");
  });

  it("★ 펼치면 세 덩어리가 문구 그대로 나온다", () => {
    const html = view(true);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("베타로 운영 중입니다");
    expect(html).toContain(USER_REPORT_DISCLAIMER);
    expect(html).toContain("주변 분들이 눌러 준 빠른 반응으로 상황을 알 수 있어요. 답이 없을 수도 있어요. 급하면 119.");
    expect(html).toContain("위급하면 기다리지 말고 119 전화");
  });

  it("줄은 44px 이상, 16px, 스크린리더 라벨이 있다", () => {
    const html = view(false);
    expect(html).toContain("min-h-[44px]");
    expect(html).toContain("text-[16px]");
    expect(html).toContain('aria-label="안내 보기 — 베타 안내, 유의사항, 케타 안내"');
  });

  it("처음 온 사람에게만 점 — 읽은 뒤에는 없다", () => {
    expect(view(false, true)).toContain("rounded-full bg-blue");
    expect(view(false, true)).toContain("(아직 안 읽음)");
    expect(view(false, false)).not.toContain("rounded-full bg-blue");
  });
});
