/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
