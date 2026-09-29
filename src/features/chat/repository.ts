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
 * 글 저장.
 *
 * 공개 기간·표시 상태는 보내지 않는다. 글쓴이가 정할 값이 아니고 DB 의 default 가 정한다.
 * RLS 정책도 그 값들이 손대지 않은 상태여야 통과시킨다.
 *
 * **저장 후 되읽지 않는다.** 되읽으려면 원본 표에 anon select 정책이 있어야 하는데,
 * 그걸 열면 visibility·public_until·version 까지 같이 열린다. 읽기를 뷰로만 내보내기로
 * 한 결정이 거기서 무너진다.
 *
 * 그래서 id 는 클라이언트가 만든다. 돌려주는 값은 화면에 바로 보여 줄 **잠정 글**이고,
 * 잠시 뒤 broadcast 로 서버가 확정한 같은 id 의 글이 와서 갈아 끼운다(createdAt 포함).
 * 그 사이에 보이는 시각이 몇 밀리초 다를 수 있다. 화면은 "방금"으로 읽는다.
 */
export async function insertFieldReport(
  client: SupabaseClient,
  draft: ChatDraft,
  handle: string,
  now: Date = new Date(),
): Promise<ChatMessage> {
  const id = newReportId();
  const { error } = await client.from("field_reports").insert({
    id,
    category: draft.category,
    topic: draft.topic,
    body: draft.body,
    sido: draft.scope.sido,
    sigungu: draft.scope.sigungu,
    hospital_id: draft.scope.hospitalId,
    hospital_name: draft.scope.hospitalName,
    handle,
  });

  if (error) throw new Error(`현장톡 저장 실패: ${error.message}`);

  return toChatMessage(
    {
      id,
      category: draft.category,
      topic: draft.topic,
      body: draft.body,
      sido: draft.scope.sido,
      sigungu: draft.scope.sigungu,
      hospital_id: draft.scope.hospitalId,
      hospital_name: draft.scope.hospitalName,
      handle,
      created_at: now.toISOString(),
    },
    ZERO_REACTIONS,
    true,
  );
}

function newReportId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // 아주 오래된 환경용. 충돌하면 기본키가 막고 저장이 실패한다 — 조용히 덮어쓰지 않는다.
  return `${Date.now().toString(16)}-0000-4000-8000-${Math.random().toString(16).slice(2, 14)}`;
}

/**
 * 반응 누르기.
 *
 * 취소는 아직 서버로 가지 않는다 — 누른 사람을 증명할 방법이 없어서 삭제 정책을 만들지
 * 않았다(migration 주석). 게스트 세션이 생기는 턴에 연다.
 * 같은 사람이 같은 반응을 두 번 눌러도 기본키가 막는다. 그건 오류가 아니다.
 */
export async function insertReaction(
  client: SupabaseClient,
  reportId: string,
  key: ReactionKey,
  reactorKey: string,
): Promise<void> {
  const { error } = await client
    .from("field_report_reactions")
    .insert({ report_id: reportId, key, reactor_key: reactorKey });

  // 23505 = 이미 누름. 사용자에게 알릴 일이 아니다.
  if (error && error.code !== "23505") throw new Error(`반응 저장 실패: ${error.message}`);
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
