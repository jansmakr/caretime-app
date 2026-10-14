import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isSearchIndexingOpen, parsePartnerChatUrl, showDemoReports } from "./demoContent";

/**
 * 노출 플래그의 **판정점이 하나**인지, 그리고 되돌리기 어려운 쪽이 환경변수로
 * 열리지 않는지 고정한다(CLAUDE.md).
 *
 * 플래그는 import 시점에 `process.env` 를 읽어 상수가 된다. 그래서 테스트에서
 * 값을 바꿔 다시 평가할 수 없다 — 선언 줄을 읽어서 **구조**를 확인한다.
 * 누가 가드를 떼면 이 테스트가 깨진다.
 */
const SOURCE = readFileSync("src/lib/demoContent.ts", "utf8");

function declarationOf(name: string): string {
  const line = SOURCE.split(/\r?\n/).find((l) => l.includes(`export const ${name}`));
  expect(line, `${name} 선언 줄을 찾지 못했다`).toBeDefined();
  return line as string;
}

describe("가상 글", () => {
  it("★ 상수 false 다 — 환경변수로도, NODE_ENV 로도 켜지지 않는다", () => {
    /*
     * 실제 병원 이름이 든 지어낸 글은 그 병원에 대한 허위 정보이고, 가상 병원
     * 이름을 쓰면 "모두 가상 데이터" 배너를 되살린다. 둘 다 이미 겪었다.
     * NODE_ENV 가드는 화면만 막고 번들에는 원본이 실렸다(2026-10-12 grep).
     */
    expect(showDemoReports).toBe(false);
    expect(declarationOf("showDemoReports")).not.toContain("process.env");
  });

  it("★ 가상 대화 원본이 저장소에 없다 — 있으면 누군가 다시 import 한다", () => {
    expect(existsSync("src/features/chat/seed.ts")).toBe(false);
    const room = readFileSync("src/features/chat/useChatRoom.ts", "utf8");
    expect(room).not.toMatch(/from "\.\/seed"|hospitals\/mock/);
  });

  it("가상 글을 내는 플래그는 하나다 — 켜는 길이 둘이면 하나를 잊는다", () => {
    const paths = SOURCE.split(/\r?\n/).filter((l) => l.includes("showDemoReports ="));
    expect(paths).toHaveLength(1);
  });
});

describe("색인", () => {
  it("★ 상수다 — 환경변수가 빠져서 열리는 길이 없다", () => {
    expect(isSearchIndexingOpen).toBe(false);
    expect(declarationOf("isSearchIndexingOpen")).not.toContain("process.env");
  });
});


describe("오픈채팅 주소", () => {
  it("값이 없으면 null — 버튼을 숨긴다", () => {
    expect(parsePartnerChatUrl(undefined)).toBeNull();
    expect(parsePartnerChatUrl("  ")).toBeNull();
  });

  it("★ 카카오 오픈채팅 https 주소만 받는다 — 방침 1-6 이 카카오 처리를 안내한다", () => {
    expect(parsePartnerChatUrl("https://open.kakao.com/o/abc123")).toBe(
      "https://open.kakao.com/o/abc123",
    );
    expect(parsePartnerChatUrl("http://open.kakao.com/o/abc123")).toBeNull();
    expect(parsePartnerChatUrl("https://open.kakao.com.evil.example/o/a")).toBeNull();
    expect(parsePartnerChatUrl("https://example.com/o/abc")).toBeNull();
    expect(parsePartnerChatUrl("open.kakao.com/o/abc")).toBeNull();
  });

  it("주소를 코드에 적어 두지 않는다 — 환경변수에서만 온다", () => {
    expect(declarationOf("partnerChatUrl")).not.toContain("open.kakao.com");
  });
});
