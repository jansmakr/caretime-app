// CareTime 홈 화면 아이콘 — **말풍선 + 십자**, #1C5FD8.
//
//   node scripts/gen-icons.mjs
//
// ⚠️ **지금 public/ 에 들어 있는 것은 이 스크립트가 만든 것이 아니다.**
// 2026-10-06 에 사람이 그린 최종 파일로 바꿨다(말풍선 + 십자, #1C5FD8).
// 그러니 아무 생각 없이 이것을 돌리면 그 파일을 덮어쓴다. 아래 치수·규칙을 남겨 두는
// 것은 다시 만들어야 할 때의 기준이고, 돌리기 전에 최종 파일이 어디 있는지 먼저 본다.
//
// 넣는 자리와 쓰임:
//   icon-192.png            설치된 바로가기 (manifest)
//   icon-512.png            같음, 큰 판
//   icon-maskable-512.png   안드로이드가 모양대로 깎을 때 쓰는 여유 판 (purpose: maskable)
//   apple-touch-icon.png    180px. iOS 는 manifest 아이콘을 안 본다
//   favicon-64.png          64px. 브라우저 탭. manifest 대상이 아니다
//
// ── 아이콘에 넣지 않는 것 (근거: docs/LAUNCH-scope.md) ──────
//   · "ER"·"응급" 표기를 넣지 않는다. 우리는 응급의료기관이 아니고, 급할 때 119
//     대신 이 아이콘을 누르게 만들면 그 자체가 사고다.
//   · **빨간 십자를 쓰지 않는다.** 적십자 표장은 대한적십자사 조직법과 제네바협약
//     으로 보호되는 표장이고, 허가 없이 쓰면 위법이다. 그래서 흰 십자다.
//   · 글자를 넣지 않는다. 폰트가 없고 작은 크기에서 읽히지 않는다.
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const BLUE = "#1C5FD8";

function svg(size, safe) {
  // safe = maskable 여유(안드로이드가 모양대로 깎는다). 내용을 가운데로 더 넣는다.
  const pad = safe ? size * 0.18 : size * 0.1;
  const w = size - pad * 2;
  const r = w * 0.22;
  // 말풍선 몸통
  const bodyH = w * 0.74;
  // 십자. 말풍선 가운데에 둔다.
  const cx = pad + w * 0.5;
  const cy = pad + bodyH * 0.5;
  const arm = w * 0.3;
  const thick = w * 0.105;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${BLUE}"/>
  <g fill="#FFFFFF">
    <rect x="${pad}" y="${pad}" width="${w}" height="${bodyH}" rx="${r}"/>
    <path d="M ${pad + w * 0.24} ${pad + bodyH}
             L ${pad + w * 0.44} ${pad + bodyH}
             L ${pad + w * 0.28} ${pad + w * 0.95} Z"/>
  </g>
  <g fill="${BLUE}">
    <rect x="${cx - arm / 2}" y="${cy - thick / 2}" width="${arm}" height="${thick}" rx="${thick * 0.3}"/>
    <rect x="${cx - thick / 2}" y="${cy - arm / 2}" width="${thick}" height="${arm}" rx="${thick * 0.3}"/>
  </g>
</svg>`;
}

const jobs = [
  ["public/icon-192.png", 192, false],
  ["public/icon-512.png", 512, false],
  ["public/icon-maskable-512.png", 512, true],
  ["public/apple-touch-icon.png", 180, false],
];
for (const [out, size, safe] of jobs) {
  const buf = await sharp(Buffer.from(svg(size, safe))).png().toBuffer();
  writeFileSync(out, buf);
  console.log(out, buf.length, "bytes");
}
