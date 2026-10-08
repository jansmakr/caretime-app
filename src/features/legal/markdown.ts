/**
 * 약관·방침 본문을 블록으로 읽는다.
 *
 * 마크다운 전부를 다루지 않는다. 법무 문서에 실제로 쓰이는 것만 본다 —
 * 소제목 · 번호 조항 · 목록 · 표 · 구분선 · 인용 · 굵은 글씨.
 * 라이브러리를 붙이는 대신 그 일곱 가지만 읽고, 임의 HTML 을 해석하지 않는다.
 *
 * ── 이 파일이 왜 따로 있는가 ────────────────────────────────
 * 전에는 화면 컴포넌트 안에 파서가 있었고, 두 가지를 **망가뜨리고 있었다.**
 *
 *   ① 번호 조항이 한 줄로 뭉쳤다.
 *      "1. 서비스: …" / "2. 이용자: …" 가 붙어 있으면 공백으로 이어 붙여
 *      한 문단으로 만들었다. 법무 문서는 거의 전부 번호 조항이다.
 *   ② 표를 아예 그리지 않았다.
 *      `| 항목 | 보관 |` 이 파이프 문자가 섞인 문단으로 나갔다.
 *
 * 그래서 **줄바꿈을 보존하는 쪽으로 바꿨다.** 저자가 쓴 모양이 곧 문서의 모양이다 —
 * 산문처럼 다시 흘려 쓰면 조항 번호와 줄 구분이 사라진다.
 */

export type LegalBlock =
  | { kind: "heading"; level: 2 | 3; text: string }
  | { kind: "lines"; items: string[] }
  | { kind: "bullets"; items: string[] }
  | { kind: "quote"; lines: string[] }
  | { kind: "rule" }
  /**
   * 표. 좁은 화면에서 **가로로 넘치지 않는 것**이 표처럼 보이는 것보다 중요하다.
   * 그래서 열 수에 따라 그리는 방법을 바꾼다(components/legal/LegalBody).
   */
  | { kind: "table"; head: string[]; rows: string[][] };

const TABLE_SEPARATOR = /^\|?[\s:|-]+\|[\s:|-]*$/;

function isTableRow(line: string): boolean {
  return line.startsWith("|") && line.endsWith("|") && line.length > 2;
}

function cells(line: string): string[] {
  return line
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
}

/** 표 구분선인가. `|---|---|` · `|:--|--:|` 모양. */
function isSeparator(line: string): boolean {
  return TABLE_SEPARATOR.test(line) && line.includes("-");
}

export function parseLegalBlocks(body: string): LegalBlock[] {
  const out: LegalBlock[] = [];

  for (const chunk of body.replace(/\r\n/g, "\n").split(/\n{2,}/)) {
    const lines = chunk
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "");
    if (lines.length === 0) continue;

    // 구분선. 문단으로 흘려보내면 하이픈 세 개가 본문에 찍힌다.
    if (lines.every((line) => /^-{3,}$|^={3,}$|^\*{3,}$/.test(line))) {
      out.push({ kind: "rule" });
      continue;
    }

    // 표: 머리줄 + 구분선 + 본문줄. 구분선이 없으면 표로 보지 않는다.
    if (lines.length >= 2 && isTableRow(lines[0]) && isSeparator(lines[1])) {
      const head = cells(lines[0]);
      const rows = lines
        .slice(2)
        .filter(isTableRow)
        .map((line) => {
          const row = cells(line);
          // 칸 수가 모자라면 빈 칸으로 채운다. 표가 깨지는 것보다 낫다.
          while (row.length < head.length) row.push("");
          return row.slice(0, head.length);
        });
      out.push({ kind: "table", head, rows });
      continue;
    }

    if (lines[0].startsWith("### ")) {
      out.push({ kind: "heading", level: 3, text: lines[0].slice(4) });
      if (lines.length > 1) out.push({ kind: "lines", items: lines.slice(1) });
      continue;
    }
    if (lines[0].startsWith("## ")) {
      out.push({ kind: "heading", level: 2, text: lines[0].slice(3) });
      if (lines.length > 1) out.push({ kind: "lines", items: lines.slice(1) });
      continue;
    }
    // `# ` 은 문서 제목이고 머리글에서 이미 떼어 냈다. 본문에 또 있으면 소제목으로 본다.
    if (lines[0].startsWith("# ")) {
      out.push({ kind: "heading", level: 2, text: lines[0].slice(2) });
      if (lines.length > 1) out.push({ kind: "lines", items: lines.slice(1) });
      continue;
    }

    if (lines.every((line) => line.startsWith("> "))) {
      out.push({ kind: "quote", lines: lines.map((line) => line.slice(2)) });
      continue;
    }

    if (lines.every((line) => /^[-*·]\s/.test(line))) {
      out.push({ kind: "bullets", items: lines.map((line) => line.replace(/^[-*·]\s+/, "")) });
      continue;
    }

    /*
     * 그 밖에는 **줄을 그대로 둔다.** 번호를 다시 붙이지 않고 쓴 대로 보여 준다 —
     * "제3조" · "1." · "①" · "가." 가 섞여 있어도 조항 번호는 본문의 일부다.
     * 자동 번호 목록으로 바꾸면 원문과 번호가 달라질 수 있고, 법무 문서에서 그건
     * 고쳐 쓴 것이 된다.
     */
    out.push({ kind: "lines", items: lines });
  }

  return out;
}
