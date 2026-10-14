import { spawn, type ChildProcess } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requireLocalKeys } from "../vitest.setup";

/**
 * 의료기관 사전 신청 — **연락처가 들어오는 유일한 경로**다.
 *
 * 다른 쓰기 경로는 전화번호가 보이면 막는다. 여기는 막지 않는다(연락처가 목적이다).
 * 그래서 막는 대신 다른 것을 지키고, 그 '다른 것'을 여기서 고정한다.
 *
 *   · 동의 없이는 저장되지 않는다 — 서버가 보고, DB 도 본다
 *   · 저장된 값이 **공개로 새지 않는다** — anon 이 0행을 본다
 *   · 응답에 적은 값이 돌아오지 않는다
 *   · 도배가 막힌다
 *
 * `npm run build` 가 먼저 돌아 있어야 한다.
 */

const { url, anonKey, serviceKey } = requireLocalKeys();
const REST = `${url}/rest/v1`;
const admin = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
const PORT = 3125;
const BASE = `http://127.0.0.1:${PORT}`;
const TEST_MS = 60_000;

const MARK = "테스트의원";
let server: ChildProcess | null = null;

async function wipe(): Promise<void> {
  const res = await fetch(`${REST}/partner_inquiries?hospital_name=like.*${encodeURIComponent(MARK)}*`, {
    method: "DELETE",
    headers: admin,
  });
  // 조용히 실패하면 다음 실행이 남은 행 때문에 깨진다. 소리 내어 실패한다.
  if (!res.ok && res.status !== 404) throw new Error(`정리 실패: ${res.status}`);
}

/** 화면이 보내는 것과 같은 모양으로 보낸다. 쿠키는 이어 쓴다(같은 세션으로 세야 한다). */
async function send(
  body: Record<string, unknown>,
  cookie?: string,
): Promise<{ status: number; json: Record<string, unknown>; cookie: string | undefined }> {
  const res = await fetch(`${BASE}/api/partner-inquiries`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
  const setCookie = res.headers.get("set-cookie");
  return {
    status: res.status,
    json: (await res.json().catch(() => ({}))) as Record<string, unknown>,
    cookie: setCookie ? setCookie.split(";")[0] : cookie,
  };
}

beforeAll(async () => {
  await wipe();
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], {
    cwd: process.cwd(),
    stdio: "ignore",
    env: { ...process.env },
  });

  const deadline = Date.now() + 40_000;
  for (;;) {
    if (Date.now() > deadline) throw new Error("서버가 뜨지 않았습니다. npm run build 를 먼저 돌려 주세요.");
    try {
      const res = await fetch(`${BASE}/`, { redirect: "manual" });
      if (res.status < 500) break;
    } catch {
      // 아직 안 떴다.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}, TEST_MS);

afterAll(async () => {
  server?.kill();
  await wipe();
});

describe("동의", () => {
  it("★ 동의 없이는 저장되지 않는다 — 422 이고 행이 안 생긴다", async () => {
    const { status } = await send({
      hospitalName: `${MARK}동의없음`,
      contact: "02-000-0000",
      consented: false,
    });
    expect(status).toBe(422);

    const rows = await read(`hospital_name=eq.${MARK}동의없음`);
    expect(rows).toHaveLength(0);
  }, TEST_MS);

  it("★ consented 를 아예 안 보내도 거절한다 — 없는 값이 true 가 되지 않는다", async () => {
    const { status } = await send({ hospitalName: `${MARK}무필드`, contact: "a@b.com" });
    expect(status).toBe(422);
    expect(await read(`hospital_name=eq.${MARK}무필드`)).toHaveLength(0);
  }, TEST_MS);

  it("★ DB 도 막는다 — 서버를 거치지 않아도 false 는 들어가지 않는다", async () => {
    /*
     * 화면과 서버가 막아도, 키를 가진 쪽이 직접 넣을 수 있다. 그때를 위해 제약을
     * 걸어 두었다. 이 테스트가 깨지면 "동의 없이 보관한 행"이 생길 수 있다는 뜻이다.
     */
    const res = await fetch(`${REST}/partner_inquiries`, {
      method: "POST",
      headers: { ...admin, "Content-Type": "application/json" },
      body: JSON.stringify({ hospital_name: `${MARK}직접`, contact: "x", consented: false }),
    });
    expect(res.ok).toBe(false);
    expect(await read(`hospital_name=eq.${MARK}직접`)).toHaveLength(0);
  }, TEST_MS);
});

describe("접수", () => {
  it("★ 동의하면 저장된다. 응답에는 적은 값이 돌아오지 않는다", async () => {
    const { status, json } = await send({
      hospitalName: `${MARK}정상`,
      contact: "02-1234-5678",
      message: "안내 부탁드립니다",
      consented: true,
    });
    expect(status).toBe(200);
    expect(json).toEqual({ ok: true });
    // 적은 값이 응답에 없다 — 있으면 로그·히스토리에 한 번 더 남는다.
    expect(JSON.stringify(json)).not.toContain("1234");
    expect(JSON.stringify(json)).not.toContain(MARK);

    const rows = await read(`hospital_name=eq.${MARK}정상`);
    expect(rows).toHaveLength(1);
    expect(rows[0].consented).toBe(true);
    expect(rows[0].state).toBe("NEW");
  }, TEST_MS);

  it("★ 연락처를 개인정보 필터로 막지 않는다 — 여기서는 연락처가 목적이다", async () => {
    /*
     * 글·병원 요청이었다면 010 번호는 422 다. 이 폼은 병원 담당자가 자기 연락처를
     * 스스로 적는 자리라 막으면 아무 일도 못 한다. 그 차이를 고정한다.
     */
    const { status } = await send({
      hospitalName: `${MARK}휴대폰`,
      contact: "010-1234-5678",
      consented: true,
    });
    expect(status).toBe(200);
    expect(await read(`hospital_name=eq.${MARK}휴대폰`)).toHaveLength(1);
  }, TEST_MS);

  it("빈 병원명·빈 연락처는 400", async () => {
    expect((await send({ hospitalName: " ", contact: "a@b.com", consented: true })).status).toBe(400);
    expect((await send({ hospitalName: `${MARK}빈연락처`, contact: "", consented: true })).status).toBe(400);
  }, TEST_MS);
});

describe("새지 않는다", () => {
  it("★ anon 키로는 한 행도 보이지 않는다 — 공개 뷰도 없다", async () => {
    const res = await fetch(`${REST}/partner_inquiries?select=*`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    });
    /*
     * 정책이 하나도 없으므로 RLS 가 전부 막는다. 200 + 0행이거나 권한 오류다 —
     * 어느 쪽이든 **내용이 나오지 않는 것**이 지켜야 할 것이다.
     */
    if (res.ok) {
      expect(await res.json()).toEqual([]);
    } else {
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
  }, TEST_MS);
});

describe("도배", () => {
  it("★ 같은 세션이 시간당 다섯 건을 넘기면 429", async () => {
    let cookie: string | undefined;
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) {
      const out = await send(
        { hospitalName: `${MARK}도배${i}`, contact: `c${i}@x.com`, consented: true },
        cookie,
      );
      cookie = out.cookie;
      codes.push(out.status);
    }
    expect(codes.filter((c) => c === 200).length).toBeLessThanOrEqual(5);
    expect(codes).toContain(429);
  }, TEST_MS);
});

async function read(filter: string): Promise<{ consented: boolean; state: string }[]> {
  const res = await fetch(`${REST}/partner_inquiries?${filter}&select=consented,state`, {
    headers: admin,
  });
  return (await res.json()) as { consented: boolean; state: string }[];
}
