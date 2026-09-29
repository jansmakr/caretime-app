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

  it("/partner 입점 안내는 열려 있다 — 병원이 들어올 길이다", async () => {
    const res = await fetch(`${BASE}/partner`, { redirect: "manual" });
    expect(res.status).toBe(200);
  }, TEST_MS);

  it("보호자 화면은 그대로 열린다", async () => {
    for (const path of ["/", "/search"]) {
      const res = await fetch(`${BASE}${path}`, { redirect: "manual" });
      expect(res.status, path).toBe(200);
    }
  }, TEST_MS);
});

describe("로그인 후", () => {
  it("★ 보호 화면이 정상으로 열린다", async () => {
    const cookie = await signedInCookieHeader();
    const res = await fetch(`${BASE}/partner/capabilities`, {
      headers: { cookie },
      redirect: "manual",
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<html");
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
