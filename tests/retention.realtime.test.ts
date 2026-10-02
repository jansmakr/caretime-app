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
/** 테스트가 만든 행만 골라 지우기 위한 표시. */
const MARK = "보관테스트";
const DAY_MS = 24 * 60 * 60_000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString();

async function sql<T>(path: string): Promise<T> {
  const res = await fetch(`${REST}/${path}`, { headers: admin });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

/** 미처리 신고 자동 종결. 크론이 삭제보다 한 시간 먼저 부른다. */
async function closeStale(): Promise<number> {
  const { data, error } = await db.rpc("close_stale_reports", { p_limit: 1000 });
  if (error) throw new Error(`close_stale_reports 실패: ${error.message}`);
  return (data ?? 0) as number;
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
      nickname: MARK,
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

/** 신고 한 건. 글이 없는 id 를 겨냥해도 된다 — 여기서 보는 것은 보관 기간이다. */
async function makeAbuseReport(input: {
  state: "OPEN" | "REVIEWING" | "RESOLVED" | "DISMISSED";
  createdDaysAgo: number;
  reporter: string;
  targetId?: string;
}): Promise<string> {
  const res = await fetch(`${REST}/reports`, {
    method: "POST",
    headers: { ...admin, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      target_type: "post",
      target_id: input.targetId ?? crypto.randomUUID(),
      reporter_guest_id: input.reporter,
      reason: "SPAM",
      detail: MARK,
      state: input.state,
      created_at: daysAgo(input.createdDaysAgo),
    }),
  });
  if (!res.ok) throw new Error(`신고 생성 실패 → ${await res.text()}`);
  return ((await res.json()) as { id: string }[])[0].id;
}

/** 조치 기록 한 줄. reason_code 로 테스트 행만 골라 지운다. */
const ACTION_MARK = "retention-test";

async function makeModerationAction(createdDaysAgo: number): Promise<number> {
  const res = await fetch(`${REST}/moderation_actions`, {
    method: "POST",
    headers: { ...admin, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      target_type: "post",
      target_id: crypto.randomUUID(),
      action: "QUARANTINE",
      reason_code: ACTION_MARK,
      created_at: daysAgo(createdDaysAgo),
    }),
  });
  if (!res.ok) throw new Error(`조치 기록 생성 실패 → ${await res.text()}`);
  return ((await res.json()) as { id: number }[])[0].id;
}

/**
 * 관찰 한 건. 병원과 세션이 실제로 있어야 한다(둘 다 FK).
 * 병원 id 를 박아 두지 않고 하나 읽어 쓴다 — 시드가 바뀌어도 테스트가 살아 있게.
 */
async function someHospitalId(): Promise<string> {
  const rows = await sql<{ id: string }[]>("hospitals?select=id&limit=1");
  if (rows.length === 0) throw new Error("병원이 없습니다. npm run seed:localuser 를 먼저 돌려 주세요.");
  return rows[0].id;
}

async function makeObservation(input: {
  guestId: string;
  hospitalId: string;
  expiredDaysAgo: number;
}): Promise<string> {
  const expiresAt = daysAgo(input.expiredDaysAgo);
  const res = await fetch(`${REST}/observations`, {
    method: "POST",
    headers: { ...admin, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      hospital_id: input.hospitalId,
      category: "other",
      guest_id: input.guestId,
      metric: "queue",
      value: "3",
      // ttl 제약: expires_at > observed_at. 관찰은 만료보다 먼저 있었다.
      observed_at: daysAgo(input.expiredDaysAgo + 1),
      expires_at: expiresAt,
    }),
  });
  if (!res.ok) throw new Error(`관찰 생성 실패 → ${await res.text()}`);
  return ((await res.json()) as { id: string }[])[0].id;
}

beforeAll(() => {
  db = createClient(url, serviceKey, { auth: { persistSession: false } });
});

afterEach(async () => {
  for (const path of [
    `moderation_actions?reason_code=eq.${ACTION_MARK}`,
    "moderation_actions?reason_code=eq.auto_on_report",
    // 자동 종결 테스트가 남기는 기록.
    "moderation_actions?reason_code=eq.auto_dismiss_unreviewed",
    `reports?detail=eq.${MARK}`,
    `field_reports?handle=eq.${MARK}`,
    `hospital_requests?name=like.*${MARK}*`,
    // 세션을 지우면 그 세션의 관찰이 함께 지워진다(cascade). 마지막에 둔다.
    `guest_sessions?nickname=eq.${MARK}`,
  ]) {
    const res = await fetch(`${REST}/${encodeURI(path)}`, { method: "DELETE", headers: admin });
    /*
     * 정리가 실패하면 그 자리에서 터뜨린다. 조용히 넘기면 테스트 행이 쌓이고,
     * **그 더미가 버그를 가린다** — 신고한 사람의 세션이 안 지워지는 것을 이렇게
     * 늦게 봤다(migration 20261006). 정리 실패도 결함이다.
     */
    if (!res.ok) throw new Error(`정리 실패 ${path} → ${res.status} ${await res.text()}`);
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

  it("★ 신고한 사람의 세션도 지워진다 — 못 지우면 그날 삭제가 전부 멈춘다", async () => {
    /*
     * reports 는 신고자가 둘 중 하나여야 한다는 제약을 들고 있었고 FK 는 set null
     * 이었다. 그래서 신고를 한 번이라도 한 세션은 **지울 수 없었다** — 그리고
     * purge_expired() 는 세션을 한 문장으로 지우므로, 그런 세션 하나가 끼면 그날의
     * 삭제가 아무것도 안 됐다. 증상이 없는 고장이다(화면은 그대로다).
     */
    const session = await makeSession(RETENTION_DAYS.guest_sessions + 1);
    const reportId = await makeAbuseReport({ state: "OPEN", createdDaysAgo: 1, reporter: session });

    await purge();

    expect(await sql<unknown[]>(`guest_sessions?id=eq.${session}&select=id`)).toEqual([]);

    // 신고 기록은 남고 연결만 끊긴다. 글에서 쓰는 방식과 같다.
    const rows = await sql<{ reporter_guest_id: string | null }[]>(
      `reports?id=eq.${reportId}&select=reporter_guest_id`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].reporter_guest_id).toBeNull();
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

describe("신고 — 처리가 끝난 것만 지운다", () => {
  it("★ 처리가 끝난 신고는 기간이 지나면 지워진다", async () => {
    const reporter = await makeSession();
    const id = await makeAbuseReport({
      state: "DISMISSED",
      createdDaysAgo: RETENTION_DAYS.reports + 1,
      reporter,
    });

    await purge();

    expect(await sql<unknown[]>(`reports?id=eq.${id}&select=id`)).toEqual([]);
  }, TEST_MS);

  it("기간 안의 신고는 남는다 — 반복 신고자 판단에 필요하다", async () => {
    const reporter = await makeSession();
    const id = await makeAbuseReport({
      state: "RESOLVED",
      createdDaysAgo: RETENTION_DAYS.reports - 1,
      reporter,
    });

    await purge();

    expect(await sql<unknown[]>(`reports?id=eq.${id}&select=id`)).toHaveLength(1);
  }, TEST_MS);

  it("★ 미처리 신고는 삭제만으로는 사라지지 않는다 — 먼저 종결돼야 한다", async () => {
    /*
     * 지우는 조건에 state in ('RESOLVED','DISMISSED') 가 걸려 있다. 그래서 아무도
     * 확인하지 않은 신고는 purge 만으로는 1년이 지나도 남고, 그 신고가 걸린 글까지
     * 함께 남는다 — 분쟁 중 증거를 지키려고 만든 규칙이 반대로 작동한다.
     * 그 상한이 close_stale_reports() 다(아래 묶음).
     */
    const reporter = await makeSession();
    const id = await makeAbuseReport({
      state: "OPEN",
      createdDaysAgo: RETENTION_DAYS.reports + 30,
      reporter,
    });

    await purge();
    expect(await sql<unknown[]>(`reports?id=eq.${id}&select=id`)).toHaveLength(1);

    // 종결되면 같은 삭제 작업이 지운다.
    await closeStale();
    await purge();
    expect(await sql<unknown[]>(`reports?id=eq.${id}&select=id`)).toEqual([]);
  }, TEST_MS);
});

describe("미처리 신고 자동 종결 — 사람이 안 보면 영원히 남는 것을 막는다", () => {
  it("★ 90일이 지난 미처리 신고는 DISMISSED 가 된다", async () => {
    const reporter = await makeSession();
    const id = await makeAbuseReport({
      state: "OPEN",
      createdDaysAgo: RETENTION_DAYS.reports_unreviewed + 1,
      reporter,
    });

    await closeStale();

    const rows = await sql<{ state: string }[]>(`reports?id=eq.${id}&select=state`);
    expect(rows[0].state).toBe("DISMISSED");
  }, TEST_MS);

  it("★ '사람이 안 봐서 닫혔다'가 기록에 남는다 — 검토해서 기각한 것과 구분돼야 한다", async () => {
    const reporter = await makeSession();
    const targetId = crypto.randomUUID();
    const id = await makeAbuseReport({
      state: "REVIEWING",
      createdDaysAgo: RETENTION_DAYS.reports_unreviewed + 1,
      reporter,
      targetId,
    });

    await closeStale();

    const actions = await sql<{ action: string; reason_code: string; actor_id: string | null }[]>(
      `moderation_actions?report_id=eq.${id}&select=action,reason_code,actor_id`,
    );
    expect(actions).toHaveLength(1);
    expect(actions[0].action).toBe("DISMISS");
    expect(actions[0].reason_code).toBe("auto_dismiss_unreviewed");
    // 사람이 아니라 규칙이 닫았다. 자동 격리와 같은 방식이다.
    expect(actions[0].actor_id).toBeNull();

    await fetch(`${REST}/moderation_actions?report_id=eq.${id}`, {
      method: "DELETE",
      headers: admin,
    });
  }, TEST_MS);

  it("★ 90일 안의 미처리 신고는 건드리지 않는다", async () => {
    const reporter = await makeSession();
    const id = await makeAbuseReport({
      state: "OPEN",
      createdDaysAgo: RETENTION_DAYS.reports_unreviewed - 1,
      reporter,
    });

    await closeStale();

    const rows = await sql<{ state: string }[]>(`reports?id=eq.${id}&select=state`);
    expect(rows[0].state).toBe("OPEN");
  }, TEST_MS);

  it("★ 이미 사람이 처리한 신고를 다시 닫지 않는다 — 기록이 부풀면 안 된다", async () => {
    const reporter = await makeSession();
    const id = await makeAbuseReport({
      state: "RESOLVED",
      createdDaysAgo: RETENTION_DAYS.reports_unreviewed + 10,
      reporter,
    });

    await closeStale();

    const rows = await sql<{ state: string }[]>(`reports?id=eq.${id}&select=state`);
    expect(rows[0].state).toBe("RESOLVED");
    expect(
      await sql<unknown[]>(`moderation_actions?report_id=eq.${id}&select=id`),
    ).toEqual([]);
  }, TEST_MS);

  it("★ anon 은 신고를 닫을 수 없다 — 닫을 수 있으면 신고를 지우는 버튼이 된다", async () => {
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    const { error } = await anon.rpc("close_stale_reports", { p_limit: 10 });
    expect(error).not.toBeNull();
  }, TEST_MS);
});

describe("크론이 도는지 들여다본다", () => {
  it("★ 두 작업이 등록돼 있고 켜져 있다 — 멈추면 증상이 없어서 안 보인다", async () => {
    /*
     * 삭제가 멈춰도 화면은 그대로다(공개 여부는 읽는 시점에 판정한다). 그래서 멈춘
     * 것을 알려 주는 것이 없었다. 운영에서는 select * from public.purge_health();
     */
    const { data, error } = await db.rpc("purge_health");
    if (error) throw new Error(`purge_health 실패: ${error.message}`);

    const rows = (data ?? []) as { job_name: string; scheduled: boolean; schedule: string }[];
    const byName = Object.fromEntries(rows.map((r) => [r.job_name, r]));

    expect(byName["purge-expired"]?.scheduled).toBe(true);
    expect(byName["purge-expired"]?.schedule).toBe("0 19 * * *");
    // 종결이 삭제보다 먼저 돌아야 같은 밤에 '종결 → 삭제'가 이어진다.
    expect(byName["close-stale-reports"]?.scheduled).toBe(true);
    expect(byName["close-stale-reports"]?.schedule).toBe("0 18 * * *");
  }, TEST_MS);

  it("★ anon 은 들여다볼 수 없다", async () => {
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    const { error } = await anon.rpc("purge_health");
    expect(error).not.toBeNull();
  }, TEST_MS);
});

describe("조치 기록", () => {
  it("★ 기간이 지난 조치 기록은 지워진다", async () => {
    const id = await makeModerationAction(RETENTION_DAYS.reports + 1);

    await purge();

    expect(await sql<unknown[]>(`moderation_actions?id=eq.${id}&select=id`)).toEqual([]);
  }, TEST_MS);

  it("기간 안의 조치 기록은 남는다 — 신고만 남고 무엇을 했는지가 사라지면 기록이 아니다", async () => {
    const id = await makeModerationAction(RETENTION_DAYS.reports - 1);

    await purge();

    expect(await sql<unknown[]>(`moderation_actions?id=eq.${id}&select=id`)).toHaveLength(1);
  }, TEST_MS);
});

describe("관찰 — 지금 0행이지만 1차가 돌면 바로 쌓인다", () => {
  /*
   * 쌓인 뒤에 테스트를 쓰는 것보다 지금 쓰는 것이 쉽다. 이 표는 만료 시각을 기준으로
   * 센다(작성 시각이 아니다) — 15분짜리 집계값이라 만료가 곧 목적의 끝이다.
   */
  it("★ 만료 후 기간이 지난 관찰은 지워진다", async () => {
    const guestId = await makeSession();
    const hospitalId = await someHospitalId();
    const id = await makeObservation({
      guestId,
      hospitalId,
      expiredDaysAgo: RETENTION_DAYS.observations + 1,
    });

    await purge();

    expect(await sql<unknown[]>(`observations?id=eq.${id}&select=id`)).toEqual([]);
  }, TEST_MS);

  it("★ 만료됐지만 기간 안인 관찰은 남는다 — 공개 중단과 삭제는 다른 일이다", async () => {
    const guestId = await makeSession();
    const hospitalId = await someHospitalId();
    const id = await makeObservation({
      guestId,
      hospitalId,
      expiredDaysAgo: RETENTION_DAYS.observations - 1,
    });

    await purge();

    // 이미 공개는 끊겼다(expires_at < now()). 그래도 아직 지우지 않는다.
    expect(await sql<unknown[]>(`observations?id=eq.${id}&select=id`)).toHaveLength(1);
  }, TEST_MS);
});
