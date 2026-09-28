import { describe, expect, it } from "vitest";
import { requireLocalSupabase } from "../vitest.setup";

/**
 * 테스트 가드 자체를 테스트한다.
 *
 * 이 가드가 조용히 망가지면(예: 정규식 실수) 턴 2 의 권한 거부·동시수정 테스트가
 * 연결된 운영 프로젝트로 나간다. 그건 되돌릴 수 없다. 그래서 가드에 테스트를 붙인다.
 *
 * setupFiles 의 전역 검사는 "원격이면 프로세스를 시작하지 않는다"를 담당하고,
 * 여기서는 requireLocalSupabase() 의 판정을 고정한다.
 */

function withEnv<T>(values: Record<string, string | undefined>, run: () => T): T {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(values)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return run();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

describe("requireLocalSupabase", () => {
  it("127.0.0.1 은 통과한다", () => {
    withEnv({ SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_URL: undefined }, () => {
      expect(requireLocalSupabase().url).toBe("http://127.0.0.1:54321");
    });
  });

  it("localhost 도 통과한다", () => {
    withEnv({ SUPABASE_URL: "http://localhost:54321", NEXT_PUBLIC_SUPABASE_URL: undefined }, () => {
      expect(requireLocalSupabase().url).toBe("http://localhost:54321");
    });
  });

  it("호스팅 프로젝트 주소는 거절한다", () => {
    withEnv(
      { SUPABASE_URL: "https://abcdefghijkl.supabase.co", NEXT_PUBLIC_SUPABASE_URL: undefined },
      () => {
        expect(() => requireLocalSupabase()).toThrow(/로컬이 아닌/);
      },
    );
  });

  it("오류 문구에 프로젝트 ref 전체를 담지 않는다 (호스트만)", () => {
    withEnv(
      { SUPABASE_URL: "https://secretref123456.supabase.co", NEXT_PUBLIC_SUPABASE_URL: undefined },
      () => {
        try {
          requireLocalSupabase();
          throw new Error("던져야 한다");
        } catch (e) {
          const msg = (e as Error).message;
          expect(msg).not.toContain("https://");
          expect(msg).toContain("secretref123456.supabase.co"); // 호스트는 알려준다
        }
      },
    );
  });

  it("주소가 없으면 거절한다 — DB 테스트가 조용히 건너뛰지 않게", () => {
    withEnv({ SUPABASE_URL: undefined, NEXT_PUBLIC_SUPABASE_URL: undefined }, () => {
      expect(() => requireLocalSupabase()).toThrow(/로컬 Supabase 주소가 없습니다/);
    });
  });

  it("URL 로 읽을 수 없는 값도 거절한다", () => {
    withEnv({ SUPABASE_URL: "not a url", NEXT_PUBLIC_SUPABASE_URL: undefined }, () => {
      expect(() => requireLocalSupabase()).toThrow();
    });
  });

  it("NEXT_PUBLIC_ 쪽만 설정돼 있어도 같은 판정을 한다", () => {
    withEnv({ SUPABASE_URL: undefined, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" }, () => {
      expect(requireLocalSupabase().url).toBe("http://127.0.0.1:54321");
    });
  });
});
