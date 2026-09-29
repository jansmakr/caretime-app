import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requireLocalKeys } from "../vitest.setup";

/**
 * service_statuses 의 공개 읽기 경계를 DB 에 대고 고정한다.
 *
 * 순수 로직이 아니라 **정책**을 검증한다. 접기 규칙(serviceStatus.test.ts)이 아무리 맞아도
 * anon 이 만료된 값이나 updated_by 를 읽어 가면 그건 다른 종류의 사고다. 그래서 실제
 * REST 엔드포인트에 anon 키로 쏘아 본다.
 *
 * 대상은 supabase start 로 띄운 127.0.0.1 인스턴스뿐이다 (vitest.setup.ts 의 가드).
 * Docker 가 꺼져 있으면 이 파일은 조용히 건너뛰지 않고 실패한다 — "돌았다고 착각"을 막는다.
 */

const { url, anonKey, serviceKey } = requireLocalKeys();

const REST = `${url}/rest/v1`;

const anon = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };
const admin = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

async function get(headers: Record<string, string>, path: string): Promise<Response> {
  return fetch(`${REST}/${path}`, { headers });
}

async function json<T = unknown>(headers: Record<string, string>, path: string): Promise<T> {
  const res = await get(headers, path);
  if (!res.ok) throw new Error(`GET ${path} → HTTP ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

/** updated_by 에 넣을 실제 auth 사용자. FK 가 있어서 아무 uuid 나 쓸 수 없다. */
async function anyUserId(): Promise<string> {
  const res = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1`, { headers: admin });
  if (!res.ok) throw new Error(`admin users → HTTP ${res.status}`);
  const body = (await res.json()) as { users?: { id: string }[] };
  const id = body.users?.[0]?.id;
  if (!id) {
    throw new Error(
      "로컬에 auth 사용자가 없습니다. npm run seed:localuser 를 먼저 돌려 주세요 " +
        "(service_statuses.updated_by 가 auth.users 를 참조합니다).",
    );
  }
  return id;
}

interface ServiceRow {
  id: string;
  hospital_id: string;
  category: string;
}

interface StatusRow {
  hospital_id: string;
  service_id: string;
  status: string;
  wait_bucket: string;
  updated_by: string;
  updated_at: string;
  valid_until: string;
}

const MIN = 60_000;
const iso = (offsetMin: number) => new Date(Date.now() + offsetMin * MIN).toISOString();

/** 이 테스트가 만든 행만 지운다. 시드 행은 건드리지 않는다. */
const created: { hospitalId: string; serviceId: string }[] = [];

let liveHospital = "";
let expiredHospital = "";
let unlistedHospital = "";

beforeAll(async () => {
  const userId = await anyUserId();

  const services = await json<ServiceRow[]>(
    admin,
    "hospital_services?select=id,hospital_id,category&order=hospital_id,category",
  );
  if (services.length === 0) {
    throw new Error("hospital_services 가 비어 있습니다. supabase db reset 을 먼저 돌려 주세요.");
  }

  const hospitals = await json<{ id: string; is_participating: boolean }[]>(
    admin,
    "hospitals?select=id,is_participating&order=id",
  );
  const participating = new Set(hospitals.filter((h) => h.is_participating).map((h) => h.id));

  // 병원별로 항목 하나씩 집는다. 참여 병원 2곳(살아 있는 값 / 만료된 값) + 미참여 1곳.
  const taken = new Set<string>();
  const pick = (want: boolean): ServiceRow | undefined => {
    const found = services.find(
      (s) => participating.has(s.hospital_id) === want && !taken.has(s.hospital_id),
    );
    if (found) taken.add(found.hospital_id);
    return found;
  };

  const live = pick(true);
  if (!live) throw new Error("참여 병원의 hospital_services 행이 없습니다.");
  liveHospital = live.hospital_id;

  const expired = pick(true);
  if (!expired) throw new Error("참여 병원이 2곳 이상 필요합니다(살아 있는 행 / 만료된 행).");
  expiredHospital = expired.hospital_id;

  const unlisted = pick(false);
  unlistedHospital = unlisted?.hospital_id ?? "";

  const rows: StatusRow[] = [
    {
      hospital_id: live.hospital_id,
      service_id: live.id,
      status: "AVAILABLE",
      wait_bucket: "LE30",
      updated_by: userId,
      updated_at: iso(0),
      valid_until: iso(30),
    },
    // 만료된 값. TTL CHECK(valid_until <= updated_at + 1h)를 지키면서 과거로 보낸다.
    {
      hospital_id: expired.hospital_id,
      service_id: expired.id,
      status: "AVAILABLE",
      wait_bucket: "LE30",
      updated_by: userId,
      updated_at: iso(-90),
      valid_until: iso(-30),
    },
  ];
  if (unlisted) {
    // 참여를 그만둔 병원의 살아 있는 값. 뷰가 걸러야 한다.
    rows.push({
      hospital_id: unlisted.hospital_id,
      service_id: unlisted.id,
      status: "AVAILABLE",
      wait_bucket: "LE30",
      updated_by: userId,
      updated_at: iso(0),
      valid_until: iso(30),
    });
  }

  const res = await fetch(`${REST}/service_statuses`, {
    method: "POST",
    headers: { ...admin, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`시드 insert 실패 → HTTP ${res.status} ${await res.text()}`);

  for (const r of rows) created.push({ hospitalId: r.hospital_id, serviceId: r.service_id });
});

afterAll(async () => {
  for (const c of created) {
    await fetch(
      `${REST}/service_statuses?hospital_id=eq.${c.hospitalId}&service_id=eq.${c.serviceId}`,
      { method: "DELETE", headers: admin },
    );
  }
});

describe("anon 공개 읽기 — service_statuses_public", () => {
  it("살아 있는 행은 보인다", async () => {
    const rows = await json<unknown[]>(anon, `service_statuses_public?hospital_id=eq.${liveHospital}`);
    expect(rows.length).toBe(1);
  });

  it("★ 만료된 행은 보이지 않는다 (valid_until > now())", async () => {
    const rows = await json<unknown[]>(
      anon,
      `service_statuses_public?hospital_id=eq.${expiredHospital}`,
    );
    expect(rows).toEqual([]);

    // 행 자체는 DB 에 있다. "없어서 안 보이는 것"이 아니라 "만료돼서 안 보이는 것"이다.
    const raw = await json<unknown[]>(
      admin,
      `service_statuses?hospital_id=eq.${expiredHospital}&select=hospital_id`,
    );
    expect(raw.length).toBe(1);
  });

  it("★ 응답에 updated_by 가 없다 — 누가 눌렀는지는 공개 정보가 아니다", async () => {
    const rows = await json<Record<string, unknown>[]>(anon, "service_statuses_public");
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(Object.keys(row)).not.toContain("updated_by");
      expect(Object.keys(row)).not.toContain("version");
    }
  });

  it("updated_by 를 명시로 요청해도 나오지 않는다", async () => {
    const res = await get(anon, "service_statuses_public?select=hospital_id,updated_by");
    expect(res.ok).toBe(false); // 뷰에 없는 컬럼이므로 400 이다
    expect(await res.text()).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/); // uuid 가 새지 않는다
  });

  it("참여를 그만둔 병원의 값은 보이지 않는다", async () => {
    expect(unlistedHospital).not.toBe(""); // 검증 대상이 실제로 있어야 한다
    const rows = await json<unknown[]>(
      anon,
      `service_statuses_public?hospital_id=eq.${unlistedHospital}`,
    );
    expect(rows).toEqual([]);
  });

  it("공개되는 컬럼 목록이 고정이다 — 나중에 컬럼이 붙어도 자동 공개되지 않는다", async () => {
    const rows = await json<Record<string, unknown>[]>(anon, "service_statuses_public?limit=1");
    expect(Object.keys(rows[0]).sort()).toEqual(
      [
        "hospital_id",
        "reason_code",
        "reopen_at",
        "service_id",
        "status",
        "updated_at",
        "valid_until",
        "wait_bucket",
      ].sort(),
    );
  });
});

describe("anon 은 원본 테이블에 손대지 못한다", () => {
  it("원본 select 는 여전히 0행이다 (정책을 열지 않았다)", async () => {
    expect(await json<unknown[]>(anon, "service_statuses?select=hospital_id")).toEqual([]);
    expect(await json<unknown[]>(anon, "hospital_services?select=id")).toEqual([]);
    expect(await json<unknown[]>(anon, "status_events?select=id")).toEqual([]);
  });

  it("★ insert 가 거부된다", async () => {
    const res = await fetch(`${REST}/service_statuses`, {
      method: "POST",
      headers: { ...anon, "Content-Type": "application/json" },
      body: JSON.stringify({
        hospital_id: liveHospital,
        service_id: "00000000-0000-0000-0000-000000000000",
        status: "AVAILABLE",
        updated_by: "00000000-0000-0000-0000-000000000000",
        valid_until: iso(30),
      }),
    });
    expect(res.ok).toBe(false);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("42501"); // row-level security violation
  });

  it("★ update 가 값을 바꾸지 못한다", async () => {
    const before = await json<{ status: string }[]>(
      admin,
      `service_statuses?hospital_id=eq.${liveHospital}&select=status`,
    );
    await fetch(`${REST}/service_statuses?hospital_id=eq.${liveHospital}`, {
      method: "PATCH",
      headers: { ...anon, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CLOSED" }),
    });
    const after = await json<{ status: string }[]>(
      admin,
      `service_statuses?hospital_id=eq.${liveHospital}&select=status`,
    );
    // RLS 는 보이지 않는 행을 고치지 못한다. HTTP 는 성공처럼 보일 수 있으니 값으로 확인한다.
    expect(after).toEqual(before);
    expect(after[0].status).toBe("AVAILABLE");
  });

  it("delete 도 행을 지우지 못한다", async () => {
    await fetch(`${REST}/service_statuses?hospital_id=eq.${liveHospital}`, {
      method: "DELETE",
      headers: anon,
    });
    const rows = await json<unknown[]>(
      admin,
      `service_statuses?hospital_id=eq.${liveHospital}&select=hospital_id`,
    );
    expect(rows.length).toBe(1);
  });

  it("★ 뷰를 통한 쓰기도 막혀 있다 (grant 를 select 만 줬다)", async () => {
    for (const method of ["POST", "PATCH", "DELETE"] as const) {
      const filter = method === "POST" ? "" : `?hospital_id=eq.${liveHospital}`;
      const res = await fetch(`${REST}/service_statuses_public${filter}`, {
        method,
        headers: { ...anon, "Content-Type": "application/json" },
        body: method === "DELETE" ? undefined : JSON.stringify({ status: "CLOSED" }),
      });
      expect(res.ok, `${method} 이 통과했습니다`).toBe(false);
    }
  });
});
