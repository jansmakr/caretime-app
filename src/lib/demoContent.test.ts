import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isSearchIndexingOpen, showDemoReports } from "./demoContent";

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
  it("★ 운영 빌드에서는 환경변수로도 켤 수 없다 — 지어낸 글은 허위 정보가 된다", () => {
    /*
     * 실제 병원 이름이 든 지어낸 글은 그 병원에 대한 허위 정보이고, 가상 병원
     * 이름을 쓰면 "모두 가상 데이터" 배너를 되살린다. 둘 다 이미 겪었다.
     * 그래서 Vercel 설정 한 줄로 되살아나는 자리에 두지 않는다.
     */
    expect(declarationOf("showDemoReports")).toContain('process.env.NODE_ENV !== "production"');
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

describe("테스트 환경", () => {
  it("여기서는 가상 글이 켜져 있다 — 위 두 테스트가 구조를 보는 이유다", () => {
    // NODE_ENV=test 이므로 production 가드를 통과한다. 값 자체로는 운영을 못 본다.
    expect(typeof showDemoReports).toBe("boolean");
  });
});
