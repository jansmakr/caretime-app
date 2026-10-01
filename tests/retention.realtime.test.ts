import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { RETENTION_DAYS } from "@/features/p0/retention";
import { requireLocalKeys } from "../vitest.setup";

/**
 * 실제로 지워지는가.
 *
 * 방침에 "N일 후 삭제"라고 쓰고 실제로 안 지우면 그 자체가 위반이다. 그래서 두 가지를
 * 고정한다 — **문서에 쓸 숫자와 코드가 같은가**, 그리고 **그 숫자대로 정말 지워지는가**.
 *
 * 공개 중단은 여전히 읽는 시점에 판정한다. 이 삭제는 **이미 보이지 않는 것을 지우는**
 * 일이라, 하루 멈춰도 사용자에게 보이는 것은 바뀌지 않는다.
 */

const { url, anonKey, serviceKey } = requireLocalKeys();
const REST = `${url}/rest/v1`;
const admin = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
const TEST_MS = 30_000;

let db: SupabaseClient;
const DAY_MS = 24 * 60 * 60_000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString();

async function sql<T>(path: string): Promise<T> {
  const res = await fetch(`${REST}/${path}`, { headers: admin });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

async function purge(): Promise<Record<string, number>> {
  const { data, error } = await db.rpc("purge_expired", { p_limit: 5000 });
  if (error) throw new Error(`purge_expired 실패: ${error.message}`);
  const rows = (data ?? []) as { purged_subject: string; purged_count: number }[];
  return Object.fromEntries(rows.map((r) => [r.purged_subject, r.purged_count]));
}

/** 세션 하나. 글·요청·신고의 주체가 된다. */
async function makeSession(lastSeenDaysAgo = 0): Promise<string> {
  const res = await fetch(`${REST}/guest_sessions`, {
    method: "POST",
    headers: { ...admin, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      token_hash: `retention-${Math.random().toString(36).slice(2)}`,
      nickname: "보관테스트",
      expires_at: new Date(Date.now() + 30 * DAY_MS).toISOString(),
      last_seen_at: daysAgo(lastSeenDaysAgo),
    }),
  });
  if (!res.ok) throw new Error(`세션 생성 실패 → ${await res.text()}`);
  return ((await res.json()) as { id: string }[])[0].id;
}

async function makeReport(guestId: string | null, createdDaysAgo: number): Promise<string> {
  const res = await fetch(`${REST}/field_reports`, {
    method: "POST",
    headers: { ...admin, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      category: "laceration",
      body: `보관테스트 ${Math.random().toString(36).slice(2, 8)}`,
      handle: "보관테스트",
      guest_id: guestId,
      created_at: daysAgo(createdDaysAgo),
    }),
  });
  if (!res.ok) throw new Error(`글 생성 실패 → ${await res.text()}`);
  return ((await res.json()) as { id: string }[])[0].id;
}

beforeAll(() => {
  db = createClient(url, serviceKey, { auth: { persistSession: false } });
});

afterEach(async () => {
  for (const path of [
    "field_reports?handle=eq.보관테스트",
    "hospital_requests?name=like.*보관테스트*",
    "guest_sessions?nickname=eq.보관테스트",
  ]) {
    await fetch(`${REST}/${encodeURI(path)}`, { method: "DELETE", headers: admin });
  }
});

describe("방침에 쓸 숫자와 코드가 같다", () => {
  it("★ TS 상수와 DB 표가 한 글자도 다르지 않다", async () => {
    const rows = await sql<{ subject: string; keep_days: number }[]>(
      "retention_policy?select=subject,keep_days",
    );
    const fromDb = Object.fromEntries(rows.map((r) => [r.subject, r.keep_days]));

    /*
     * 갈라지면 방침에 적은 시점과 실제로 지우는 시점이 달라진다. 그게 위반이다.
     * 기간을 바꿀 때는 migration 과 features/p0/retention.ts 를 함께 고쳐야 한다.
     */
    expect(fromDb).toEqual({ ...RETENTION_DAYS });
  }, TEST_MS);

  it("기준이 무엇인지도 표에 적혀 있다 — 방침 문구에 그대로 쓴다", async () => {
    const rows = await sql<{ subject: string; basis: string; note: string }[]>(
      "retention_policy?select=subject,basis,note",
    );
    for (const row of rows) {
      expect(row.basis.length, row.subject).toBeGreaterThan(1);
      expect(row.note.length, row.subject).toBeGreaterThan(10);
    }
  }, TEST_MS);
});

describe("현장톡 글", () => {
  it("★ 기간이 지난 글은 지워진다", async () => {
    const old = await makeReport(null, RETENTION_DAYS.field_reports + 1);
    await purge();
    expect(await sql<unknown[]>(`field_reports?id=eq.${old}&select=id`)).toEqual([]);
  }, TEST_MS);

  it("★ 기간 안의 글은 남는다", async () => {
    const fresh = await makeReport(null, RETENTION_DAYS.field_reports - 1);
    await purge();
    expect(await sql<unknown[]>(`field_reports?id=eq.${fresh}&select=id`)).toHaveLength(1);
  }, TEST_MS);

  it("★ 처리 중인 신고가 걸린 글은 기간이 지나도 남는다 — 분쟁 중 증거가 사라지면 안 된다", async () => {
    const reporter = await makeSession();
    const old = await makeReport(null, RETENTION_DAYS.field_reports + 5);

    const res = await fetch(`${REST}/reports`, {
      method: "POST",
      headers: { ...admin, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        target_type: "post",
        target_id: old,
        reporter_guest_id: reporter,
        reason: "PRIVACY",
      }),
    });
    if (!res.ok) throw new Error(await res.text());

    await purge();
    expect(await sql<unknown[]>(`field_reports?id=eq.${old}&select=id`)).toHaveLength(1);

    // 신고가 끝나면 다음 실행이 지운다.
    await fetch(`${REST}/reports?target_id=eq.${old}`, {
      method: "PATCH",
      headers: { ...admin, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ state: "DISMISSED" }),
    });
    await purge();
    expect(await sql<unknown[]>(`field_reports?id=eq.${old}&select=id`)).toEqual([]);

    await fetch(`${REST}/reports?target_id=eq.${old}`, { method: "DELETE", headers: admin });
    await fetch(`${REST}/guest_sessions?id=eq.${reporter}`, { method: "DELETE", headers: admin });
  }, TEST_MS);
});

describe("게스트 세션 — 글은 남고 연결만 끊긴다", () => {
  it("★ 오래 안 쓴 세션은 지워지고, 그 세션이 쓴 글은 남는다", async () => {
    const session = await makeSession(RETENTION_DAYS.guest_sessions + 1);
    // 글은 기간 안이라 지워지지 않아야 한다.
    const post = await makeReport(session, 1);

    await purge();

    expect(await sql<unknown[]>(`guest_sessions?id=eq.${session}&select=id`)).toEqual([]);

    const rows = await sql<{ id: string; guest_id: string | null }[]>(
      `field_reports?id=eq.${post}&select=id,guest_id`,
    );
    expect(rows).toHaveLength(1);
    // 연결만 끊긴다. 글은 그 자체로 다른 보호자에게 쓸모가 있다.
    expect(rows[0].guest_id).toBeNull();
  }, TEST_MS);

  it("★ 최근에 쓴 세션은 남는다 — 별명이 바뀌면 '아까 그 사람'이 깨진다", async () => {
    const session = await makeSession(1);
    await purge();
    expect(await sql<unknown[]>(`guest_sessions?id=eq.${session}&select=id`)).toHaveLength(1);
  }, TEST_MS);

  it("★ 세션 삭제가 실패하지 않는다 — 반응이 달려 있어도", async () => {
    /*
     * 전에는 field_report_reactions.guest_id 가 `on delete set null` 인데 컬럼이
     * NOT NULL 이어서 세션 삭제 자체가 실패했다. 그러면 세션 정리가 영원히 안 돈다.
     */
    const session = await makeSession(RETENTION_DAYS.guest_sessions + 1);
    const post = await makeReport(null, 1);

    const res = await fetch(`${REST}/field_report_reactions`, {
      method: "POST",
      headers: { ...admin, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ report_id: post, key: "low_wait", guest_id: session }),
    });
    if (!res.ok) throw new Error(await res.text());

    await purge();

    expect(await sql<unknown[]>(`guest_sessions?id=eq.${session}&select=id`)).toEqual([]);
    // 반응은 세션과 함께 사라진다. 공개되는 것은 익명 합계뿐이고 글은 이미 공개 기간이 지났다.
    expect(await sql<unknown[]>(`field_report_reactions?report_id=eq.${post}&select=key`)).toEqual([]);
  }, TEST_MS);
});

describe("의료기관 추가 요청 — 세션보다 오래 남는다", () => {
  it("★ 세션이 지워져도 요청은 남는다. 다음 지역 판단 근거다", async () => {
    const session = await makeSession(RETENTION_DAYS.guest_sessions + 1);
    const res = await fetch(`${REST}/hospital_requests`, {
      method: "POST",
      headers: { ...admin, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ name: "보관테스트의원", guest_id: session }),
    });
    if (!res.ok) throw new Error(await res.text());
    const id = ((await res.json()) as { id: string }[])[0].id;

    await purge();

    const rows = await sql<{ guest_id: string | null }[]>(
      `hospital_requests?id=eq.${id}&select=guest_id`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].guest_id).toBeNull();
  }, TEST_MS);
});

describe("권한", () => {
  it("★ anon 은 삭제 함수를 부를 수 없다 — 남의 글을 지우는 버튼이 된다", async () => {
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    const { error } = await anon.rpc("purge_expired", { p_limit: 10 });
    expect(error).not.toBeNull();
  }, TEST_MS);

  it("★ anon 은 보관 기간 표를 읽을 수 없다 (지금은 열지 않았다)", async () => {
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data } = await anon.from("retention_policy").select("subject,keep_days");
    expect(data).toEqual([]);
  }, TEST_MS);
});
