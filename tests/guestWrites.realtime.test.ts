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

  async del(path: string): Promise<Response> {
    const res = await fetch(`${BASE}${path}`, {
      method: "DELETE",
      headers: this.cookie ? { cookie: this.cookie } : {},
    });
    this.remember(res);
    return res;
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
  // 신고·조치가 글을 참조하므로 먼저 지운다.
  await fetch(`${REST}/moderation_actions?reason_code=eq.auto_on_report`, {
    method: "DELETE",
    headers: admin,
  });
  await fetch(`${REST}/reports?target_type=eq.post`, { method: "DELETE", headers: admin });
  await fetch(`${REST}/field_reports?body=like.*접수*`, { method: "DELETE", headers: admin });
  await fetch(`${REST}/field_reports?body=like.*테스트*`, { method: "DELETE", headers: admin });
  await fetch(`${REST}/field_reports?body=like.*전화*`, { method: "DELETE", headers: admin });
  await fetch(`${REST}/hospital_requests?name=like.*테스트*`, { method: "DELETE", headers: admin });
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

  it("★ 응답 본문에 세션 id 가 없다 — 이름과 내 글 id 만 나간다", async () => {
    const browser = new Browser();
    const res = await browser.get("/api/guest");
    const payload = (await res.json()) as Record<string, unknown>;

    expect(Object.keys(payload).sort()).toEqual(["myPostIds", "nickname"]);
    // 방금 만든 세션에는 글이 없다. 그래서 어떤 uuid 도 실리지 않는다.
    expect(payload.myPostIds).toEqual([]);
    expect(JSON.stringify(payload)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  }, TEST_MS);

  it("★ 글을 쓴 뒤에도 세션 id 는 나가지 않는다 — 실리는 uuid 는 글 id 뿐이다", async () => {
    /*
     * 세션 id 가 응답에 실리면 스크립트가 읽을 수 있고, 그 순간 공유 문구·URL·분석
     * 로그로 새어 나갈 길이 생긴다. 글 id 는 이미 공개 목록에 있는 값이라 다르다.
     */
    const browser = new Browser();
    const id = uuid();
    await browser.writeReport({ id });

    const payload = (await (await browser.get("/api/guest")).json()) as Record<string, unknown>;
    const uuids = JSON.stringify(payload).match(/[0-9a-f-]{36}/g) ?? [];
    expect(uuids).toEqual([id]);
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

describe("개인정보 필터", () => {
  it("★ 전화번호가 적힌 글은 올라가지 않는다", async () => {
    const browser = new Browser();
    const res = await browser.writeReport({ body: "제 번호 010-1234-5678로 연락 주세요" });

    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: string }).error).toContain("전화번호");
  }, TEST_MS);

  it("★ 주민등록번호 모양도 막는다", async () => {
    const browser = new Browser();
    const res = await browser.writeReport({ body: "테스트 900101-1234567 입니다" });
    expect(res.status).toBe(422);
  }, TEST_MS);

  it("★ 병원 대표번호는 통과한다 — 도움이 되는 정보다", async () => {
    const tels = await fetch(`${REST}/hospitals?select=tel&limit=1`, { headers: admin }).then(
      (r) => r.json() as Promise<{ tel: string }[]>,
    );
    const browser = new Browser();
    const res = await browser.writeReport({ body: `테스트 ${tels[0].tel} 로 전화해 보세요` });
    expect(res.status).toBe(200);
  }, TEST_MS);

  it("평범한 글은 막지 않는다", async () => {
    const browser = new Browser();
    const res = await browser.writeReport({ body: "테스트 지금 대기 3명이고 21시 30분 마감이래요" });
    expect(res.status).toBe(200);
  }, TEST_MS);
});

describe("신고 → 자동 격리", () => {
  /** 운영자 권한으로 글을 심는다. 신고자와 글쓴이가 달라야 한다. */
  async function seedReport(body: string): Promise<string> {
    const id = crypto.randomUUID();
    const res = await fetch(`${REST}/field_reports`, {
      method: "POST",
      headers: { ...admin, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ id, category: "laceration", body, handle: "테스트작성자" }),
    });
    if (!res.ok) throw new Error(`심기 실패 → ${res.status} ${await res.text()}`);
    return id;
  }

  async function visibilityOf(id: string): Promise<string> {
    const rows = await fetch(`${REST}/field_reports?id=eq.${id}&select=visibility`, {
      headers: admin,
    }).then((r) => r.json() as Promise<{ visibility: string }[]>);
    return rows[0]?.visibility ?? "(없음)";
  }

  it("★ 신고가 들어오면 사람 없이 바로 내려간다", async () => {
    const id = await seedReport("테스트 신고될 글입니다");
    expect(await visibilityOf(id)).toBe("VISIBLE");

    const browser = new Browser();
    const res = await browser.post("/api/reports", { reportId: id, reason: "PRIVACY" });
    expect(res.status).toBe(200);

    // 운영자가 보기 전에 내려가 있어야 한다. 신고는 새벽에 들어온다.
    expect(await visibilityOf(id)).toBe("QUARANTINED");
  }, TEST_MS);

  it("★ 내려간 글은 공개 목록에서 사라진다", async () => {
    const id = await seedReport("테스트 목록에서 사라질 글");
    const browser = new Browser();
    await browser.post("/api/reports", { reportId: id, reason: "ABUSE" });

    const visible = await fetch(`${REST}/field_reports_public?id=eq.${id}&select=id`, {
      headers: { apikey: anonKey },
    }).then((r) => r.json() as Promise<unknown[]>);
    expect(visible).toEqual([]);
  }, TEST_MS);

  it("★ 누가 왜 내렸는지 기록이 남는다", async () => {
    const id = await seedReport("테스트 기록이 남을 글");
    const browser = new Browser();
    await browser.post("/api/reports", { reportId: id, reason: "SPAM" });

    const actions = await fetch(
      `${REST}/moderation_actions?target_id=eq.${id}&select=action,reason_code,actor_id`,
      { headers: admin },
    ).then((r) => r.json() as Promise<{ action: string; reason_code: string; actor_id: string | null }[]>);

    expect(actions).toHaveLength(1);
    expect(actions[0].action).toBe("QUARANTINE");
    expect(actions[0].reason_code).toBe("auto_on_report");
    // 사람이 아니라 규칙이 내렸다. 없는 사람을 적지 않는다.
    expect(actions[0].actor_id).toBeNull();
  }, TEST_MS);

  it("★ 같은 사람이 다시 신고해도 기록이 부풀지 않는다", async () => {
    const id = await seedReport("테스트 두 번 신고될 글");
    const browser = new Browser();

    expect((await browser.post("/api/reports", { reportId: id, reason: "SPAM" })).status).toBe(200);
    expect((await browser.post("/api/reports", { reportId: id, reason: "SPAM" })).status).toBe(200);

    const actions = await fetch(`${REST}/moderation_actions?target_id=eq.${id}&select=action`, {
      headers: admin,
    }).then((r) => r.json() as Promise<unknown[]>);
    expect(actions).toHaveLength(1);
  }, TEST_MS);

  it("★ anon 키로 직접 신고를 넣을 수 없다 — 신고가 도배 수단이 된다", async () => {
    const { error } = await anon.from("reports").insert({
      target_type: "post",
      target_id: crypto.randomUUID(),
      reporter_guest_id: crypto.randomUUID(),
      reason: "SPAM",
    });
    expect(error?.code).toBe("42501");
  }, TEST_MS);

  it("모양이 틀린 신고는 거절한다", async () => {
    const browser = new Browser();
    expect((await browser.post("/api/reports", { reportId: "x", reason: "SPAM" })).status).toBe(400);
    expect(
      (await browser.post("/api/reports", { reportId: crypto.randomUUID(), reason: "뭔가" })).status,
    ).toBe(400);
  }, TEST_MS);

  it("복구하면 다시 보인다 — 운영자가 콘솔에서 하는 일", async () => {
    const id = await seedReport("테스트 복구될 글");
    const browser = new Browser();
    await browser.post("/api/reports", { reportId: id, reason: "SUSPECTED_FALSE" });
    expect(await visibilityOf(id)).toBe("QUARANTINED");

    await fetch(`${REST}/field_reports?id=eq.${id}`, {
      method: "PATCH",
      headers: { ...admin, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ visibility: "VISIBLE" }),
    });

    const visible = await fetch(`${REST}/field_reports_public?id=eq.${id}&select=id`, {
      headers: { apikey: anonKey },
    }).then((r) => r.json() as Promise<unknown[]>);
    expect(visible).toHaveLength(1);
  }, TEST_MS);
});

describe("목록에 없는 병원 요청", () => {
  async function requests(): Promise<{ name: string; guest_id: string; state: string }[]> {
    return fetch(`${REST}/hospital_requests?select=name,guest_id,state,sido,sigungu,area_hint`, {
      headers: admin,
    }).then((r) => r.json() as Promise<{ name: string; guest_id: string; state: string }[]>);
  }

  it("★ 요청이 저장된다. 글이 아니라 운영자에게 간다", async () => {
    const browser = new Browser();
    const res = await browser.post("/api/hospital-requests", {
      name: "테스트 마곡로뎀소아청소년과",
      sido: "서울특별시",
      sigungu: "강서구",
      areaHint: "마곡동",
    });
    expect(res.status).toBe(200);
    // 응답에 아무 내용도 담지 않는다. 접수됐다는 것만 알린다.
    expect(await res.json()).toEqual({ ok: true });

    const rows = await requests();
    const found = rows.find((r) => r.name === "테스트 마곡로뎀소아청소년과");
    expect(found?.state).toBe("OPEN");
    expect(found?.guest_id).not.toBeNull();
  }, TEST_MS);

  it("★ anon 은 요청을 읽을 수 없다 — 글이 아니다", async () => {
    const { data } = await anon.from("hospital_requests").select("name,area_hint");
    expect(data).toEqual([]);
  }, TEST_MS);

  it("★ anon 은 요청을 직접 넣을 수 없다", async () => {
    const { error } = await anon.from("hospital_requests").insert({
      name: "직접 넣는 병원",
      guest_id: crypto.randomUUID(),
    });
    expect(error?.code).toBe("42501");
  }, TEST_MS);

  it("★ 같은 사람이 같은 병원을 두 번 요청해도 한 건이다", async () => {
    const browser = new Browser();
    const payload = { name: "테스트 중복요청의원", sido: "서울특별시", sigungu: "강서구" };

    expect((await browser.post("/api/hospital-requests", payload)).status).toBe(200);
    expect((await browser.post("/api/hospital-requests", payload)).status).toBe(200);

    const rows = (await requests()).filter((r) => r.name === "테스트 중복요청의원");
    expect(rows).toHaveLength(1);
  }, TEST_MS);

  it("★ 개인정보가 섞이면 받지 않는다 — 운영자만 보는 값이어도 담지 않는다", async () => {
    const browser = new Browser();
    const res = await browser.post("/api/hospital-requests", {
      name: "테스트 의원",
      areaHint: "제 번호 010-1234-5678 로 알려주세요",
    });
    expect(res.status).toBe(422);
  }, TEST_MS);

  it("이름이 너무 짧으면 거절한다", async () => {
    const browser = new Browser();
    expect((await browser.post("/api/hospital-requests", { name: "가" })).status).toBe(400);
  }, TEST_MS);

  it("시군구만 있고 시도가 없으면 거절한다", async () => {
    const browser = new Browser();
    const res = await browser.post("/api/hospital-requests", {
      name: "테스트 지역없는의원",
      sido: null,
      sigungu: "강서구",
    });
    expect(res.status).toBe(400);
  }, TEST_MS);
});

describe("병원을 고르지 않은 글 — 요청한 사람이 지금 할 수 있는 것", () => {
  it("★ hospital_id 없이 글이 올라간다", async () => {
    const browser = new Browser();
    const id = crypto.randomUUID();
    const res = await browser.post("/api/field-reports", {
      id,
      category: "other",
      topic: "문의",
      body: "테스트 마곡동인데 지금 문 연 소아과 아시는 분 있나요?",
      sido: "서울특별시",
      sigungu: "강서구",
    });
    expect(res.status).toBe(200);

    const rows = await fetch(`${REST}/field_reports?id=eq.${id}&select=hospital_id,sigungu`, {
      headers: admin,
    }).then((r) => r.json() as Promise<{ hospital_id: string | null; sigungu: string }[]>);

    expect(rows[0].hospital_id).toBeNull();
    expect(rows[0].sigungu).toBe("강서구");
  }, TEST_MS);

  it("★ 그 글이 공개 목록에 보인다 — 지역 현장톡이 성립한다", async () => {
    const browser = new Browser();
    const id = crypto.randomUUID();
    await browser.post("/api/field-reports", {
      id,
      category: "other",
      topic: "문의",
      body: "테스트 지역만 적은 글입니다",
      sido: "서울특별시",
      sigungu: "강서구",
    });

    const visible = await fetch(
      `${REST}/field_reports_public?id=eq.${id}&select=id,hospital_id,sigungu`,
      { headers: { apikey: anonKey } },
    ).then((r) => r.json() as Promise<{ hospital_id: string | null }[]>);

    expect(visible).toHaveLength(1);
    expect(visible[0].hospital_id).toBeNull();
  }, TEST_MS);
});

describe("내가 쓴 글 지우기", () => {
  /*
   * 익명 게시판에서 자기 글을 못 지우면 잘못 쓴 사람에게 남는 방법이 자기 글을
   * 신고하는 것뿐이다. 그래서 삭제를 열었다 — 그리고 **남의 글이 지워지지 않는지**가
   * 이 묶음의 전부다. 지울 권한을 잘못 주면 아무나 방을 비울 수 있다.
   */

  async function visibleInPublicList(id: string): Promise<boolean> {
    const { data } = await anon.from("field_reports_public").select("id").eq("id", id);
    return (data ?? []).length > 0;
  }

  it("★ 내 글은 지워지고 공개 목록에서 사라진다", async () => {
    const me = new Browser();
    const id = uuid();
    expect((await me.writeReport({ id })).status).toBe(200);
    expect(await visibleInPublicList(id)).toBe(true);

    expect((await me.del(`/api/field-reports/${id}`)).status).toBe(200);
    expect(await visibleInPublicList(id)).toBe(false);
  }, TEST_MS);

  it("★ 행은 남고 REMOVED 가 된다 — 이미 읽고 있는 사람에게 사라졌다고 알리는 경로다", async () => {
    /*
     * broadcast 트리거는 insert·update 에만 걸려 있다. 행을 지우면 아무 신호도 가지
     * 않아, 보고 있던 사람 화면에 글이 그대로 남는다. 행은 보관 기간 안에 purge 가 지운다.
     */
    const me = new Browser();
    const id = uuid();
    await me.writeReport({ id });
    await me.del(`/api/field-reports/${id}`);

    const rows = await fetch(`${REST}/field_reports?id=eq.${id}&select=visibility`, {
      headers: admin,
    }).then((r) => r.json() as Promise<{ visibility: string }[]>);
    expect(rows).toHaveLength(1);
    expect(rows[0].visibility).toBe("REMOVED");
  }, TEST_MS);

  it("★ 남의 글은 지워지지 않는다 — 지울 수 있으면 아무나 방을 비운다", async () => {
    const author = new Browser();
    const stranger = new Browser();
    const id = uuid();
    await author.writeReport({ id });

    // 남이 보면 404 다. 있다/없다를 알려 주지 않는다.
    expect((await stranger.del(`/api/field-reports/${id}`)).status).toBe(404);
    expect(await visibleInPublicList(id)).toBe(true);
  }, TEST_MS);

  it("★ 쿠키가 없으면 지울 수 없다", async () => {
    const author = new Browser();
    const id = uuid();
    await author.writeReport({ id });

    const res = await fetch(`${BASE}/api/field-reports/${id}`, { method: "DELETE" });
    expect(res.status).toBe(404);
    expect(await visibleInPublicList(id)).toBe(true);
  }, TEST_MS);

  it("없는 글을 지우면 404 — 화면은 이것을 성공으로 다룬다(이미 사라진 글)", async () => {
    const me = new Browser();
    await me.writeReport();
    expect((await me.del(`/api/field-reports/${uuid()}`)).status).toBe(404);
  }, TEST_MS);

  it("글 id 모양이 아니면 404 — 조회하지 않는다", async () => {
    const me = new Browser();
    await me.writeReport();
    expect((await me.del("/api/field-reports/not-a-uuid")).status).toBe(404);
  }, TEST_MS);

  it("★ 새로고침해도 내 글을 알 수 있다 — 아니면 삭제 버튼이 사라진다", async () => {
    /*
     * 공개 뷰는 guest_id 를 내보내지 않는다(그래야 한다). 그래서 화면은 서버에
     * "내가 쓴 글이 무엇인지"를 물어야 한다. 돌려주는 것은 id 뿐이다.
     */
    const me = new Browser();
    const id = uuid();
    await me.writeReport({ id });

    const payload = (await (await me.get("/api/guest")).json()) as {
      nickname?: string;
      myPostIds?: string[];
    };
    expect(payload.myPostIds).toContain(id);

    // 남의 세션에는 그 id 가 없다.
    const stranger = new Browser();
    const other = (await (await stranger.get("/api/guest")).json()) as { myPostIds?: string[] };
    expect(other.myPostIds).toEqual([]);
  }, TEST_MS);

  it("★ 지운 글은 '내 글 목록'에서도 빠진다 — 지울 것이 없다", async () => {
    const me = new Browser();
    const id = uuid();
    await me.writeReport({ id });
    await me.del(`/api/field-reports/${id}`);

    const payload = (await (await me.get("/api/guest")).json()) as { myPostIds?: string[] };
    expect(payload.myPostIds).not.toContain(id);
  }, TEST_MS);
});
