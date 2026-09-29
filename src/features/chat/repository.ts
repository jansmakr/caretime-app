import type { SupabaseClient } from "@supabase/supabase-js";
import { ZERO_REACTIONS, type ReactionCounts, type ReactionKey } from "./reactions";
import type { ChatDraft, ChatMessage } from "./types";

/**
 * 현장톡 ↔ Supabase.
 *
 * 읽기는 원본 표가 아니라 공개 뷰를 본다(field_reports_public). 뷰가 격리·삭제된 글과
 * 공개 기간이 지난 글을 걸러 주고, 내보낼 컬럼이 그 한 곳에 적혀 있다.
 *
 * 실시간은 postgres_changes 가 아니라 broadcast 다. 원본 표를 열지 않고 트리거가 고른
 * 값만 보낸다(migration 20260929). 그래서 "무엇이 공개되는가"의 결정 지점이 하나다.
 */

/** 공개 뷰가 돌려주는 모양. 트리거가 broadcast 로 보내는 페이로드와 같은 컬럼이다. */
export interface FieldReportRow {
  id: string;
  category: ChatMessage["category"];
  topic: string | null;
  body: string;
  sido: string | null;
  sigungu: string | null;
  hospital_id: string | null;
  hospital_name: string | null;
  handle: string;
  created_at: string;
}

const REPORT_COLUMNS =
  "id,category,topic,body,sido,sigungu,hospital_id,hospital_name,handle,created_at";

/** 한 번에 읽어 오는 글 수. 방이 커지기 전까지는 이 정도면 첫 화면이 다 찬다. */
export const FIELD_REPORT_PAGE = 100;

export const FIELD_REPORT_TOPIC = "field-reports";
export const FIELD_REPORT_EVENT = "field_report";
export const FIELD_REPORT_REMOVED_EVENT = "field_report_removed";

export function toChatMessage(
  row: FieldReportRow,
  reactions: ReactionCounts = ZERO_REACTIONS,
  mine = false,
): ChatMessage {
  return {
    id: row.id,
    category: row.category,
    topic: row.topic,
    body: row.body,
    scope: {
      sido: (row.sido as ChatMessage["scope"]["sido"]) ?? null,
      sigungu: row.sigungu,
      hospitalId: row.hospital_id,
      hospitalName: row.hospital_name,
    },
    handle: row.handle,
    mine,
    baseReactions: reactions,
    createdAt: row.created_at,
  };
}

interface ReactionCountRow {
  report_id: string;
  key: ReactionKey;
  count: number;
}

/** 반응 수를 글 id 별로 묶는다. 누가 눌렀는지는 뷰가 내보내지 않는다. */
export function groupReactions(rows: ReactionCountRow[]): Record<string, ReactionCounts> {
  const byReport: Record<string, ReactionCounts> = {};
  for (const row of rows) {
    const current = byReport[row.report_id] ?? { ...ZERO_REACTIONS };
    current[row.key] = row.count;
    byReport[row.report_id] = current;
  }
  return byReport;
}

/**
 * 첫 화면에 쓸 글 목록.
 *
 * 서버 렌더에서도 부른다. 그래야 첫 화면부터 글이 보인다 — 클라이언트에서만 읽으면
 * 처음 그려지는 것은 언제나 빈 방이고, 그건 출시 직후에 특히 나쁘다.
 */
export async function fetchFieldReports(client: SupabaseClient): Promise<ChatMessage[]> {
  const [reports, counts] = await Promise.all([
    client
      .from("field_reports_public")
      .select(REPORT_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(FIELD_REPORT_PAGE),
    client.from("field_report_reaction_counts").select("report_id,key,count"),
  ]);

  if (reports.error) throw new Error(`현장톡 조회 실패: ${reports.error.message}`);
  if (counts.error) throw new Error(`반응 조회 실패: ${counts.error.message}`);

  const byReport = groupReactions((counts.data ?? []) as unknown as ReactionCountRow[]);
  return ((reports.data ?? []) as unknown as FieldReportRow[]).map((row) =>
    toChatMessage(row, byReport[row.id] ?? ZERO_REACTIONS),
  );
}

/**
 * 글 저장. **서버 라우트를 거친다.**
 *
 * 예전에는 브라우저가 anon 키로 직접 insert 했다. 그 키는 번들에 들어가는 공개 값이라,
 * 화면의 쿨다운은 그 키를 들고 직접 POST 하는 사람에게 아무 의미가 없었다.
 * 이제 DB 의 insert 정책을 회수했고(migration 20260930) 쓰기는 이 경로 하나다.
 *
 * id 는 여기서 만든다. 그것이 곧 멱등성 키다 — 같은 요청이 두 번 가도 서버가 같은 글
 * 하나를 돌려준다. 모바일에서 응답이 늦어 다시 누르는 일은 흔하다.
 *
 * 닉네임은 서버가 정한다. 화면이 보낸 값을 쓰지 않는다.
 */
export class RateLimitedError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("잠시 후 다시 보낼 수 있습니다.");
    this.name = "RateLimitedError";
  }
}

export async function insertFieldReport(draft: ChatDraft, now: Date = new Date()): Promise<ChatMessage> {
  const id = newReportId();
  const response = await fetch("/api/field-reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // 쿠키(세션)가 같이 가야 한다. 같은 출처라 기본값으로도 가지만 뜻을 적어 둔다.
    credentials: "same-origin",
    body: JSON.stringify({
      id,
      category: draft.category,
      topic: draft.topic,
      body: draft.body,
      sido: draft.scope.sido,
      sigungu: draft.scope.sigungu,
      hospitalId: draft.scope.hospitalId,
      hospitalName: draft.scope.hospitalName,
    }),
  });

  if (response.status === 429) {
    const payload = (await response.json().catch(() => ({}))) as { retryAfterSeconds?: number };
    throw new RateLimitedError(payload.retryAfterSeconds ?? 30);
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? "저장하지 못했습니다.");
  }

  const saved = (await response.json()) as { id: string; handle: string; createdAt: string };
  return toChatMessage(
    {
      id: saved.id,
      category: draft.category,
      topic: draft.topic,
      body: draft.body,
      sido: draft.scope.sido,
      sigungu: draft.scope.sigungu,
      hospital_id: draft.scope.hospitalId,
      hospital_name: draft.scope.hospitalName,
      handle: saved.handle,
      created_at: saved.createdAt || now.toISOString(),
    },
    ZERO_REACTIONS,
    true,
  );
}

function newReportId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(16)}-0000-4000-8000-${Math.random().toString(16).slice(2, 14)}`;
}

/**
 * 반응 누르기. 역시 서버 라우트를 거친다.
 *
 * 실패해도 던지지 않는다. 반응 하나가 안 올라간 것으로 사용자를 붙잡지 않는다 —
 * 화면은 이미 눌린 것으로 보이고, 다음에 읽을 때 서버 값으로 맞춰진다.
 */
export async function insertReaction(reportId: string, key: ReactionKey): Promise<void> {
  await fetch("/api/field-reports/reactions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ reportId, key }),
  }).catch(() => undefined);
}

/** 이 브라우저의 닉네임. 서버가 세션을 만들고 정한다. */
export async function fetchGuestNickname(): Promise<string | null> {
  try {
    const response = await fetch("/api/guest", { credentials: "same-origin" });
    if (!response.ok) return null;
    return ((await response.json()) as { nickname?: string }).nickname ?? null;
  } catch {
    return null;
  }
}

export type FieldReportSignal =
  | { kind: "upsert"; message: ChatMessage }
  | { kind: "remove"; id: string };

/**
 * 실시간 구독.
 *
 * 받은 글에는 반응 수가 실려 있지 않다. 새 글의 반응은 0에서 시작하고, 기존 글의
 * 반응 변화는 이 경로로 오지 않는다 — 반응까지 실시간으로 맞추려면 반응 표에도
 * 트리거를 달아야 하고, 그건 양이 늘고 나서 판단할 일이다.
 */
export function subscribeFieldReports(
  client: SupabaseClient,
  onSignal: (signal: FieldReportSignal) => void,
): () => void {
  const channel = client
    .channel(FIELD_REPORT_TOPIC, { config: { private: true } })
    .on("broadcast", { event: FIELD_REPORT_EVENT }, (message) => {
      onSignal({ kind: "upsert", message: toChatMessage(message.payload as FieldReportRow) });
    })
    .on("broadcast", { event: FIELD_REPORT_REMOVED_EVENT }, (message) => {
      onSignal({ kind: "remove", id: (message.payload as { id: string }).id });
    });

  channel.subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}
