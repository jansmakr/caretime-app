import { describe, expect, it } from "vitest";
import { config, requiresSession } from "@/middleware";

/**
 * 어느 경로를 서버에서 막는가.
 *
 * 이 판정이 틀리면 두 방향으로 다친다. 좁으면 보호 화면이 그대로 열리고, 넓으면
 * /partner 입점 안내가 로그인 뒤로 숨어 병원이 들어올 길이 막힌다. 후자는 조용히
 * 나빠진다 — 아무도 오지 않는 것으로만 나타난다.
 *
 * 실제 HTTP 응답 본문 확인은 tests/middleware.realtime.test.ts 가 한다.
 * 여기서는 판정만 본다.
 */

describe("로그인이 필요한 경로", () => {
  it("★ /partner 는 공개다 — 입점 안내가 거기 있다", () => {
    expect(requiresSession("/partner")).toBe(false);
  });

  it("★ /partner/login 은 공개다 — 아니면 리다이렉트가 자기 자신을 향해 돈다", () => {
    expect(requiresSession("/partner/login")).toBe(false);
  });

  it("★ 그 밖의 /partner/* 는 막는다", () => {
    expect(requiresSession("/partner/capabilities")).toBe(true);
    expect(requiresSession("/partner/incoming")).toBe(true);
  });

  it("★ /admin 은 막는다", () => {
    expect(requiresSession("/admin")).toBe(true);
    expect(requiresSession("/admin/applications")).toBe(true);
  });

  it("보호자 화면은 건드리지 않는다", () => {
    for (const path of ["/", "/search", "/hospital/h_001", "/chat", "/more"]) {
      expect(requiresSession(path)).toBe(false);
    }
  });

  it("/partner 로 시작하는 이름은 닫는 쪽으로 떨어진다", () => {
    /*
     * startsWith("/partner") 는 /partnership 같은 이웃 이름까지 잡는다. 그대로 뒀다 —
     * 지금 그런 경로가 없고, 생긴다면 열리는 쪽보다 닫히는 쪽으로 틀리는 게 낫다.
     * 공개로 열어야 할 경로가 생기면 PUBLIC_PARTNER_PATHS 에 적는다. 적는 것을 잊으면
     * 로그인 화면으로 가서 눈에 띈다. 반대 방향은 아무도 모른다.
     */
    expect(requiresSession("/partnership")).toBe(true);
    expect(requiresSession("/partner-guide")).toBe(true);
  });
});

describe("matcher", () => {
  it("보호 경로를 실제로 지난다", () => {
    const pattern = new RegExp(config.matcher[0].replace(/^\/\(/, "^/(").replace(/\)$/, ")$"));
    for (const path of ["/partner/capabilities", "/admin", "/"]) {
      expect(pattern.test(path), path).toBe(true);
    }
  });

  it("★ 정적 파일은 지나가지 않는다 — 매 요청마다 Auth 서버에 묻지 않기 위해서다", () => {
    const pattern = new RegExp(config.matcher[0].replace(/^\/\(/, "^/(").replace(/\)$/, ")$"));
    for (const path of ["/_next/static/chunk.js", "/favicon.ico", "/logo.png"]) {
      expect(pattern.test(path), path).toBe(false);
    }
  });

  it("★ 보호 경로만 matcher 에 넣지 않았다 — 다른 화면에서도 세션이 갱신돼야 한다", () => {
    const pattern = new RegExp(config.matcher[0].replace(/^\/\(/, "^/(").replace(/\)$/, ")$"));
    expect(pattern.test("/search")).toBe(true);
  });
});
