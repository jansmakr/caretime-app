import { spawn, type ChildProcess } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requireLocalKeys } from "../vitest.setup";

/**
 * 출시 전 공개 기간에 **서버가 쓰기를 받지 않는가.**
 *
 * 왜 필요한가: 배포와 방침 시행일 사이에 며칠이 비는 일정이다. 그 사이에 글이
 * 들어오면 그 수집은 근거가 없고, 그때 만들어진 세션은 동의 기록(policy_version)이
 * 없는 채로 남는다. 주소를 아는 사람은 들어올 수 있으니 noindex 로는 못 막는다.
 *
 * 화면 플래그(NEXT_PUBLIC_FIELD_TALK_LIVE)로는 **화면만** 닫힌다. 그 값은 빌드에
 * 박히고, 요청 모양을 아는 사람에게는 아무 의미가 없다 — anon 키에서 이미 겪은 실수다.
 * 그래서 서버 전용 변수(CARETIME_WRITES)를 서버가 요청마다 읽는다.
 *
 * `npm run build` 가 먼저 돌아 있어야 한다. 같은 빌드에 환경변수만 다르게 띄운다.
 */

const { url, serviceKey } = requireLocalKeys();
const REST = `${url}/rest/v1`;
const admin = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
const PORT = 3125;
const BASE = `http://127.0.0.1:${PORT}`;
const TEST_MS = 60_000;

let server: ChildProcess | null = null;
const uuid = () => crypto.randomUUID();

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function countReports(): Promise<number> {
  const res = await fetch(`${REST}/field_reports?select=id`, {
    headers: { ...admin, Prefer: "count=exact" },
  });
  return ((await res.json()) as unknown[]).length;
}

beforeAll(async () => {
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], {
    cwd: process.cwd(),
    stdio: "ignore",
    // 같은 빌드다. 이 변수만 다르게 준다.
    env: { ...process.env, CARETIME_WRITES: "closed" },
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
}, TEST_MS);

afterAll(() => {
  server?.kill();
});

describe("쓰기가 닫혀 있을 때", () => {
  it("★ 글을 받지 않는다 (503)", async () => {
    const before = await countReports();
    const res = await post("/api/field-reports", {
      id: uuid(),
      category: "laceration",
      body: "닫혀 있는데 들어오는 글",
    });

    expect(res.status).toBe(503);
    // 거절했다고 적는 것으로 끝나면 안 된다. 실제로 안 들어갔는지 센다.
    expect(await countReports()).toBe(before);
  }, TEST_MS);

  it("★ 반응을 받지 않는다 (503)", async () => {
    const res = await post("/api/field-reports/reactions", { reportId: uuid(), key: "low_wait" });
    expect(res.status).toBe(503);
  }, TEST_MS);

  it("★ 의료기관 추가 요청을 받지 않는다 (503)", async () => {
    const res = await post("/api/hospital-requests", { name: "닫힘테스트의원" });
    expect(res.status).toBe(503);
  }, TEST_MS);

  it("★ 신고를 받지 않는다 (503)", async () => {
    const res = await post("/api/reports", { reportId: uuid(), reason: "SPAM" });
    expect(res.status).toBe(503);
  }, TEST_MS);

  it("★ 세션을 만들지 않는다 — 쿠키도 주지 않는다", async () => {
    /*
     * 이 경로는 화면이 마운트될 때 불린다. 세션을 만들면 출시 전에 들어온 사람마다
     * 행이 생기고, 그 세션들은 시행 전이라 동의 기록이 없는 채로 남는다.
     */
    const res = await fetch(`${BASE}/api/guest`);
    const payload = (await res.json()) as { nickname: string | null; myPostIds: string[] };

    expect(res.status).toBe(200);
    expect(payload.nickname).toBeNull();
    expect(payload.myPostIds).toEqual([]);
    expect(res.headers.getSetCookie?.() ?? []).toEqual([]);
  }, TEST_MS);

  it("★ 자기 글 삭제는 막지 않는다 — 문을 닫는 것이 글을 가두는 일이 되면 안 된다", async () => {
    /*
     * 없는 글이라 404 다. 중요한 것은 **503 이 아니라는 것** — 이 경로는 게이트에
     * 걸리지 않는다. 검증 기간에 올린 글을 작성자가 지울 수 있어야 한다.
     */
    const res = await fetch(`${BASE}/api/field-reports/${uuid()}`, { method: "DELETE" });
    expect(res.status).toBe(404);
  }, TEST_MS);

  it("읽기는 열려 있다 — 화면은 띄워서 확인할 수 있어야 한다", async () => {
    for (const path of ["/", "/chat", "/search"]) {
      const res = await fetch(`${BASE}${path}`);
      expect(res.status, path).toBe(200);
    }
  }, TEST_MS);
});
