import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  StatusConflictError,
  loadPartnerState,
  saveSlice,
} from "@/features/partner/supabaseBackend";
import { requireLocalKeys } from "../vitest.setup";

/**
 * 파트너 쓰기 경로가 실제로 service_statuses 로 갔는지 **로그인한 병원 계정으로** 확인한다.
 *
 * 이 테스트가 로그인을 하는 이유: 쓰기는 RLS(is_hospital_member)가 판정하고, 시각·작성자·
 * version 은 DB 트리거가 auth.uid() 로 찍는다. service_role 로 우회하면 그 둘을 건너뛰어
 * "되는 줄 알았는데 병원이 눌러 보면 안 되는" 상태를 통과시킨다.
 *
 * *.realtime.test.ts 라 기본 묶음에서 빠진다(로그인 왕복이 있어 느리다).
 */

const { url, anonKey, serviceKey } = requireLocalKeys();
const REST = `${url}/rest/v1`;
const admin = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

const HOSPITAL = "h_001";
const TEST_MS = 30_000;

let partner: SupabaseClient;
/** service_role 로 심을 때 쓸 실제 사용자. updated_by 는 NOT NULL 이고 FK 가 있다. */
let userId = "";

async function adminJson<T>(path: string): Promise<T> {
  const res = await fetch(`${REST}/${path}`, { headers: admin });
  if (!res.ok) throw new Error(`GET ${path} → HTTP ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

function envValue(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`${key} 가 .env.local 에 없습니다.`);
  return v;
}

beforeAll(async () => {
  partner = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error } = await partner.auth.signInWithPassword({
    email: envValue("E2E_PARTNER_EMAIL"),
    password: envValue("E2E_PARTNER_PASSWORD"),
  });
  if (error) {
    throw new Error(
      `테스트 계정 로그인 실패: ${error.message}. npm run seed:localuser 를 먼저 돌려 주세요.`,
    );
  }

  const users = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1`, { headers: admin });
  const body = (await users.json()) as { users?: { id: string }[] };
  userId = body.users?.[0]?.id ?? "";
  if (userId === "") throw new Error("로컬에 auth 사용자가 없습니다.");

  await fetch(`${REST}/service_statuses?hospital_id=eq.${HOSPITAL}`, {
    method: "DELETE",
    headers: admin,
  });
}, TEST_MS);

afterAll(async () => {
  await fetch(`${REST}/service_statuses?hospital_id=eq.${HOSPITAL}`, {
    method: "DELETE",
    headers: admin,
  });
  await partner.auth.signOut();
});

/**
 * 주 버튼을 누른 것과 같다 — 항목값 전부를 같은 값으로 세팅한다.
 * 저장되는 실체가 항목값이므로 liveStatus 만 바꾸면 아무것도 바뀌지 않는다.
 */
async function save(status: "normal" | "partial" | "paused" | "difficult", now = new Date()) {
  const { state } = await loadPartnerState(partner, HOSPITAL, now);
  return saveSlice(
    partner,
    "live",
    {
      ...state,
      liveStatus: { ...state.liveStatus, status },
      services: state.services.map((svc) => ({ ...svc, status })),
      // 주 버튼은 병원 전체에 대한 주장이라 전 항목이 저장 대상이다.
      dirtyServiceIds: state.services.map((svc) => svc.serviceId),
    },
    now,
  );
}

describe("파트너 쓰기 → service_statuses", () => {
  it("★ 한 번 누르면 이 병원의 모든 항목에 같은 상태가 쓰인다", async () => {
    await save("difficult");

    const rows = await adminJson<{ service_id: string; status: string }[]>(
      `service_statuses?hospital_id=eq.${HOSPITAL}&select=service_id,status`,
    );
    const catalog = await adminJson<{ id: string }[]>(
      `hospital_services?hospital_id=eq.${HOSPITAL}&select=id`,
    );

    expect(rows.length).toBe(catalog.length);
    expect(rows.every((r) => r.status === "CLOSED")).toBe(true);
  }, TEST_MS);

  it("★ hospital_live_status 에는 쓰지 않는다 (표는 남아 있다)", async () => {
    const before = await adminJson<unknown[]>(
      `hospital_live_status?hospital_id=eq.${HOSPITAL}&select=hospital_id,verified_at`,
    );
    await save("partial");
    const after = await adminJson<unknown[]>(
      `hospital_live_status?hospital_id=eq.${HOSPITAL}&select=hospital_id,verified_at`,
    );
    expect(after).toEqual(before);
  }, TEST_MS);

  it("★ 저장 응답은 접힌 대표 하나다", async () => {
    const change = await save("partial");
    expect(change.table).toBe("service_statuses");
    if (change.table !== "service_statuses") throw new Error("표가 다르다");
    expect(change.row.status).toBe("partial");
    expect(change.row.capability_id).toBeNull();
  }, TEST_MS);

  it("★ 시각·작성자·version 은 서버가 찍는다", async () => {
    await save("normal");
    const rows = await adminJson<{ updated_by: string | null; version: number; updated_at: string }[]>(
      `service_statuses?hospital_id=eq.${HOSPITAL}&select=updated_by,version,updated_at`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.updated_by).not.toBeNull(); // auth.uid() 가 찍혔다
      expect(Date.now() - Date.parse(r.updated_at)).toBeLessThan(60_000);
    }
  }, TEST_MS);

  it("★ 같은 항목을 다시 누르면 version 이 오른다", async () => {
    await save("normal");
    const first = await adminJson<{ service_id: string; version: number }[]>(
      `service_statuses?hospital_id=eq.${HOSPITAL}&select=service_id,version&order=service_id`,
    );
    await save("difficult");
    const second = await adminJson<{ service_id: string; version: number }[]>(
      `service_statuses?hospital_id=eq.${HOSPITAL}&select=service_id,version&order=service_id`,
    );

    expect(second.length).toBe(first.length);
    for (let i = 0; i < first.length; i += 1) {
      expect(second[i].version).toBe(first[i].version + 1);
    }
  }, TEST_MS);

  it("★ 만료는 서버가 정한다 — 화면이 보내는 값과 무관하다", async () => {
    /*
     * 화면은 옛 규칙(최대 24시간)의 만료시각을 들고 있을 수 있고, 만료된 값을 들고
     * 시작하기도 한다. 어느 쪽을 보내도 저장은 성공해야 하고 창은 정책대로여야 한다.
     */
    for (const bogus of [
      new Date(Date.now() + 24 * 60 * 60_000).toISOString(), // 너무 먼 미래
      new Date(Date.now() - 60 * 60_000).toISOString(), // 이미 지난 시각
    ]) {
      // 매번 다시 읽는다. 같은 state 로 두 번 쓰면 두 번째는 낡은 version 이라 거절된다.
      const { state } = await loadPartnerState(partner, HOSPITAL, new Date());
      await saveSlice(
        partner,
        "live",
        {
          ...state,
          liveStatus: { ...state.liveStatus, status: "normal", expiresAt: bogus },
          services: state.services.map((svc) => ({ ...svc, status: "normal" as const })),
          dirtyServiceIds: state.services.map((svc) => svc.serviceId),
        },
        new Date(),
      );

      const rows = await adminJson<{ updated_at: string; valid_until: string }[]>(
        `service_statuses?hospital_id=eq.${HOSPITAL}&select=updated_at,valid_until`,
      );
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        const span = Date.parse(r.valid_until) - Date.parse(r.updated_at);
        expect(span).toBe(60 * 60_000); // 기본 창 전체
      }
    }
  }, TEST_MS);

  it("★ CLOSED 는 창이 12시간이다", async () => {
    await save("difficult");
    const rows = await adminJson<{ updated_at: string; valid_until: string }[]>(
      `service_statuses?hospital_id=eq.${HOSPITAL}&select=updated_at,valid_until`,
    );
    for (const r of rows) {
      expect(Date.parse(r.valid_until) - Date.parse(r.updated_at)).toBe(12 * 60 * 60_000);
    }
  }, TEST_MS);

  it("★ 이력이 쌓인다 — '어제와 동일'이 읽을 곳이 생긴다", async () => {
    await save("difficult");
    const events = await adminJson<{ new_json: Record<string, unknown>; version: number }[]>(
      `status_events?hospital_id=eq.${HOSPITAL}&select=new_json,version&order=id.desc&limit=5`,
    );
    expect(events.length).toBeGreaterThan(0);
    // 작성자는 이력 본문에 남기지 않는다. 별도 컬럼(actor_user_id)에만 둔다.
    expect(Object.keys(events[0].new_json)).not.toContain("updated_by");
    expect(events[0].new_json.status).toBe("CLOSED");
  }, TEST_MS);

  it("★ 다른 병원에는 쓰지 못한다 (소속이 없는 곳)", async () => {
    const outsider = await adminJson<{ id: string }[]>(
      "hospital_services?select=id,hospital_id&hospital_id=eq.h_004",
    );
    expect(outsider.length).toBeGreaterThan(0);

    const { error } = await partner.from("service_statuses").insert({
      hospital_id: "h_004",
      service_id: outsider[0].id,
      status: "AVAILABLE",
      valid_until: new Date(Date.now() + 30 * 60_000).toISOString(),
    });
    expect(error?.code).toBe("42501");
  }, TEST_MS);
});

describe("파트너 읽기 — 만료된 값도 본다", () => {
  it("★ 공개 뷰가 숨기는 만료 값을 파트너 화면은 읽는다", async () => {
    /*
     * 과거로 되돌려 심을 수 없다 — stamp_write 가 updated_at 을 now() 로 다시 찍는다.
     * 그게 맞는 동작이라(서버가 시각을 소유한다) 우회하지 않고, 대신 아주 짧은 창을
     * 요청해 실제로 만료되기를 기다린다. clamp 는 요청이 더 짧으면 존중한다.
     */
    const services = await adminJson<{ id: string }[]>(
      `hospital_services?hospital_id=eq.${HOSPITAL}&select=id`,
    );
    const soon = new Date(Date.now() + 1_500).toISOString();
    const res = await fetch(`${REST}/service_statuses`, {
      method: "POST",
      headers: { ...admin, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(
        services.map((svc) => ({
          hospital_id: HOSPITAL,
          service_id: svc.id,
          status: "AVAILABLE",
          valid_until: soon,
          updated_by: userId,
        })),
      ),
    });
    if (!res.ok) throw new Error(`심기 실패 → ${res.status} ${await res.text()}`);

    await new Promise((r) => setTimeout(r, 2_500));

    // 공개 뷰: 안 보인다.
    const publicRows = await adminJson<unknown[]>(
      `service_statuses_public?hospital_id=eq.${HOSPITAL}&select=service_id`,
    );
    expect(publicRows).toEqual([]);

    // 파트너 화면: 만료된 상태로 읽어서 "다시 눌러 주세요"를 만들 수 있다.
    const { state } = await loadPartnerState(partner, HOSPITAL, new Date());
    expect(Date.parse(state.liveStatus.expiresAt)).toBeLessThan(Date.now());
  }, TEST_MS);
});

describe("다음 날 — 예외가 DB 를 거쳐 재현된다", () => {
  it("★ 어제 남긴 항목별 이력이 yesterday.services 로 돌아온다", async () => {
    /*
     * 순수 함수 테스트(features/partner/services.test.ts)는 "yesterday.services 가 있으면
     * 재현된다"를 고정한다. 여기서는 그 표가 **실제로 채워지는지**를 본다 —
     * status_events 를 진료일 경계로 갈라 항목마다 가장 최근 것 하나를 고르는 부분이
     * 이 기능에서 가장 조용히 틀리기 쉬운 곳이다.
     */
    await save("difficult");

    // 방금 쌓인 이력을 어제로 돌린다. status_events 에는 트리거가 없어 그대로 들어간다.
    const yesterday = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    const moved = await fetch(`${REST}/status_events?hospital_id=eq.${HOSPITAL}`, {
      method: "PATCH",
      headers: { ...admin, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ created_at: yesterday }),
    });
    if (!moved.ok) throw new Error(`이력 이동 실패 → ${moved.status} ${await moved.text()}`);

    const { state } = await loadPartnerState(partner, HOSPITAL, new Date());

    const services = await adminJson<{ id: string }[]>(
      `hospital_services?hospital_id=eq.${HOSPITAL}&select=id`,
    );
    expect(Object.keys(state.yesterday.services).sort()).toEqual(
      services.map((s) => s.id).sort(),
    );
    for (const id of services.map((s) => s.id)) {
      expect(state.yesterday.services[id]).toBe("difficult");
    }
  }, TEST_MS);

  it("★ 오늘 쌓인 이력은 '어제'로 세지 않는다", async () => {
    await save("difficult");
    const yesterday = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    await fetch(`${REST}/status_events?hospital_id=eq.${HOSPITAL}`, {
      method: "PATCH",
      headers: { ...admin, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ created_at: yesterday }),
    });

    // 오늘 다시 눌렀다. 이건 "어제"가 아니라 방금 누른 값이다.
    await save("normal");

    const { state } = await loadPartnerState(partner, HOSPITAL, new Date());
    for (const value of Object.values(state.yesterday.services)) {
      expect(value).toBe("difficult");
    }
  }, TEST_MS);
});

/**
 * 동시수정.
 *
 * 야간에 당직자 둘이 같은 화면을 보는 일은 흔하다. 그때 나중에 누른 사람이 앞사람의
 * 값을 말없이 덮으면, 앞사람은 자기가 누른 값이 살아 있는 줄 안다. 반대로 나중 사람의
 * 값을 말없이 버리면 그 사람도 눌렀다고 믿는다. 둘 다 사고다.
 *
 * 비교는 애플리케이션이 아니라 UPDATE 문 안에서 한다 — `where version = $1`.
 * 읽고 비교하고 쓰는 사이에는 다른 사람이 끼어든다.
 */
describe("동시수정 409", () => {
  async function load() {
    return (await loadPartnerState(partner, HOSPITAL, new Date())).state;
  }

  /** 테스트 계정이 소속돼 있으면서 진료 항목이 둘 이상인 병원. */
  async function hospitalWithTwoServices(): Promise<string> {
    const mine = await adminJson<{ hospital_id: string }[]>(
      `hospital_members?user_id=eq.${userId}&select=hospital_id`,
    );
    const counts = await adminJson<{ hospital_id: string }[]>(
      "hospital_services?select=hospital_id",
    );
    const perHospital = new Map<string, number>();
    for (const row of counts) {
      perHospital.set(row.hospital_id, (perHospital.get(row.hospital_id) ?? 0) + 1);
    }
    const found = mine.find((m) => (perHospital.get(m.hospital_id) ?? 0) > 1);
    if (!found) {
      throw new Error(
        "항목이 둘 이상인 소속 병원이 없습니다. npm run seed:localuser 를 다시 돌려 주세요.",
      );
    }
    return found.hospital_id;
  }

  /** 주 버튼을 누른 것과 같다 — 전 항목이 저장 대상이다. */
  function pressAll(state: Awaited<ReturnType<typeof load>>, status: "normal" | "difficult") {
    return {
      ...state,
      liveStatus: { ...state.liveStatus, status },
      services: state.services.map((svc) => ({ ...svc, status })),
      dirtyServiceIds: state.services.map((svc) => svc.serviceId),
    };
  }

  /** 항목 하나만 바꾼 것과 같다. */
  function pressOne(
    state: Awaited<ReturnType<typeof load>>,
    category: string,
    status: "normal" | "difficult",
  ) {
    const target = state.services.find((svc) => svc.category === category);
    if (!target) throw new Error(`${category} 항목이 없습니다.`);
    return {
      ...state,
      services: state.services.map((svc) =>
        svc.serviceId === target.serviceId ? { ...svc, status } : svc,
      ),
      dirtyServiceIds: [target.serviceId],
    };
  }

  it("★ 같은 version 으로 두 번 쓰면 두 번째가 거절된다", async () => {
    await save("normal");
    const shared = await load(); // 두 사람이 같은 화면을 보고 있다

    await saveSlice(partner, "live", pressAll(shared, "difficult"), new Date());

    // 두 번째 사람은 아직 낡은 version 을 들고 있다.
    await expect(
      saveSlice(partner, "live", pressAll(shared, "normal"), new Date()),
    ).rejects.toThrow(StatusConflictError);
  }, TEST_MS);

  it("★ 거절된 쓰기가 DB 를 바꾸지 않았다", async () => {
    await save("normal");
    const shared = await load();

    await saveSlice(partner, "live", pressAll(shared, "difficult"), new Date());
    const afterFirst = await adminJson<{ service_id: string; status: string; version: number }[]>(
      `service_statuses?hospital_id=eq.${HOSPITAL}&select=service_id,status,version&order=service_id`,
    );

    await saveSlice(partner, "live", pressAll(shared, "normal"), new Date()).catch(() => undefined);
    const afterSecond = await adminJson<{ service_id: string; status: string; version: number }[]>(
      `service_statuses?hospital_id=eq.${HOSPITAL}&select=service_id,status,version&order=service_id`,
    );

    // 값도 version 도 그대로다. 거절은 "쓰고 나서 되돌린 것"이 아니라 아예 안 쓴 것이다.
    expect(afterSecond).toEqual(afterFirst);
    expect(afterSecond.every((r) => r.status === "CLOSED")).toBe(true);
  }, TEST_MS);

  it("★ 거절 응답에 현재 값이 들어 있다 — 다시 읽지 않아도 되게", async () => {
    await save("normal");
    const shared = await load();

    await saveSlice(partner, "live", pressAll(shared, "difficult"), new Date());

    let thrown: unknown;
    try {
      await saveSlice(partner, "live", pressAll(shared, "normal"), new Date());
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(StatusConflictError);
    const conflict = (thrown as StatusConflictError).conflict;

    expect(conflict.current.length).toBeGreaterThan(0);
    expect(conflict.current.every((svc) => svc.status === "difficult")).toBe(true);
    // 무엇이 달라졌는지도 함께 온다. 화면이 "다른 분이 방금 …" 을 적을 수 있다.
    expect(conflict.changes.length).toBeGreaterThan(0);
    expect(conflict.changes.every((c) => c.status === "difficult")).toBe(true);
  }, TEST_MS);

  it("★ 항목별로 독립적이다 — 화상을 바꾼 사람과 봉합을 바꾼 사람이 서로 막지 않는다", async () => {
    /*
     * 이게 깨지면 당직자 둘이 서로 다른 항목을 만지면서 계속 튕긴다. 그러면 아무도 안 쓴다.
     * version 이 행 단위(PK = hospital_id + service_id)이고, 저장이 건드린 항목만 쓰기
     * 때문에 성립한다. 둘 중 하나라도 어긋나면 이 테스트가 깨진다.
     */
    /*
     * 항목이 둘 이상인 병원이 필요하다. h_001 은 항목이 하나라 이 상황을 만들 수 없다.
     * 소속 중에서 찾는다 — 소속이 아니면 RLS 가 먼저 막아서 version 을 시험하지 못한다.
     */
    const multi = await hospitalWithTwoServices();
    await fetch(`${REST}/service_statuses?hospital_id=eq.${multi}`, {
      method: "DELETE",
      headers: admin,
    });

    const shared = (await loadPartnerState(partner, multi, new Date())).state;
    const categories = shared.services.map((svc) => svc.category);
    expect(categories.length).toBeGreaterThan(1);

    // 두 사람이 같은 화면을 보고 각자 다른 항목을 바꾼다.
    await saveSlice(partner, "live", pressOne(shared, categories[0], "difficult"), new Date());
    await saveSlice(partner, "live", pressOne(shared, categories[1], "difficult"), new Date());

    const rows = await adminJson<{ service_id: string; status: string }[]>(
      `service_statuses?hospital_id=eq.${multi}&select=service_id,status`,
    );
    const changed = rows.filter((r) => r.status === "CLOSED");
    expect(changed).toHaveLength(2); // 둘 다 들어갔다. 아무도 튕기지 않았다.

    await fetch(`${REST}/service_statuses?hospital_id=eq.${multi}`, {
      method: "DELETE",
      headers: admin,
    });
  }, TEST_MS);

  it("★ 거절 후 다시 읽어서 쓰면 성공한다", async () => {
    await save("normal");
    const shared = await load();

    await saveSlice(partner, "live", pressAll(shared, "difficult"), new Date());
    await saveSlice(partner, "live", pressAll(shared, "normal"), new Date()).catch(() => undefined);

    // 화면의 [최신 상태 보기] 가 하는 일. 다시 읽으면 새 version 을 들고 온다.
    const fresh = await load();
    await saveSlice(partner, "live", pressAll(fresh, "normal"), new Date());

    const rows = await adminJson<{ status: string }[]>(
      `service_statuses?hospital_id=eq.${HOSPITAL}&select=status`,
    );
    expect(rows.every((r) => r.status === "AVAILABLE")).toBe(true);
  }, TEST_MS);

  it("행이 아직 없을 때 두 사람이 동시에 만들면 한쪽이 거절된다", async () => {
    await fetch(`${REST}/service_statuses?hospital_id=eq.${HOSPITAL}`, {
      method: "DELETE",
      headers: admin,
    });
    const shared = await load();
    expect(shared.services.every((svc) => svc.version === null)).toBe(true);

    await saveSlice(partner, "live", pressAll(shared, "difficult"), new Date());
    await expect(
      saveSlice(partner, "live", pressAll(shared, "normal"), new Date()),
    ).rejects.toThrow(StatusConflictError);
  }, TEST_MS);
});
