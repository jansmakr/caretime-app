import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * 테스트 설정.
 *
 * environment 는 node 다. 이번 단계의 테스트는 DOM 을 타지 않는 순수 로직뿐이다.
 * 화면 테스트는 이미 Playwright 로 돌고 있으므로 jsdom 을 들이지 않는다.
 *
 * setupFiles 의 가드가 운영 Supabase 주소를 막는다. (vitest.setup.ts)
 */
export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
  },
  resolve: {
    // tsconfig 의 "@/*" 경로를 vitest 에서도 같은 뜻으로 쓴다.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
