/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  /*
   * dev 와 운영 빌드가 **다른 폴더**를 쓴다.
   *
   * 전에는 둘 다 `.next` 였다. 그래서 `npm run dev` 를 켜 둔 채 `npm run build` 를
   * 돌리면 dev 서버가 들고 있던 CSS 경로(`/_next/static/css/app/layout.css`)가
   * 지워지고 **404 가 되어 화면이 날것의 HTML 로 나왔다.** 실제로 겪었다 —
   * 스타일이 하나도 없는 화면을 보고 Tailwind 가 깨진 줄 알았다.
   *
   * NODE_ENV 는 Next 가 정한다(dev = development, build·start = production).
   */
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  /*
   * /terms · /privacy 가 docs/legal/*.md 를 런타임에 읽는다. 소스에서 import 하는 것이
   * 아니라 fs 로 읽으므로 Next 의 추적에 걸리지 않는다 — 배포 산출물에 넣으라고
   * 명시해야 한다. 빠지면 두 화면이 "준비 중"으로 떨어진다(터지지는 않는다).
   */
  outputFileTracingIncludes: {
    "/terms": ["./docs/legal/*.md"],
    "/privacy": ["./docs/legal/*.md"],
    "/more": ["./docs/legal/*.md"],
    "/**": ["./docs/legal/*.md"],
  },
};

export default nextConfig;
