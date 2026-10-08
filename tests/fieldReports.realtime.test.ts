import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  FIELD_REPORT_EVENT,
  FIELD_REPORT_REMOVED_EVENT,
  FIELD_REPORT_TOPIC,
  fetchFieldReports,
  subscribeFieldReports,
  type FieldReportSignal,
} from "@/features/chat/repository";
import type { ChatDraft } from "@/features/chat/types";
import { requireLocalKeys } from "../vitest.setup";

/**
 * 현장톡이 서버에 남고 다른 사람에게 가는지 확인한다.
 *
 * 이 기능의 전부가 그 두 가지다. 글이 브라우저 메모리에만 있으면 "실시간 정보공유방"이
 * 아니라 혼잣말이다. 그래서 순수 로직이 아니라 실제 DB·웹소켓으로 본다.
 */

const { url, anonKey, serviceKey } = requireLocalKeys();
const REST = `${url}/rest/v1`;
const admin = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
const TEST_MS = 30_000;

let anon: SupabaseClient;
const created: string[] = [];
/** 반응 주체. 이제 게스트 세션이다 — 운영자 권한으로 직접 만들어 쓴다. */
let guestA = "";
let guestB = "";

async function makeGuest(nickname: string): Promise<string> {
  const res = await fetch(`${REST}/guest_sessions`, {
    method: "POST",
    headers: { ...admin, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      token_hash: `test-${nickname}-${Math.random().toString(36).slice(2)}`,
      nickname,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    }),
  });
  if (!res.ok) throw new Error(`세션 생성 실패 → ${res.status} ${await res.text()}`);
  return ((await res.json()) as { id: string }[])[0].id;
}

async function react(reportId: string, key: string, guestId: string): Promise<void> {
  const res = await fetch(`${REST}/field_report_reactions`, {
    method: "POST",
    headers: { ...admin, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ report_id: reportId, key, guest_id: guestId }),
  });
  if (!res.ok) throw new Error(`반응 심기 실패 → ${res.status} ${await res.text()}`);
}

function draft(over: Partial<ChatDraft> = {}): ChatDraft {
  return {
    category: "laceration",
    topic: null,
    body: "지금 접수 가능하다고 안내받았어요.",
    scope: { sido: "서울", sigungu: "강서구", hospitalId: null, hospitalName: null },
    ...over,
  };
}

/**
 * 글을 심는다. 쓰기는 이제 서버 라우트만 할 수 있으므로(migration 20260930) 여기서는
 * 운영자 권한으로 직접 넣는다. 이 파일이 보는 것은 읽기·공개 범위·실시간이고,
 * 쓰기 경로 자체는 tests/guestWrites.realtime.test.ts 가 본다.
 */
async function post(over: Partial<ChatDraft> = {}, handle = "야간지킴이") {
  const d = draft(over);
  const id = crypto.randomUUID();
  const res = await fetch(`${REST}/field_reports`, {
    method: "POST",
    headers: { ...admin, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      id,
      category: d.category,
      topic: d.topic,
      body: d.body,
      sido: d.scope.sido,
      sigungu: d.scope.sigungu,
      hospital_id: d.scope.hospitalId,
      hospital_name: d.scope.hospitalName,
      handle,
    }),
  });
  if (!res.ok) throw new Error(`심기 실패 → ${res.status} ${await res.text()}`);
  created.push(id);
  return { id, body: d.body };
}

/** 운영자가 콘솔에서 격리하는 것과 같다. 화면에는 격리 버튼이 아직 없다. */
async function quarantine(id: string): Promise<void> {
  const res = await fetch(`${REST}/field_reports?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...admin, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ visibility: "QUARANTINED" }),
  });
  if (!res.ok) throw new Error(`격리 실패 → ${res.status} ${await res.text()}`);
}

beforeAll(async () => {
  anon = createClient(url, anonKey, { auth: { persistSession: false } });
  guestA = await makeGuest("테스트가호");
  guestB = await makeGuest("테스트나호");
}, TEST_MS);

afterEach(async () => {
  if (created.length === 0) return;
  const ids = created.splice(0).join(",");
  await fetch(`${REST}/field_reports?id=in.(${ids})`, { method: "DELETE", headers: admin });
});

afterAll(async () => {
  await anon.removeAllChannels();
});

describe("글이 서버에 남는다", () => {
  it("★ 보낸 글을 다시 읽을 수 있다 — 새로고침해도 사라지지 않는다", async () => {
    const saved = await post({ body: "봉합 접수 가능하다고 들었어요." });

    // 다른 클라이언트로 읽는다. 브라우저 메모리가 아니라 서버에 있다는 뜻이다.
    const reader = createClient(url, anonKey, { auth: { persistSession: false } });
    const messages = await fetchFieldReports(reader);

    const found = messages.find((m) => m.id === saved.id);
    expect(found?.body).toBe("봉합 접수 가능하다고 들었어요.");
    expect(found?.scope.sigungu).toBe("강서구");
  }, TEST_MS);

  it("★ 최신이 앞이다", async () => {
    const first = await post({ body: "먼저 쓴 글입니다." });
    await new Promise((r) => setTimeout(r, 1_100));
    const second = await post({ body: "나중에 쓴 글입니다." });

    const messages = await fetchFieldReports(anon);
    const firstIndex = messages.findIndex((m) => m.id === first.id);
    const secondIndex = messages.findIndex((m) => m.id === second.id);
    expect(secondIndex).toBeLessThan(firstIndex);
  }, TEST_MS);

  it("지역을 특정하지 않은 글도 쓸 수 있다", async () => {
    const saved = await post({
      scope: { sido: null, sigungu: null, hospitalId: null, hospitalName: null },
    });
    const messages = await fetchFieldReports(anon);
    expect(messages.find((m) => m.id === saved.id)?.scope.sido).toBeNull();
  }, TEST_MS);

  it("★ 시군구만 있고 시도가 없는 글은 저장되지 않는다 — 어디인지 알 수 없다", async () => {
    await expect(
      post({ scope: { sido: null, sigungu: "강서구", hospitalId: null, hospitalName: null } }),
    ).rejects.toThrow();
  }, TEST_MS);
});

describe("공개 범위", () => {
  it("★ 격리된 글은 목록에서 사라진다", async () => {
    const saved = await post({ body: "격리될 글입니다." });
    expect((await fetchFieldReports(anon)).some((m) => m.id === saved.id)).toBe(true);

    await quarantine(saved.id);
    expect((await fetchFieldReports(anon)).some((m) => m.id === saved.id)).toBe(false);
  }, TEST_MS);

  it("★ 원본 표는 anon 에게 닫혀 있다 — 읽기는 뷰로만 나간다", async () => {
    const { data, error } = await anon.from("field_reports").select("id,visibility");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  }, TEST_MS);

  it("★ anon 은 남의 글을 고치거나 지울 수 없다", async () => {
    const saved = await post({ body: "고쳐지면 안 되는 글입니다." });

    await anon.from("field_reports").update({ body: "바뀐 내용" }).eq("id", saved.id);
    await anon.from("field_reports").delete().eq("id", saved.id);

    const messages = await fetchFieldReports(anon);
    expect(messages.find((m) => m.id === saved.id)?.body).toBe("고쳐지면 안 되는 글입니다.");
  }, TEST_MS);

  it("★ anon 은 아예 쓸 수 없다 — insert 정책을 회수했다", async () => {
    const { error } = await anon.from("field_reports").insert({
      category: "laceration",
      body: "몰래 넣는 글",
      handle: "야간지킴이",
    });
    expect(error?.code).toBe("42501");
  }, TEST_MS);
});

describe("반응", () => {
  it("★ 누른 반응이 수로 돌아온다", async () => {
    const saved = await post();
    await react(saved.id, "low_wait", guestA);

    const messages = await fetchFieldReports(anon);
    expect(messages.find((m) => m.id === saved.id)?.baseReactions.low_wait).toBe(1);
  }, TEST_MS);

  it("★ 같은 사람이 두 번 눌러도 하나로 센다", async () => {
    const saved = await post();
    await react(saved.id, "low_wait", guestA);
    await react(saved.id, "low_wait", guestA);

    const messages = await fetchFieldReports(anon);
    expect(messages.find((m) => m.id === saved.id)?.baseReactions.low_wait).toBe(1);
  }, TEST_MS);

  it("다른 사람이 누르면 는다", async () => {
    const saved = await post();
    await react(saved.id, "low_wait", guestA);
    await react(saved.id, "low_wait", guestB);

    const messages = await fetchFieldReports(anon);
    expect(messages.find((m) => m.id === saved.id)?.baseReactions.low_wait).toBe(2);
  }, TEST_MS);

  it("★ 누가 눌렀는지는 나가지 않는다", async () => {
    const saved = await post();
    await react(saved.id, "low_wait", guestA);

    const { data } = await anon.from("field_report_reaction_counts").select("*").eq("report_id", saved.id);
    expect(Object.keys((data ?? [])[0] ?? {})).not.toContain("guest_id");
    // 원본 표도 닫혀 있다.
    const raw = await anon.from("field_report_reactions").select("guest_id");
    expect(raw.data).toEqual([]);
  }, TEST_MS);
});

describe("실시간", () => {
  /** 구독을 열고, 그 뒤에 일어난 일을 받는다. */
  async function listen(run: () => Promise<void>): Promise<FieldReportSignal[]> {
    const signals: FieldReportSignal[] = [];
    const client = createClient(url, anonKey, { auth: { persistSession: false } });
    const stop = subscribeFieldReports(client, (signal) => signals.push(signal));

    // 구독이 확정될 때까지 기다린다. 확정 전에 쓰면 그 이벤트를 놓친다.
    await new Promise((r) => setTimeout(r, 1_500));
    await run();
    await new Promise((r) => setTimeout(r, 1_500));

    stop();
    await client.removeAllChannels();
    return signals;
  }

  it("★ 다른 사람이 쓴 글이 실시간으로 온다", async () => {
    let posted = "";
    const signals = await listen(async () => {
      posted = (await post({ body: "실시간으로 갈 글입니다." })).id;
    });

    const arrived = signals.find((s) => s.kind === "upsert" && s.message.id === posted);
    expect(arrived, "글이 도착하지 않았습니다").toBeDefined();
    if (arrived?.kind !== "upsert") throw new Error("모양이 다르다");
    expect(arrived.message.body).toBe("실시간으로 갈 글입니다.");
    expect(arrived.message.scope.sigungu).toBe("강서구");
  }, TEST_MS);

  it("★ 페이로드에 운영용 값이 실리지 않는다", async () => {
    let posted = "";
    const signals = await listen(async () => {
      posted = (await post()).id;
    });

    const arrived = signals.find((s) => s.kind === "upsert" && s.message.id === posted);
    if (arrived?.kind !== "upsert") throw new Error("글이 도착하지 않았습니다");
    // 도메인 모양으로 변환된 뒤라 원본 키가 남아 있으면 안 된다.
    const keys = Object.keys(arrived.message as unknown as Record<string, unknown>);
    expect(keys).not.toContain("visibility");
    expect(keys).not.toContain("public_until");
    expect(keys).not.toContain("version");
  }, TEST_MS);

  it("★ 격리하면 사라졌다고 알린다 — 읽고 있던 사람 화면에서도 빠져야 한다", async () => {
    const saved = await post({ body: "격리될 글입니다." });

    const signals = await listen(async () => {
      await quarantine(saved.id);
    });

    const removed = signals.find((s) => s.kind === "remove" && s.id === saved.id);
    expect(removed, "격리 신호가 오지 않았습니다").toBeDefined();
    // 격리된 글의 내용이 다시 실려 나가지 않는다.
    expect(signals.some((s) => s.kind === "upsert" && s.message.id === saved.id)).toBe(false);
  }, TEST_MS);

  it("토픽 이름이 트리거·정책과 같다", () => {
    expect(FIELD_REPORT_TOPIC).toBe("field-reports");
    expect(FIELD_REPORT_EVENT).toBe("field_report");
    expect(FIELD_REPORT_REMOVED_EVENT).toBe("field_report_removed");
  });
});
