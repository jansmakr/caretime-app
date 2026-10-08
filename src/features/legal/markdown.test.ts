import { describe, expect, it } from "vitest";
import { parseLegalBlocks } from "./markdown";

/**
 * 법무 문서가 **쓴 대로 보이는가.**
 *
 * 전에는 화면 컴포넌트 안의 파서가 두 가지를 망가뜨렸다 — 번호 조항을 한 문단으로
 * 뭉치고, 표를 파이프 문자가 섞인 문단으로 내보냈다. 약관은 거의 전부 번호 조항이고
 * 방침에는 보관 기간 표가 있다. 그래서 그 두 가지를 여기서 붙든다.
 */

describe("번호 조항", () => {
  it("★ 붙어 있는 줄이 한 문단으로 뭉치지 않는다", () => {
    const blocks = parseLegalBlocks(
      ['1. "서비스": 현장톡', '2. "이용자": 로그인 없이 쓰는 사람', '3. "글": 올린 현장 상황'].join(
        "\n",
      ),
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({
      kind: "lines",
      items: ['1. "서비스": 현장톡', '2. "이용자": 로그인 없이 쓰는 사람', '3. "글": 올린 현장 상황'],
    });
  });

  it("★ 번호를 다시 붙이지 않는다 — 원문 번호가 문서의 일부다", () => {
    const blocks = parseLegalBlocks("제3조 (수집 항목)\n① 글 내용\n② 별명\n가. 예외");
    expect(blocks[0]).toEqual({
      kind: "lines",
      items: ["제3조 (수집 항목)", "① 글 내용", "② 별명", "가. 예외"],
    });
  });

  it("소제목 뒤에 붙은 줄도 줄 단위로 남는다", () => {
    const blocks = parseLegalBlocks("## 제2조 (정의)\n1. 첫째\n2. 둘째");
    expect(blocks[0]).toEqual({ kind: "heading", level: 2, text: "제2조 (정의)" });
    expect(blocks[1]).toEqual({ kind: "lines", items: ["1. 첫째", "2. 둘째"] });
  });
});

describe("표", () => {
  const TWO = ["| 항목 | 보관 기간 |", "|---|---|", "| 글 | 작성 후 30일 |", "| 세션 | 30일 |"].join(
    "\n",
  );

  it("★ 표로 읽는다 — 파이프 문자가 본문에 나가지 않는다", () => {
    const blocks = parseLegalBlocks(TWO);
    expect(blocks).toEqual([
      {
        kind: "table",
        head: ["항목", "보관 기간"],
        rows: [
          ["글", "작성 후 30일"],
          ["세션", "30일"],
        ],
      },
    ]);
  });

  it("세 칸 이상도 읽는다", () => {
    const blocks = parseLegalBlocks(
      ["| 항목 | 보관 | 근거 |", "|---|---|---|", "| 글 | 30일 | 신고 처리 |"].join("\n"),
    );
    expect(blocks[0]).toEqual({
      kind: "table",
      head: ["항목", "보관", "근거"],
      rows: [["글", "30일", "신고 처리"]],
    });
  });

  it("칸이 모자라면 빈 칸으로 채운다 — 표가 깨지는 것보다 낫다", () => {
    const blocks = parseLegalBlocks(["| 가 | 나 | 다 |", "|---|---|---|", "| 하나 | 둘 |"].join("\n"));
    expect(blocks[0]).toEqual({ kind: "table", head: ["가", "나", "다"], rows: [["하나", "둘", ""]] });
  });

  it("구분선이 없으면 표로 보지 않는다 — 파이프가 섞인 문장일 수 있다", () => {
    const blocks = parseLegalBlocks("| 이건 | 표가 아니다 |\n| 구분선이 | 없다 |");
    expect(blocks[0].kind).toBe("lines");
  });
});

describe("그 밖의 모양", () => {
  it("★ 구분선이 하이픈 세 개로 찍히지 않는다", () => {
    expect(parseLegalBlocks("앞\n\n---\n\n뒤")).toEqual([
      { kind: "lines", items: ["앞"] },
      { kind: "rule" },
      { kind: "lines", items: ["뒤"] },
    ]);
  });

  it("목록은 목록으로", () => {
    expect(parseLegalBlocks("- 하나\n- 둘")).toEqual([{ kind: "bullets", items: ["하나", "둘"] }]);
  });

  it("인용은 인용으로", () => {
    expect(parseLegalBlocks("> 주의하세요\n> 두 줄입니다")).toEqual([
      { kind: "quote", lines: ["주의하세요", "두 줄입니다"] },
    ]);
  });

  it("빈 본문은 빈 목록이다", () => {
    expect(parseLegalBlocks("")).toEqual([]);
    expect(parseLegalBlocks("\n\n  \n")).toEqual([]);
  });
});
