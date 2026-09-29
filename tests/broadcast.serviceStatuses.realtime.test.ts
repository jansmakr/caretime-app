import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SERVICE_STATUS_EVENT, serviceStatusTopic } from "@/features/hospitals/realtime";
import { requireLocalKeys } from "../vitest.setup";

/**
 * 보호자용 broadcast 경로를 DB 에 대고 확인한다.
 *
 * 이 경로의 안전장치는 두 겹이다.
 *   ① 페이로드를 트리거가 고른다 — updated_by·version 은 애초에 실리지 않는다.
 *   ② 청취 권한은 realtime.messages 의 RLS 가 판정한다 — 승인된 참여 병원의 토픽만.
 *
 * ② 가 없으면 ① 이 한 사람의 실수에 걸린다(누가 페이로드에 컬럼을 추가하는 순간
 * 모든 병원 토픽에서 공개된다). 그래서 둘을 각각 테스트한다.
 */

const { url, anonKey, serviceKey } = requireLocalKeys();

const REST = `${url}/rest/v1`;
const admin = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

/** 이벤트 도달을 기다리는 상한. 로컬 측정은 18ms 였다. 넉넉히 둔다. */
const WAIT_MS = 1_500;
/** 구독 확정 또는 거절을 기다리는 상한. 거절(Unauthorized)도 이 경로로 온다. */
const SUBSCRIBE_MS = 8_000;
/** 각 테스트의 상한. 웹소켓 왕복이 있어 vitest 기본값(5초)으로는 모자라다. */
const TEST_MS = 20_000;

let anon: SupabaseClient;
let adminClient: SupabaseClient;
let hospitalId = "";
let serviceId = "";
let userId = "";
/** 테스트 전 원래 승인 상태. 끝나고 되돌린다. */
let originalState = "";

const iso = (mins: number) => new Date(Date.now() + mins * 60_000).toISOString();

async function adminJson<T>(path: string): Promise<T> {
  const res = await fetch(`${REST}/${path}`, { headers: admin });
  if (!res.ok) throw new Error(`GET ${path} → HTTP ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

async function setVerification(state: string): Promise<void> {
  const res = await fetch(`${REST}/hospitals?id=eq.${hospitalId}`, {
    method: "PATCH",
    headers: { ...admin, "Content-Type": "application/json" },
    body: JSON.stringify({ verification_state: state }),
  });
  if (!res.ok) throw new Error(`승인 상태 변경 실패 → HTTP ${res.status} ${await res.text()}`);
}

/** 병원이 상태를 눌렀다. 트리거가 broadcast 를 보낸다. */
async function postStatus(status: string): Promise<void> {
  const { error } = await adminClient.from("service_statuses").upsert(
    {
      hospital_id: hospitalId,
      service_id: serviceId,
      status,
      wait_bucket: "UNKNOWN",
      updated_by: userId,
      updated_at: iso(0),
      valid_until: iso(30),
    },
    { onConflict: "hospital_id,service_id" },
  );
  if (error) throw new Error(`게시 실패: ${error.message}`);
}

interface Attempt {
  subscribed: boolean;
  error: string | null;
  payloads: Record<string, unknown>[];
}

/** 토픽을 듣고, 쓰기를 한 번 일으켜 도달 여부를 본다. */
async function listen(run: () => Promise<void>): Promise<Attempt> {
  const payloads: Record<string, unknown>[] = [];
  let error: string | null = null;

  const channel = anon
    .channel(serviceStatusTopic(hospitalId), { config: { private: true } })
    .on("broadcast", { event: SERVICE_STATUS_EVENT }, (msg) => {
      payloads.push(msg.payload as Record<string, unknown>);
    });

  const subscribed = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), SUBSCRIBE_MS);
    channel.subscribe((status, err) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timer);
        resolve(true);
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        error = err?.message ?? status;
        clearTimeout(timer);
        resolve(false);
      }
    });
  });

  if (subscribed) {
    await run();
    await new Promise((r) => setTimeout(r, WAIT_MS));
  }

  await anon.removeChannel(channel);
  return { subscribed, error, payloads };
}

beforeAll(async () => {
  anon = createClient(url, anonKey, { auth: { persistSession: false } });
  adminClient = createClient(url, serviceKey, { auth: { persistSession: false } });

  const services = await adminJson<{ id: string; hospital_id: string }[]>(
    "hospital_services?select=id,hospital_id&order=hospital_id&limit=1",
  );
  if (services.length === 0) {
    throw new Error("hospital_services 가 비어 있습니다. supabase db reset 을 먼저 돌려 주세요.");
  }
  hospitalId = services[0].hospital_id;
  serviceId = services[0].id;

  const hospitals = await adminJson<{ verification_state: string }[]>(
    `hospitals?id=eq.${hospitalId}&select=verification_state`,
  );
  originalState = hospitals[0].verification_state;

  const res = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1`, { headers: admin });
  const body = (await res.json()) as { users?: { id: string }[] };
  const id = body.users?.[0]?.id;
  if (!id) throw new Error("로컬에 auth 사용자가 없습니다. npm run seed:localuser 를 먼저 돌려 주세요.");
  userId = id;

  /*
   * 콜드 스타트 예열. Realtime 서버는 broadcast 용 replication slot 을 첫 private 채널
   * 구독 시점에 lazy 하게 만들고, 그 사이에 난 쓰기는 유실된다. 검증 중에 실제로
   * 겪었고, 그래서 앱은 구독 확정 직후 한 번 다시 읽는다(useHospitalLive).
   * 여기서는 그 앞단을 미리 통과시켜 테스트가 그 경합에 흔들리지 않게 한다.
   */
  await setVerification("APPROVED");
  await listen(async () => {});
});

afterAll(async () => {
  await fetch(`${REST}/service_statuses?hospital_id=eq.${hospitalId}`, {
    method: "DELETE",
    headers: admin,
  });
  if (originalState !== "") await setVerification(originalState);
  await anon.removeAllChannels();
  await adminClient.removeAllChannels();
});

describe("승인된 참여 병원", () => {
  it("★ 병원이 누르면 보호자에게 도달한다", async () => {
    await setVerification("APPROVED");
    const r = await listen(() => postStatus("CLOSED"));

    expect(r.subscribed, `구독 실패: ${r.error}`).toBe(true);
    expect(r.payloads.length).toBeGreaterThan(0);
    expect(r.payloads[0].status).toBe("CLOSED");
    expect(r.payloads[0].hospital_id).toBe(hospitalId);
  }, TEST_MS);

  it("★ 페이로드에 updated_by 가 없다", async () => {
    await setVerification("APPROVED");
    const r = await listen(() => postStatus("LIMITED"));

    expect(r.payloads.length).toBeGreaterThan(0);
    for (const p of r.payloads) {
      expect(Object.keys(p)).not.toContain("updated_by");
    }
  }, TEST_MS);

  it("★ 페이로드에 version 이 없다", async () => {
    await setVerification("APPROVED");
    const r = await listen(() => postStatus("AVAILABLE"));

    expect(r.payloads.length).toBeGreaterThan(0);
    for (const p of r.payloads) {
      expect(Object.keys(p)).not.toContain("version");
    }
  }, TEST_MS);

  it("실리는 컬럼 목록이 고정이다 — 컬럼이 늘면 이 테스트가 먼저 깨진다", async () => {
    await setVerification("APPROVED");
    const r = await listen(() => postStatus("CLOSED"));

    expect(r.payloads.length).toBeGreaterThan(0);
    // realtime 이 붙이는 id 를 빼고, 트리거가 고른 것만 본다.
    const keys = Object.keys(r.payloads[0]).filter((k) => k !== "id").sort();
    expect(keys).toEqual(
      ["hospital_id", "service_id", "status", "updated_at", "valid_until", "wait_bucket"].sort(),
    );
  }, TEST_MS);
});

describe("미승인 병원 — 구독 자체가 거부된다", () => {
  /*
   * 정책은 verification_state = 'APPROVED' 하나만 본다. 그래서 음성 케이스를 5개 전부
   * 돌리지 않고 두 개로 못박는다 — PENDING(지금 모든 병원의 실제 상태)과 REJECTED.
   * 웹소켓 왕복이 케이스마다 5초라 나머지는 같은 것을 다시 사는 비용뿐이다.
   */
  for (const state of ["PENDING", "REJECTED"]) {
    it(`★ ${state} 병원의 토픽은 들을 수 없다`, async () => {
      await setVerification(state);
      const r = await listen(async () => {});

      /*
       * 결과만 못박는다. 거절 문구는 클라이언트가 토큰을 명시로 넣었는지에 따라 달라진다 —
       * realtime.setAuth() 를 부르면 "Unauthorized: You do not have permissions to read
       * from this Channel topic" 이 오고, 부르지 않으면 채널이 그냥 닫힌다(CLOSED).
       * 앱은 후자 경로다. 어느 쪽이든 못 듣는다는 것이 중요하고, 문구는 구현 세부다.
       */
      expect(r.subscribed).toBe(false);
      expect(r.payloads).toEqual([]);
    }, TEST_MS);
  }

  it("★ 미승인 병원이 상태를 눌러도 보호자에게 가지 않는다", async () => {
    // 먼저 승인 상태로 붙고 나서 승인을 내리는 것이 아니라, 처음부터 미승인이다.
    await setVerification("PENDING");
    const r = await listen(() => postStatus("CLOSED"));

    expect(r.subscribed).toBe(false);
    expect(r.payloads).toEqual([]);
  }, TEST_MS);
});
