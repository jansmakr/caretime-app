import { spawn, type ChildProcess } from "node:child_process";
import { createServerClient } from "@supabase/ssr";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requireLocalKeys } from "../vitest.setup";

/**
 * 보호 화면이 **응답 본문을 만들기 전에** 끊기는지 실제 HTTP 로 확인한다.
 *
 * 판정 함수 테스트(src/middleware.test.ts)로는 이걸 못 본다. 화면이 가려지는 것과
 * 본문이 없는 것은 다르고, 우리가 막으려는 사고는 후자다 — 비인증자가 응답 본문에서
 * 신청자 연락처를 읽는 것. 그래서 여기서는 서버를 띄우고 본문을 직접 본다.
 *
 * `npm run build` 가 먼저 돌아 있어야 한다. 없으면 이유를 말하고 실패한다.
 */

const { url, anonKey } = requireLocalKeys();
const PORT = 3123;
const BASE = `http://127.0.0.1:${PORT}`;
const TEST_MS = 60_000;

let server: ChildProcess | null = null;

function envValue(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`${key} 가 .env.local 에 없습니다.`);
  return v;
}

/** 로그인해서 @supabase/ssr 형식의 쿠키를 얻는다. 브라우저가 갖게 되는 것과 같은 모양이다. */
async function signedInCookieHeader(): Promise<string> {
  const jar = new Map<string, string>();
  const client = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => {
        for (const { name, value } of list) jar.set(name, value);
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({
    email: envValue("E2E_PARTNER_EMAIL"),
    password: envValue("E2E_PARTNER_PASSWORD"),
  });
  if (error) throw new Error(`로그인 실패: ${error.message}. npm run seed:localuser 를 먼저 돌려 주세요.`);
  if (jar.size === 0) throw new Error("로그인은 됐는데 쿠키가 만들어지지 않았습니다.");
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

beforeAll(async () => {
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], {
    cwd: process.cwd(),
    stdio: "ignore",
    env: { ...process.env },
  });

  const deadline = Date.now() + 40_000;
  for (;;) {
    if (Date.now() > deadline) {
      throw new Error(
        `서버가 뜨지 않았습니다. npm run build 를 먼저 돌려 주세요 (.next 가 필요합니다).`,
      );
    }
    try {
      const res = await fetch(`${BASE}/partner/login`, { redirect: "manual" });
      if (res.status < 500) break;
    } catch {
      // 아직 안 떴다.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}, TEST_MS);

afterAll(() => {
  server?.kill();
});

describe("비인증 요청", () => {
  it("★ 보호 화면의 응답에 본문이 없다 — 화면 가림이 아니라 본문 부재다", async () => {
    const res = await fetch(`${BASE}/partner/capabilities`, { redirect: "manual" });

    expect([302, 307, 308]).toContain(res.status);
    expect(res.headers.get("location")).toContain("/partner/login");

    // 페이지가 만들어지지 않았다. 읽을 것이 남아 있지 않다.
    const body = await res.text();
    expect(body).not.toContain("<html");
    expect(body).not.toContain("오늘 진료상태");
  }, TEST_MS);

  it("★ 돌아올 곳을 실어 준다 — 로그인 뒤 보던 화면으로 간다", async () => {
    const res = await fetch(`${BASE}/partner/incoming`, { redirect: "manual" });
    const location = res.headers.get("location") ?? "";
    expect(new URL(location, BASE).searchParams.get("next")).toBe("/partner/incoming");
  }, TEST_MS);

  it("★ /admin 도 막힌다 (아직 화면이 없어도 경로는 닫혀 있다)", async () => {
    const res = await fetch(`${BASE}/admin`, { redirect: "manual" });
    expect([302, 307, 308]).toContain(res.status);
    expect(res.headers.get("location")).toContain("/partner/login");
  }, TEST_MS);

  it("★ 1차에는 /partner 가 닫혀 있다 — 참여 병원이 0곳이다", async () => {
    /*
     * 전에는 "입점 안내는 열려 있다(200)"를 고정했다. 1차 범위를 좁히면서 병원 화면을
     * 닫았다(lib/demoContent.showPartnerEntry, docs/LAUNCH-scope.md). 링크만 떼면
     * 주소를 아는 사람에게는 그대로 열려 있고, 그 화면은 지금 보여 줄 값이 없다.
     *
     * 첫 참여 병원이 생겨 플래그를 켜면 이 테스트가 깨진다. 그때 200 으로 되돌리는
     * 것이 '다시 여는 일'이다 — 플래그만 켜고 테스트를 안 고치면 깨진 채로 남는다.
     */
    const res = await fetch(`${BASE}/partner`, { redirect: "manual" });
    expect(res.status).toBe(404);
  }, TEST_MS);

  it("보호자 화면은 그대로 열린다", async () => {
    // /search 는 1차에 닫혀 있다(의료기관 목록). 보호자 경로는 홈과 현장톡이다.
    for (const path of ["/", "/chat"]) {
      const res = await fetch(`${BASE}${path}`, { redirect: "manual" });
      expect(res.status, path).toBe(200);
    }
  }, TEST_MS);
});

describe("로그인 후", () => {
  it("★ 미들웨어는 세션을 통과시킨다 — 404 는 권한이 아니라 닫힌 화면이다", async () => {
    /*
     * 두 가지를 구분해서 고정한다.
     *   · 로그인 없이 오면 **리다이렉트**다 (위의 테스트들). 인증 문제다.
     *   · 로그인하고 와도 **404** 다. 인증은 통과했고 화면 자체가 1차에서 닫혔다.
     * 둘이 섞이면 "로그인이 안 되는 것"과 "화면이 없는 것"을 구분할 수 없다.
     */
    const cookie = await signedInCookieHeader();
    const res = await fetch(`${BASE}/partner/capabilities`, {
      headers: { cookie },
      redirect: "manual",
    });

    expect(res.status).toBe(404);
    // 로그인 화면으로 돌려보내지 않는다. 인증은 끝났다.
    expect(res.headers.get("location")).toBeNull();

    /*
     * 응답 본문에 **병원 값**이 없다. 이 화면의 값은 로그인한 본인의 세션으로
     * 브라우저에서 읽어 오므로 서버가 그릴 값이 애초에 없다 — 404 본문에 남는 것은
     * 라벨뿐이다. 그래서 라벨 문자열("진료기능")로는 아무것도 검증되지 않는다.
     * 비인증 요청에서 본문이 아예 만들어지지 않는 것은 위의 첫 테스트가 고정한다.
     */
    const body = await res.text();
    expect(body).not.toContain("hospital_members");
  }, TEST_MS);
});

describe("세션이 못 쓰게 됐을 때", () => {
  it("★ 서버에서 리다이렉트한다 — 화면을 그리지 않는다", async () => {
    /*
     * 쿠키는 클라이언트가 만든 것이다. 그래서 미들웨어는 getSession()(쿠키를 그대로 믿음)이
     * 아니라 getUser()(Auth 서버에 확인)를 쓴다. 망가진 토큰을 들고 가도 통과하면 안 된다.
     */
    const cookie = await signedInCookieHeader();
    const broken = cookie.replace(/=(.)/, "=x");

    const res = await fetch(`${BASE}/partner/capabilities`, {
      headers: { cookie: broken },
      redirect: "manual",
    });

    expect([302, 307, 308]).toContain(res.status);
    expect(res.headers.get("location")).toContain("/partner/login");
    expect(await res.text()).not.toContain("<html");
  }, TEST_MS);
});
