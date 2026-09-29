import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SERVICE_STATUS_EVENT,
  serviceStatusTopic,
  subscribeHospitalChanges,
} from "@/features/hospitals/realtime";

/**
 * 구독 배선을 가짜 클라이언트로 고정한다.
 *
 * 무엇을 막는가:
 *  1) 구독 확정 직후의 다시 읽기가 사라지는 것. Realtime 서버는 broadcast 용
 *     replication slot 을 첫 private 채널 구독 시점에 lazy 하게 만들고, 그 경합에서
 *     **첫 이벤트가 유실된다**(로컬 검증에서 실제로 겪었다). 즉 "구독 성공"이
 *     "이 순간 이후를 전부 받는다"를 보장하지 않는다. 그래서 한 번 더 읽는다.
 *     이 배선이 "구독했는데 왜 또 읽지?"로 보여 지워지면 배포 직후 첫 변경이
 *     조용히 사라진다. 그래서 테스트로 못박는다.
 *  2) 토픽 문자열이 DB 정책과 갈라지는 것. 트리거가 보내는 토픽과 정책이 검사하는
 *     토픽과 클라이언트가 듣는 토픽이 같은 문자열이어야 한다.
 *  3) broadcast 채널 실패가 연결 표시를 "끊김"으로 만드는 것. 승인되지 않은 병원에서
 *     구독 거절은 정상이고, 나머지 정보는 정상적으로 오고 있다.
 */

type Handler = (...args: unknown[]) => void;

interface FakeChannel {
  topic: string;
  config: unknown;
  handlers: { type: string; filter: unknown; handler: Handler }[];
  subscribeCallbacks: ((status: string, err?: Error) => void)[];
  subscribeCalls: number;
  on: (type: string, filter: unknown, handler: Handler) => FakeChannel;
  subscribe: (cb?: (status: string, err?: Error) => void) => FakeChannel;
}

function fakeClient() {
  const channels: FakeChannel[] = [];
  const removed: string[] = [];

  const client = {
    channel(topic: string, opts?: unknown) {
      const ch: FakeChannel = {
        topic,
        config: opts,
        handlers: [],
        subscribeCallbacks: [],
        subscribeCalls: 0,
        on(type, filter, handler) {
          ch.handlers.push({ type, filter, handler });
          return ch;
        },
        subscribe(cb) {
          ch.subscribeCalls += 1;
          if (cb) ch.subscribeCallbacks.push(cb);
          return ch;
        },
      };
      channels.push(ch);
      return ch;
    },
    removeChannel(ch: FakeChannel) {
      removed.push(ch.topic);
      return Promise.resolve("ok");
    },
  };

  return { client: client as unknown as SupabaseClient, channels, removed };
}

function wire(withSignal = true) {
  const fake = fakeClient();
  const changes: unknown[] = [];
  const statuses: string[] = [];
  let signals = 0;

  const unsubscribe = subscribeHospitalChanges(
    fake.client,
    "h_001",
    (c) => changes.push(c),
    (s) => statuses.push(s),
    withSignal ? () => (signals += 1) : undefined,
  );

  const rowChannel = fake.channels[0];
  const broadcastChannel = fake.channels.find((c) => c.topic === serviceStatusTopic("h_001"));
  return { ...fake, changes, statuses, signal: () => signals, unsubscribe, rowChannel, broadcastChannel };
}

describe("구독 확정 → 다시 읽기", () => {
  it("★ SUBSCRIBED 가 오면 live 를 알린다 (받는 쪽이 전체를 다시 읽는 계기)", () => {
    const w = wire();
    expect(w.statuses).toEqual([]);

    for (const cb of w.rowChannel.subscribeCallbacks) cb("SUBSCRIBED");
    expect(w.statuses).toEqual(["live"]);
  });

  it("★ DB 구독 확정(system ok)도 live 를 다시 알린다 — 그 사이 변경을 놓치지 않게", () => {
    const w = wire();
    const system = w.rowChannel.handlers.find((h) => h.type === "system");
    expect(system).toBeDefined();

    system!.handler({ extension: "postgres_changes", status: "ok" });
    expect(w.statuses).toEqual(["live"]);
  });

  it("끊기면 offline 을 알린다", () => {
    const w = wire();
    for (const cb of w.rowChannel.subscribeCallbacks) cb("CHANNEL_ERROR");
    expect(w.statuses).toEqual(["offline"]);
  });
});

describe("broadcast 채널", () => {
  it("★ 토픽이 hospital:<id> 다 — 트리거·정책과 같은 문자열", () => {
    const w = wire();
    expect(serviceStatusTopic("h_001")).toBe("hospital:h_001");
    expect(w.broadcastChannel?.topic).toBe("hospital:h_001");
  });

  it("private 채널로 연다 — realtime.messages 의 RLS 를 타야 한다", () => {
    const w = wire();
    expect(w.broadcastChannel?.config).toEqual({ config: { private: true } });
  });

  it("★ 이벤트가 오면 신호만 넘긴다 (페이로드를 쓰지 않는다)", () => {
    const w = wire();
    const handler = w.broadcastChannel?.handlers.find((h) => h.type === "broadcast");
    expect(handler?.filter).toEqual({ event: SERVICE_STATUS_EVENT });

    handler!.handler({ payload: { status: "CLOSED" } });
    expect(w.signal()).toBe(1);
    // 신호는 변경 목록으로 가지 않는다. 행을 화면에 바로 반영할 수 없기 때문이다.
    expect(w.changes).toEqual([]);
  });

  it("★ broadcast 구독 실패는 연결 표시를 건드리지 않는다", () => {
    const w = wire();
    // 승인되지 않은 병원에서는 구독이 거절된다. 그건 정상이고, 나머지 정보는 오고 있다.
    for (const cb of w.broadcastChannel?.subscribeCallbacks ?? []) cb("CHANNEL_ERROR");
    expect(w.statuses).toEqual([]);
  });

  it("신호 콜백을 넘기지 않으면 채널을 열지 않는다", () => {
    const w = wire(false);
    expect(w.broadcastChannel).toBeUndefined();
    expect(w.channels).toHaveLength(1);
  });

  it("해제하면 두 채널을 모두 닫는다", () => {
    const w = wire();
    w.unsubscribe();
    expect(w.removed).toHaveLength(2);
    expect(w.removed).toContain("hospital:h_001");
  });
});

describe("행을 싣는 테이블", () => {
  it("4개 테이블을 병원 id 로 걸러 구독한다", () => {
    const w = wire();
    const tables = w.rowChannel.handlers
      .filter((h) => h.type === "postgres_changes")
      .map((h) => (h.filter as { table: string; filter: string }).table);

    expect(tables.sort()).toEqual([
      "hospital_contact_status",
      "hospital_daily_hours",
      "hospital_live_status",
      "hospital_waiting_status",
    ]);
    for (const h of w.rowChannel.handlers.filter((x) => x.type === "postgres_changes")) {
      expect((h.filter as { filter: string }).filter).toBe("hospital_id=eq.h_001");
    }
  });

  it("★ service_statuses 는 postgres_changes 로 구독하지 않는다 — anon 에게 오지 않는다", () => {
    const w = wire();
    const tables = w.rowChannel.handlers
      .filter((h) => h.type === "postgres_changes")
      .map((h) => (h.filter as { table: string }).table);
    expect(tables).not.toContain("service_statuses");
  });

  it("DELETE 이벤트는 무시한다 — 삭제 권한이 누구에게도 없다", () => {
    const w = wire();
    const h = w.rowChannel.handlers.find(
      (x) => (x.filter as { table?: string }).table === "hospital_live_status",
    );
    h!.handler({ eventType: "DELETE", new: {} });
    expect(w.changes).toEqual([]);

    h!.handler({ eventType: "UPDATE", new: { hospital_id: "h_001" } });
    expect(w.changes).toHaveLength(1);
  });
});
