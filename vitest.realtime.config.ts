import { defineConfig } from "vitest/config";
import { ALIAS, REALTIME_TESTS, SHARED } from "./vitest.config";

/**
 * 느린 묶음 — 실제 웹소켓을 왕복하는 테스트.
 *
 * `npm run test:realtime`
 *
 * 왜 따로 두는가: 구독 확정과 **거절**을 실제로 기다린다. 거절은 클라이언트가
 * 스스로 채널을 닫을 때까지 약 5초가 걸리고, 그런 케이스가 여럿이라 파일 하나가
 * 20초를 넘는다. 기본 묶음에 섞으면 사람이 테스트를 안 돌리게 된다.
 *
 * 그렇다고 지우거나 건너뛰지 않는다. 이 테스트가 보는 것은 "승인되지 않은 병원의
 * 토픽을 보호자가 들을 수 없다"이고, 그건 문서로 대체할 수 없는 성질이다.
 *
 * 전제: supabase start 로 로컬 스택이 떠 있어야 한다. 가드(vitest.setup.ts)가
 * 로컬이 아니면 시작 자체를 막는다.
 */
export default defineConfig({
  test: {
    ...SHARED,
    include: [REALTIME_TESTS],
    exclude: ["**/node_modules/**", "**/dist/**"],
    /*
     * 파일을 하나씩 돌린다.
     *
     * 이 묶음은 같은 로컬 DB 의 같은 병원 행을 쓰고 지운다. 병렬로 돌리면 한 파일이
     * 심은 상태를 다른 파일이 지워서 실패한다 — 실제로 그렇게 깨졌다. 테스트끼리
     * 병원을 나눠 쓰게 만드는 방법도 있지만, 그러면 어느 병원이 누구 것인지를 사람이
     * 기억해야 한다. 느린 묶음이라 순차로 돌려도 잃는 것이 없다.
     */
    fileParallelism: false,
  },
  resolve: { alias: ALIAS },
});
