import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadPartnerState, saveSlice } from "@/features/partner/supabaseBackend";
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
    const { state } = await loadPartnerState(partner, HOSPITAL, new Date());
    for (const bogus of [
      new Date(Date.now() + 24 * 60 * 60_000).toISOString(), // 너무 먼 미래
      new Date(Date.now() - 60 * 60_000).toISOString(), // 이미 지난 시각
    ]) {
      await saveSlice(
        partner,
        "live",
        {
          ...state,
          liveStatus: { ...state.liveStatus, status: "normal", expiresAt: bogus },
          services: state.services.map((svc) => ({ ...svc, status: "normal" as const })),
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
