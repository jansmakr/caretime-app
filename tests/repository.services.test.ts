import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchHospitalView, fetchHospitalViews } from "@/features/hospitals/repository";
import { requireLocalKeys } from "../vitest.setup";

/**
 * 읽기 경로 배선이 **실제로 달라졌는지**를 DB 에 대고 확인한다.
 *
 * 타입이 맞는 것과 화면 값이 바뀌는 것은 다르다. 조인만 넣고 "완료"라고 하면
 * services 가 여전히 빈 배열이어도 아무도 모른다. 그래서 anon 클라이언트로
 * 진짜 조회해서 항목이 실려 오는지, 접기 규칙이 대표 상태를 지배하는지 본다.
 */

const { url, anonKey, serviceKey } = requireLocalKeys();

const REST = `${url}/rest/v1`;
const admin = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

let anon: SupabaseClient;

const MIN = 60_000;
const iso = (offsetMin: number) => new Date(Date.now() + offsetMin * MIN).toISOString();

interface CatalogRow {
  id: string;
  hospital_id: string;
  category: string;
}

/** 항목이 2개 이상인 참여 병원. 부분 게시를 시험하려면 항목이 둘 이상이어야 한다. */
let multiHospital = "";
let multiItems: CatalogRow[] = [];
/** 참여하지 않는 병원. 공개 뷰가 걸러야 한다. */
let unlistedHospital = "";

async function adminJson<T>(path: string): Promise<T> {
  const res = await fetch(`${REST}/${path}`, { headers: admin });
  if (!res.ok) throw new Error(`GET ${path} → HTTP ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

async function userId(): Promise<string> {
  const res = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1`, { headers: admin });
  const body = (await res.json()) as { users?: { id: string }[] };
  const id = body.users?.[0]?.id;
  if (!id) throw new Error("로컬에 auth 사용자가 없습니다. npm run seed:localuser 를 먼저 돌려 주세요.");
  return id;
}

async function post(serviceId: string, hospitalId: string, status: string, offsetMin = 0): Promise<void> {
  const res = await fetch(`${REST}/service_statuses`, {
    method: "POST",
    headers: { ...admin, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      hospital_id: hospitalId,
      service_id: serviceId,
      status,
      wait_bucket: "UNKNOWN",
      updated_by: await userId(),
      updated_at: iso(offsetMin),
      valid_until: iso(offsetMin + 30),
    }),
  });
  if (!res.ok) throw new Error(`게시 실패 → HTTP ${res.status} ${await res.text()}`);
}

async function clearStatuses(hospitalId: string): Promise<void> {
  await fetch(`${REST}/service_statuses?hospital_id=eq.${hospitalId}`, { method: "DELETE", headers: admin });
}

beforeAll(async () => {
  anon = createClient(url, anonKey, { auth: { persistSession: false } });

  const catalog = await adminJson<CatalogRow[]>(
    "hospital_services?select=id,hospital_id,category&order=hospital_id,category",
  );
  const hospitals = await adminJson<{ id: string; is_participating: boolean }[]>(
    "hospitals?select=id,is_participating&order=id",
  );

  const counts = new Map<string, CatalogRow[]>();
  for (const row of catalog) {
    counts.set(row.hospital_id, [...(counts.get(row.hospital_id) ?? []), row]);
  }
  const participating = new Set(hospitals.filter((h) => h.is_participating).map((h) => h.id));

  for (const [hospitalId, items] of counts) {
    if (items.length >= 2 && participating.has(hospitalId) && multiHospital === "") {
      multiHospital = hospitalId;
      multiItems = items;
    }
    if (!participating.has(hospitalId) && unlistedHospital === "") unlistedHospital = hospitalId;
  }

  if (multiHospital === "") {
    throw new Error("항목이 2개 이상인 참여 병원이 없습니다. supabase db reset 을 먼저 돌려 주세요.");
  }
  await clearStatuses(multiHospital);
});

afterAll(async () => {
  await clearStatuses(multiHospital);
});

async function view(hospitalId: string) {
  const v = await fetchHospitalView(anon, hospitalId);
  if (!v) throw new Error(`${hospitalId} 를 읽지 못했습니다.`);
  return v;
}

describe("anon 읽기 경로에 항목이 실려 온다", () => {
  it("services 가 더 이상 빈 배열이 아니다", async () => {
    const v = await view(multiHospital);
    expect(v.services.length).toBe(multiItems.length);
    expect(v.services.map((s) => s.category).sort()).toEqual(multiItems.map((i) => i.category).sort());
  });

  it("상태를 아직 안 누른 항목도 목록에서 빠지지 않는다", async () => {
    const v = await view(multiHospital);
    expect(v.services.every((s) => s.status === null)).toBe(true);
  });

  it("version 은 오지 않는다 (공개 뷰가 내보내지 않는다)", async () => {
    const v = await view(multiHospital);
    expect(v.services.every((s) => s.version === null)).toBe(true);
  });

  it("참여하지 않는 병원은 항목이 비어 있다", async () => {
    expect(unlistedHospital).not.toBe("");
    const v = await view(unlistedHospital);
    expect(v.services).toEqual([]);
  });

  it("목록 조회에서도 같은 값이 온다", async () => {
    const all = await fetchHospitalViews(anon);
    const one = all.find((h) => h.id === multiHospital);
    expect(one?.services.length).toBe(multiItems.length);
  });
});

describe("접기 규칙이 대표 상태를 지배한다", () => {
  it("★ 항목 하나가 마감이면 병원 대표가 마감이다 (옛 값이 정상이라도)", async () => {
    await clearStatuses(multiHospital);
    await post(multiItems[0].id, multiHospital, "CLOSED");

    const v = await view(multiHospital);
    expect(v.liveStatus?.status).toBe("difficult");
  });

  it("★ 항목 하나만 가능으로 게시해도 병원 전체가 가능으로 바뀌지 않는다", async () => {
    await clearStatuses(multiHospital);
    const before = await view(multiHospital);

    await post(multiItems[0].id, multiHospital, "AVAILABLE");
    const after = await view(multiHospital);

    // 나머지 항목이 미게시이므로 접기 결과는 UNKNOWN 이다. 대표 상태가 움직이지 않아야 한다.
    expect(after.services.filter((s) => s.status === "AVAILABLE").length).toBe(1);
    expect(after.liveStatus?.status ?? null).toBe(before.liveStatus?.status ?? null);
  });

  it("★ 모든 항목이 가능일 때만 대표가 가능이다", async () => {
    await clearStatuses(multiHospital);
    for (const item of multiItems) await post(item.id, multiHospital, "AVAILABLE");

    const v = await view(multiHospital);
    expect(v.services.every((s) => s.status === "AVAILABLE")).toBe(true);
    expect(v.liveStatus?.status).toBe("normal");
  });

  it("★ 만료된 게시는 미게시와 같게 읽힌다", async () => {
    await clearStatuses(multiHospital);
    const before = await view(multiHospital);

    // updated_at 을 90분 전으로 두면 valid_until 은 60분 전 — TTL CHECK 를 지키면서 만료 상태다.
    for (const item of multiItems) await post(item.id, multiHospital, "AVAILABLE", -90);
    const after = await view(multiHospital);

    // 만료된 AVAILABLE 이 세 개 있어도 항목 상태는 전부 null 이고 대표도 움직이지 않는다.
    expect(after.services.every((s) => s.status === null)).toBe(true);
    expect(after.liveStatus?.status ?? null).toBe(before.liveStatus?.status ?? null);
  });

  /*
   * 여기서 대표가 옛 값(hospital_live_status)으로 남는 것은 설계다.
   * 병원이 직접 누른 값을 "항목을 아직 안 눌렀다"는 사실로 덮지 않는다.
   * 파트너 쓰기가 service_statuses 로 옮겨지면 옛 값이 갱신되지 않고 만료되어 사라진다.
   * (규칙: serviceStatus.mergeConservative)
   */
  it("옛 출처가 아직 살아 있는 병원은 대표가 옛 값으로 남는다 (이행 기간)", async () => {
    await clearStatuses(multiHospital);
    const v = await view(multiHospital);
    if (v.liveStatus === null) return; // 옛 값이 없는 병원이면 검증 대상이 아니다
    expect(v.services.every((s) => s.status === null)).toBe(true);
    expect(v.liveStatus.capabilityId).toBeNull();
  });
});
