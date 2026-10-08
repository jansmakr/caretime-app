import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * 테스트 설정 — 기본(빠른) 묶음.
 *
 * environment 는 node 다. 이번 단계의 테스트는 DOM 을 타지 않는 순수 로직과
 * HTTP 호출뿐이다. 화면 테스트는 이미 Playwright 로 돌고 있어 jsdom 을 들이지 않는다.
 *
 * setupFiles 의 가드가 운영 Supabase 주소를 막는다. (vitest.setup.ts)
 *
 * *.realtime.test.ts 는 제외한다. 웹소켓 구독·거절을 실제로 왕복하느라 파일 하나가
 * 20초를 넘는다. 매번 그 값을 내면 사람이 테스트를 안 돌리게 되고, 안 돌리는 테스트는
 * 없는 것과 같다. 그 묶음은 npm run test:realtime 으로 따로 돌린다.
 * (CLI 의 --exclude 로 가르지 않는다. 그건 config 의 기본 제외를 덮어써서
 *  node_modules 까지 훑게 될 수 있다. 어디서 갈리는지가 설정 파일에 보여야 한다.)
 */

export const REALTIME_TESTS = "tests/**/*.realtime.test.ts";

/** 두 묶음이 공유하는 것. 한쪽만 가드가 빠지는 일이 없게 여기서 한 번 정한다. */
export const SHARED = {
  environment: "node" as const,
  setupFiles: ["./vitest.setup.ts"],
};

export const ALIAS = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

export default defineConfig({
  test: {
    ...SHARED,
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", REALTIME_TESTS],
  },
  resolve: {
    // tsconfig 의 "@/*" 경로를 vitest 에서도 같은 뜻으로 쓴다.
    alias: ALIAS,
  },
});
