import type { LegalDocument } from "@/features/legal/documents";

/**
 * 약관 · 방침 본문 그리기.
 *
 * 마크다운 전부를 그리지 않는다. 방침 본문에 실제로 필요한 것은 소제목·문단·목록·
 * 굵은 글씨 넷이다(docs/legal/README.md 의 표). 라이브러리를 하나 더 붙이는 대신
 * 그 넷만 그린다 — 본문은 사용자가 쓴 글이 아니라 우리가 넣은 파일이므로
 * 임의 HTML 을 해석할 이유가 없다. 해석하지 않으니 끼워 넣기 사고가 날 자리도 없다.
 *
 * 글자 크기는 본문 15px 이다. 읽을 양이 많은 화면이라 더 작게 두지 않는다(UI 원칙 2).
 */
export function LegalBody({ document }: { document: LegalDocument }) {
  return <div className="space-y-3">{blocks(document.body).map(render)}</div>;
}

type Block =
  | { kind: "heading"; level: 2 | 3; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "paragraph"; text: string };

/** 빈 줄로 덩이를 나누고, 덩이의 첫 글자로 종류를 정한다. */
function blocks(body: string): Block[] {
  const out: Block[] = [];
  for (const chunk of body.split(/\n{2,}/)) {
    const lines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    if (lines[0].startsWith("### ")) {
      out.push({ kind: "heading", level: 3, text: lines[0].slice(4) });
      if (lines.length > 1) out.push({ kind: "paragraph", text: lines.slice(1).join(" ") });
      continue;
    }
    if (lines[0].startsWith("## ")) {
      out.push({ kind: "heading", level: 2, text: lines[0].slice(3) });
      if (lines.length > 1) out.push({ kind: "paragraph", text: lines.slice(1).join(" ") });
      continue;
    }
    if (lines.every((l) => l.startsWith("- "))) {
      out.push({ kind: "list", items: lines.map((l) => l.slice(2)) });
      continue;
    }
    out.push({ kind: "paragraph", text: lines.join(" ") });
  }
  return out;
}

function render(block: Block, i: number) {
  if (block.kind === "heading") {
    return block.level === 2 ? (
      <h2 key={i} className="pt-3 text-[18px] font-bold leading-snug">
        {bold(block.text)}
      </h2>
    ) : (
      <h3 key={i} className="pt-2 text-[16px] font-bold leading-snug">
        {bold(block.text)}
      </h3>
    );
  }
  if (block.kind === "list") {
    return (
      <ul key={i} className="list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-ink">
        {block.items.map((item, k) => (
          <li key={k}>{bold(item)}</li>
        ))}
      </ul>
    );
  }
  return (
    <p key={i} className="text-[15px] leading-relaxed text-ink">
      {bold(block.text)}
    </p>
  );
}

/** `**굵게**` 만 해석한다. 나머지 기호는 글자 그대로 둔다. */
function bold(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={i} className="font-bold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  );
}
