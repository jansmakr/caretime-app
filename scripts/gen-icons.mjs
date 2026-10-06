// CareTime 홈 화면 아이콘. 브랜드 표식(파란 점)을 그대로 키운 것이다.
// 글자를 넣지 않는다 — 폰트가 없고, 작은 크기에서 읽히지 않는다.
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const BLUE = "#1D6CE6";

/** 꽉 찬 파란 바탕 + 흰 말풍선. 현장톡 = 말을 주고받는 곳. */
function svg(size, safe) {
  // safe = maskable 여유(안드로이드가 모양대로 깎는다). 내용을 가운데 80%에 둔다.
  const pad = safe ? size * 0.18 : size * 0.1;
  const w = size - pad * 2;
  const r = w * 0.22;
  const tailW = w * 0.2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${BLUE}"/>
  <g fill="#FFFFFF">
    <rect x="${pad}" y="${pad}" width="${w}" height="${w * 0.74}" rx="${r}"/>
    <path d="M ${pad + w * 0.24} ${pad + w * 0.74}
             L ${pad + w * 0.24 + tailW} ${pad + w * 0.74}
             L ${pad + w * 0.28} ${pad + w * 0.95} Z"/>
  </g>
  <g fill="${BLUE}">
    <circle cx="${pad + w * 0.3}" cy="${pad + w * 0.37}" r="${w * 0.055}"/>
    <circle cx="${pad + w * 0.5}" cy="${pad + w * 0.37}" r="${w * 0.055}"/>
    <circle cx="${pad + w * 0.7}" cy="${pad + w * 0.37}" r="${w * 0.055}"/>
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
