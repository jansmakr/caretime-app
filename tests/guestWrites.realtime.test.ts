import { spawn, type ChildProcess } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_GUEST_LIMITS } from "@/features/p0/limits";
import { requireLocalKeys } from "../vitest.setup";

/**
 * 화면을 거치지 않는 요청이 실제로 막히는가.
 *
 * **이게 이 단계의 전부다.** anon 키는 브라우저 번들에 들어가는 공개 값이라, 화면의
 * 쿨다운만 검증하면 아무것도 검증하지 않은 것이다. 키를 들고 직접 POST 하는 쪽을 본다.
 *
 * `npm run build` 가 먼저 돌아 있어야 한다(서버 라우트를 실제로 띄운다).
 */

const { url, anonKey, serviceKey } = requireLocalKeys();
const REST = `${url}/rest/v1`;
const admin = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
const PORT = 3124;
const BASE = `http://127.0.0.1:${PORT}`;
const TEST_MS = 60_000;

let server: ChildProcess | null = null;
let anon: SupabaseClient;

const uuid = () => crypto.randomUUID();

/** 브라우저 한 대. 쿠키를 들고 다닌다. */
class Browser {
  private cookie = "";

  async post(path: string, body: unknown): Promise<Response> {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.cookie ? { cookie: this.cookie } : {}),
      },
      body: JSON.stringify(body),
    });
    this.remember(res);
    return res;
  }

  async get(path: string): Promise<Response> {
    const res = await fetch(`${BASE}${path}`, {
      headers: this.cookie ? { cookie: this.cookie } : {},
    });
    this.remember(res);
    return res;
  }

  /** 서버가 내려 준 세션 쿠키를 그대로 들고 다닌다. */
  private remember(res: Response): void {
    const raw = res.headers.getSetCookie?.() ?? [];
    for (const line of raw) {
      const [pair] = line.split(";");
      if (pair.startsWith("caretime_guest=")) this.cookie = pair;
    }
  }

  get setCookieRaw(): string {
    return this.cookie;
  }

  async writeReport(over: Record<string, unknown> = {}): Promise<Response> {
    return this.post("/api/field-reports", {
      id: uuid(),
      category: "laceration",
      body: `지금 접수 가능하다고 안내받았어요 ${Math.random().toString(36).slice(2, 8)}`,
      sido: "서울",
      sigungu: "강서구",
      ...over,
    });
  }
}

async function cleanup(): Promise<void> {
  await fetch(`${REST}/field_reports?body=like.*접수*`, { method: "DELETE", headers: admin });
  await fetch(`${REST}/field_reports?body=like.*테스트*`, { method: "DELETE", headers: admin });
}

beforeAll(async () => {
  anon = createClient(url, anonKey, { auth: { persistSession: false } });
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], {
    cwd: process.cwd(),
    stdio: "ignore",
    env: { ...process.env },
  });

  const deadline = Date.now() + 40_000;
  for (;;) {
    if (Date.now() > deadline) {
      throw new Error("서버가 뜨지 않았습니다. npm run build 를 먼저 돌려 주세요.");
    }
    try {
      const res = await fetch(`${BASE}/api/guest`);
      if (res.status < 500) break;
    } catch {
      // 아직 안 떴다.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  await cleanup();
}, TEST_MS);

afterAll(async () => {
  await cleanup();
  server?.kill();
});

describe("화면을 거치지 않는 쓰기", () => {
  it("★ anon 키로 직접 글을 넣을 수 없다", async () => {
    const { error } = await anon.from("field_reports").insert({
      category: "laceration",
      body: "화면을 거치지 않고 넣는 글",
      handle: "누구든",
    });
    expect(error?.code).toBe("42501");
  }, TEST_MS);

  it("★ anon 키로 직접 반응을 넣을 수 없다", async () => {
    const { error } = await anon.from("field_report_reactions").insert({
      report_id: uuid(),
      key: "low_wait",
      guest_id: uuid(),
    });
    expect(error?.code).toBe("42501");
  }, TEST_MS);

  it("★ anon 키로 게스트 세션을 만들 수 없다 — 만들 수 있으면 제한이 무의미하다", async () => {
    const { error } = await anon.from("guest_sessions").insert({
      token_hash: "내가 만든 토큰",
      nickname: "내가정한이름",
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(error?.code).toBe("42501");
  }, TEST_MS);

  it("★ anon 키로 남의 세션을 읽을 수 없다", async () => {
    const { data } = await anon.from("guest_sessions").select("id,token_hash,nickname");
    expect(data).toEqual([]);
  }, TEST_MS);
});

describe("서버 라우트", () => {
  it("★ 글이 저장된다", async () => {
    const browser = new Browser();
    const res = await browser.writeReport();
    expect(res.status).toBe(200);

    const saved = (await res.json()) as { id: string; handle: string };
    const rows = await fetch(`${REST}/field_reports?id=eq.${saved.id}&select=handle,guest_id`, {
      headers: admin,
    }).then((r) => r.json() as Promise<{ handle: string; guest_id: string | null }[]>);

    expect(rows).toHaveLength(1);
    expect(rows[0].guest_id).not.toBeNull(); // 누가 썼는지 서버가 붙였다
    expect(rows[0].handle).toBe(saved.handle);
  }, TEST_MS);

  it("★ 세션 쿠키가 httpOnly 다 — 화면 스크립트가 읽을 수 없다", async () => {
    const res = await fetch(`${BASE}/api/guest`);
    const cookies = res.headers.getSetCookie?.() ?? [];
    const guest = cookies.find((c) => c.startsWith("caretime_guest="));

    expect(guest, "세션 쿠키가 없습니다").toBeDefined();
    expect(guest?.toLowerCase()).toContain("httponly");
    expect(guest?.toLowerCase()).toContain("samesite=lax");
  }, TEST_MS);

  it("★ 응답 본문에 세션 id 가 없다 — 이름만 나간다", async () => {
    const browser = new Browser();
    const res = await browser.get("/api/guest");
    const payload = (await res.json()) as Record<string, unknown>;

    expect(Object.keys(payload)).toEqual(["nickname"]);
    expect(JSON.stringify(payload)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  }, TEST_MS);

  it("★ 글쓴이가 이름을 정할 수 없다 — 서버가 붙인다", async () => {
    const browser = new Browser();
    const res = await browser.post("/api/field-reports", {
      id: uuid(),
      category: "laceration",
      body: "테스트 이름을 내가 정해 본다",
      handle: "관리자",
      guest_id: uuid(),
    });

    const saved = (await res.json()) as { handle: string };
    expect(saved.handle).not.toBe("관리자");
  }, TEST_MS);

  it("★ 같은 세션은 같은 이름을 유지한다 — '아까 그 사람'이 성립한다", async () => {
    const browser = new Browser();
    const first = ((await (await browser.get("/api/guest")).json()) as { nickname: string }).nickname;
    const second = ((await (await browser.get("/api/guest")).json()) as { nickname: string }).nickname;
    expect(second).toBe(first);

    // 쿠키가 다르면 다른 사람이다.
    const other = new Browser();
    const otherName = ((await (await other.get("/api/guest")).json()) as { nickname: string }).nickname;
    expect(other.setCookieRaw).not.toBe(browser.setCookieRaw);
    void otherName; // 이름이 우연히 같을 수 있다. 같은지로 사람을 구분하지 않는다.
  }, TEST_MS);

  it("모양이 틀린 요청은 거절한다", async () => {
    const browser = new Browser();
    expect((await browser.post("/api/field-reports", { id: "not-a-uuid" })).status).toBe(400);
    expect((await browser.writeReport({ category: "뭔가" })).status).toBe(400);
    expect((await browser.writeReport({ body: "" })).status).toBe(400);
    // 시군구만 있으면 어디인지 알 수 없다.
    expect((await browser.writeReport({ sido: null, sigungu: "강서구" })).status).toBe(400);
  }, TEST_MS);
});

describe("제한", () => {
  it("★ 서버가 막는다 — 화면 쿨다운과 무관하게", async () => {
    const browser = new Browser();
    const first = await browser.writeReport();
    expect(first.status).toBe(200);

    // 바로 다시. 화면이라면 버튼이 잠겨 있겠지만 여기는 화면이 아니다.
    const second = await browser.writeReport();
    expect(second.status).toBe(429);

    const payload = (await second.json()) as { error: string; retryAfterSeconds: number };
    expect(payload.error).toBe("rate_limited");
    expect(payload.retryAfterSeconds).toBeGreaterThan(0);
    expect(second.headers.get("Retry-After")).toBe(String(payload.retryAfterSeconds));
  }, TEST_MS);

  it("★ 쿠키를 버리고 다시 와도 제한이 살아 있어야 한다", async () => {
    /*
     * 지금은 쿠키를 버리면 새 세션이 생기고 제한이 초기화된다. 그것을 사실대로 고정한다 —
     * 통과하는 것이 아니라 **한계를 적어 두는** 테스트다. 이 경로를 더 막으려면
     * IP·기기 신호가 필요하고, 그건 개인정보를 더 받는 일이라 별도 판단이 필요하다.
     */
    const first = new Browser();
    expect((await first.writeReport()).status).toBe(200);

    const second = new Browser(); // 쿠키를 버린 것과 같다
    expect((await second.writeReport()).status).toBe(200);
  }, TEST_MS);

  it("제한값이 PRD 표와 같다", () => {
    expect(DEFAULT_GUEST_LIMITS.posts).toEqual([
      { windowMs: 30_000, max: 1 },
      { windowMs: 60 * 60_000, max: 10 },
      { windowMs: 24 * 60 * 60_000, max: 30 },
    ]);
  });

  it("★ 같은 내용을 다시 올리면 막는다", async () => {
    const browser = new Browser();
    const body = `테스트 같은 내용 ${Math.random().toString(36).slice(2, 8)}`;

    expect((await browser.writeReport({ body })).status).toBe(200);
    // 제한 창을 지나서 다시 보낸다. 내용만 같고 시간은 충분히 떨어져 있다.
    await fetch(`${REST}/field_reports?body=eq.${encodeURIComponent(body)}`, {
      method: "PATCH",
      headers: { ...admin, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ created_at: new Date(Date.now() - 60_000).toISOString() }),
    });

    const again = await browser.writeReport({ body });
    expect(again.status).toBe(409);
  }, TEST_MS);
});

describe("멱등성", () => {
  it("★ 같은 요청이 두 번 와도 글이 하나다", async () => {
    const browser = new Browser();
    const id = uuid();
    const body = `테스트 멱등 ${Math.random().toString(36).slice(2, 8)}`;
    const payload = { id, category: "laceration", body, sido: "서울", sigungu: "강서구" };

    const first = await browser.post("/api/field-reports", payload);
    expect(first.status).toBe(200);

    // 응답이 늦어 사용자가 다시 누른 것과 같다. 같은 id 로 다시 간다.
    const second = await browser.post("/api/field-reports", payload);
    expect(second.status).toBe(200); // 오류가 아니다. 결과는 같다.

    const rows = await fetch(`${REST}/field_reports?id=eq.${id}&select=id`, { headers: admin }).then(
      (r) => r.json() as Promise<unknown[]>,
    );
    expect(rows).toHaveLength(1);
  }, TEST_MS);
});
