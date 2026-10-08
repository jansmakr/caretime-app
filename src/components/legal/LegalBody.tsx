import type { LegalDocument } from "@/features/legal/documents";
import { parseLegalBlocks, type LegalBlock } from "@/features/legal/markdown";

/**
 * 약관·방침 본문 그리기.
 *
 * 읽는 양이 많은 화면이라 본문 15px 을 지킨다(UI 원칙 2). 줄바꿈은 저자가 쓴 대로
 * 둔다 — 조항 번호와 줄 구분이 문서의 일부다(features/legal/markdown).
 *
 * ── 표를 좁은 화면에서 어떻게 그리는가 ──────────────────────
 * **가로로 넘치지 않는 것이 표처럼 보이는 것보다 중요하다.** 360px 에서 가로
 * 스크롤이 생기면 오른쪽 칸을 못 읽고, 방침은 끝까지 읽혀야 하는 글이다.
 *
 *   · 두 칸 표  → 라벨/값 두 줄로 쌓는다. 좁은 화면에서도 표처럼 읽힌다.
 *   · 세 칸 이상 → 한 행을 덩이로 쌓는다. 첫 칸이 제목, 나머지는 "머리글 값".
 *
 * 그래서 `<table>` 을 쓰지 않는다. 쓰면 어느 폭에서는 반드시 넘친다.
 */
export function LegalBody({ document }: { document: LegalDocument }) {
  return <div className="space-y-3">{parseLegalBlocks(document.body).map(render)}</div>;
}

function render(block: LegalBlock, i: number) {
  switch (block.kind) {
    case "heading":
      return block.level === 2 ? (
        <h2 key={i} className="break-keep pt-3 text-[18px] font-bold leading-snug">
          {bold(block.text)}
        </h2>
      ) : (
        <h3 key={i} className="break-keep pt-2 text-[16px] font-bold leading-snug">
          {bold(block.text)}
        </h3>
      );

    case "rule":
      return <hr key={i} className="my-1 border-line" />;

    case "bullets":
      return (
        <ul key={i} className="list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-ink">
          {block.items.map((item, k) => (
            <li key={k} className="break-keep">
              {bold(item)}
            </li>
          ))}
        </ul>
      );

    case "quote":
      return (
        <blockquote
          key={i}
          className="rounded-field bg-fill px-3.5 py-2.5 text-[14.5px] leading-relaxed text-ink-muted"
        >
          {block.lines.map((line, k) => (
            <span key={k} className="block break-keep">
              {bold(line)}
            </span>
          ))}
        </blockquote>
      );

    case "lines":
      /*
       * 한 줄이 한 줄로 남는다. 전에는 붙어 있는 줄을 공백으로 이어 붙여 한 문단으로
       * 만들었다 — 번호 조항이 통째로 뭉쳤다.
       */
      return (
        <p key={i} className="text-[15px] leading-relaxed text-ink">
          {block.items.map((line, k) => (
            <span key={k} className="block break-keep">
              {bold(line)}
            </span>
          ))}
        </p>
      );

    case "table":
      return block.head.length <= 2 ? (
        <dl key={i} className="divide-y divide-line rounded-field bg-fill px-4">
          {block.rows.map((row, k) => (
            <div key={k} className="py-2.5">
              <dt className="break-keep text-[13px] font-semibold text-ink-faint">{bold(row[0])}</dt>
              <dd className="mt-0.5 break-keep text-[15px] leading-relaxed text-ink">
                {bold(row[1] ?? "")}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <div key={i} className="divide-y divide-line rounded-field bg-fill px-4">
          {block.rows.map((row, k) => (
            <div key={k} className="py-2.5">
              <p className="break-keep text-[15px] font-bold leading-snug text-ink">
                {bold(row[0])}
              </p>
              {row.slice(1).map((cell, c) =>
                cell === "" ? null : (
                  <p key={c} className="mt-0.5 break-keep text-[14px] leading-relaxed text-ink-muted">
                    <span className="text-ink-faint">{block.head[c + 1]} </span>
                    {bold(cell)}
                  </p>
                ),
              )}
            </div>
          ))}
        </div>
      );
  }
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
