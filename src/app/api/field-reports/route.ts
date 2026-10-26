import { NextResponse, type NextRequest } from "next/server";
import {
  GUEST_COOKIE,
  createGuestSession,
  findGuestSession,
  setGuestCookie,
  touchGuestSession,
  type GuestSession,
} from "@/features/chat/guestSession";
import { checkRate, isDuplicateBody } from "@/features/p0/limits";
import { findPiiExcludingKnown } from "@/features/p0/pii";
import { findAbuse } from "@/features/p0/abuse";
import { resolveLimits } from "@/features/p0/serverLimits";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { areWritesOpen } from "@/lib/demoContent";
import { CHAT_BODY_MAX, CHAT_TOPIC_MAX } from "@/features/chat/types";

/**
 * 현장톡 글 저장. **유일한 쓰기 경로다.**
 *
 * anon 키는 브라우저 번들에 들어가는 공개 값이다. 그래서 화면의 쿨다운은 그 키를 들고
 * 직접 POST 하는 사람에게 아무 의미가 없다. RLS 의 insert 정책을 회수하고(migration
 * 20260930) 여기서만 쓴다. 판정 순서는 세션 → 제한 → 저장이고, 어느 하나라도 걸리면
 * 저장하지 않는다.
 *
 * 멱등성: 글 id 를 클라이언트가 만든다. 같은 요청이 두 번 오면 두 번째는 기본키에서
 * 막히고, 그것을 **성공으로** 돌려준다. 모바일에서 응답이 늦어 다시 누르는 일은 흔하고,
 * 그때 글이 두 개 생기는 것보다 같은 글이 하나 있는 편이 맞다.
 *
 * 답글도 여기로 온다(parentId). 답글은 글과 같은 표·같은 검증·같은 신고 격리를 탄다
 * (migration 20261022). 다른 것은 셋이다 — 제한을 따로 세고(limits.replies), 같은 내용
 * 비교를 부모 글 기준으로 하고, 지역·병원 칸을 비운다. 답글에 답글은 없다.
 */
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CATEGORIES = new Set(["laceration", "burn", "other"]);

interface Body {
  id?: unknown;
  category?: unknown;
  topic?: unknown;
  body?: unknown;
  sido?: unknown;
  sigungu?: unknown;
  hospitalId?: unknown;
  hospitalName?: unknown;
  parentId?: unknown;
}

/** 답글을 달 부모 글. select("*") 로 읽는다 — parent_id 컬럼이 아직 없는 DB 를 알아보려고. */
interface ParentRow {
  id: string;
  category: string;
  visibility: string;
  parent_id?: string | null;
}

/** 최근 쓴 것. parent_id 가 없는 DB(migration 전)에서는 키가 없다 — 그때는 전부 원글이다. */
interface RecentRow {
  created_at: string;
  body: string;
  hospital_id: string | null;
  parent_id?: string | null;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.length > max) return null;
  return trimmed;
}

export async function POST(request: NextRequest) {
  /*
   * 출시 전 공개 기간에는 받지 않는다. 화면만 닫는 것은 닫은 것이 아니다 —
   * 주소와 요청 모양을 아는 사람은 그대로 쓸 수 있다. (lib/demoContent.areWritesOpen)
   */
  if (!areWritesOpen()) {
    return NextResponse.json({ error: "아직 준비 중입니다." }, { status: 503 });
  }
  const admin = createAdminSupabase();

  // ── 1. 세션 ──
  const token = request.cookies.get(GUEST_COOKIE)?.value;
  let session: GuestSession | null = await findGuestSession(admin, token);
  let freshToken: string | null = null;
  if (!session) {
    const created = await createGuestSession(admin);
    session = created.session;
    freshToken = created.token;
  }

  // ── 2. 모양 ──
  let payload: Body;
  try {
    payload = (await request.json()) as Body;
  } catch {
    return fail(400, "요청을 읽을 수 없습니다.", freshToken);
  }

  const id = typeof payload.id === "string" && UUID.test(payload.id) ? payload.id : null;
  const category = typeof payload.category === "string" && CATEGORIES.has(payload.category)
    ? payload.category
    : null;
  const body = text(payload.body, CHAT_BODY_MAX);
  const sido = payload.sido === null || payload.sido === undefined ? null : text(payload.sido, 20);
  const sigungu =
    payload.sigungu === null || payload.sigungu === undefined ? null : text(payload.sigungu, 30);

  const parentId =
    payload.parentId === null || payload.parentId === undefined
      ? null
      : typeof payload.parentId === "string" && UUID.test(payload.parentId)
        ? payload.parentId
        : undefined;
  if (parentId === undefined) return fail(400, "답글을 저장할 수 없습니다.", freshToken);
  const isReply = parentId !== null;

  // 답글은 분류를 고르지 않는다. 부모 글의 분류를 따른다(아래에서 채운다).
  if (!id || (!category && !isReply) || !body) return fail(400, "글을 저장할 수 없습니다.", freshToken);

  /*
   * 개인정보는 올라가기 전에 막는다. 한 번 올라간 값은 지우기 전에 이미 읽힌다.
   * 판정은 서버가 한다 — 화면에서만 막으면 화면을 거치지 않는 요청에 뚫린다.
   *
   * 병원 대표번호는 통과시킨다. "여기 02-1234-5678로 전화해 보세요"는 개인정보가
   * 아니라 도움이 되는 정보다. 단 **아는 번호만** 통과한다 — "병원 번호처럼 보이면
   * 통과"로 만들면 개인 번호를 병원 번호인 척 적을 수 있다.
   */
  const { data: phoneRows } = await admin.from("hospitals").select("tel");
  const knownPhones = ((phoneRows ?? []) as { tel: string | null }[])
    .map((row) => row.tel)
    .filter((tel): tel is string => tel !== null);

  const pii = findPiiExcludingKnown(body, knownPhones);
  if (pii) return fail(422, pii.message, freshToken);

  /*
   * 욕설. 개인정보와 같은 자리에서 막는다 — 올라간 뒤에 지우면 이미 읽혔다.
   *
   * **문맥 비방은 여기서 안 걸린다.** "○○병원 불친절해요"에는 욕이 없다. 그건
   * 신고 → 격리가 맡는다. 작성창 문구도 거기에 맞춰 "올릴 수 없습니다"까지만 쓴다
   * (features/p0/abuse 의 주석).
   */
  const abuse = findAbuse(body);
  if (abuse) return fail(422, abuse.message, freshToken);
  // 시군구만 있으면 어디인지 알 수 없다. DB 의 CHECK 와 같은 규칙을 여기서 먼저 본다.
  if (!isReply && sigungu !== null && sido === null) {
    return fail(400, "지역이 올바르지 않습니다.", freshToken);
  }

  /*
   * 답글을 달 수 있는 글인가. 보이는 원글에만 단다 — 내려간 글에 달린 답글은 아무도
   * 못 보고(답글 뷰가 부모 상태를 함께 본다), 답글에 단 답글은 화면에 자리가 없다.
   */
  let parent: ParentRow | null = null;
  if (isReply) {
    const { data, error: parentError } = await admin
      .from("field_reports")
      .select("*")
      .eq("id", parentId)
      .maybeSingle();
    if (parentError) return fail(500, "저장하지 못했습니다.", freshToken);
    parent = data as ParentRow | null;
    // 컬럼이 없다 = migration 20261022 전이다. 화면이 먼저 나간 경우다.
    if (parent && !("parent_id" in parent)) return fail(503, "답글은 아직 준비 중입니다.", freshToken);
    if (!parent || parent.visibility !== "VISIBLE") {
      return fail(404, "답글을 달 수 없는 글입니다. 지워졌거나 내려간 글입니다.", freshToken);
    }
    if (parent.parent_id) return fail(400, "답글에는 답글을 달 수 없습니다.", freshToken);
  }

  /*
   * ── 3. 멱등성 — **제한보다 먼저** ──
   *
   * 재시도는 새 요청이 아니다. 제한을 먼저 보면 같은 요청의 두 번째가 429 로 떨어지고,
   * 화면은 "보내지 못했다"고 말하지만 글은 이미 저장돼 있다. 사용자는 다시 누른다.
   * 그게 멱등성을 둔 이유를 정확히 거스른다.
   *
   * 그래서 같은 id 가 이미 있으면 여기서 끝낸다. 세지 않고, 저장하지도 않는다.
   */
  const { data: already } = await admin
    .from("field_reports")
    .select("id,handle,created_at,guest_id")
    .eq("id", id)
    .maybeSingle();

  if (already) {
    const row = already as { handle: string; created_at: string; guest_id: string | null };
    // 다른 세션이 쓴 글의 id 를 들고 온 경우. uuid 라 사실상 없지만, 남의 글을 내 것으로
    // 돌려주지 않는다.
    if (row.guest_id !== null && row.guest_id !== session.id) {
      return fail(409, "이미 등록된 글입니다.", freshToken);
    }
    const response = NextResponse.json({ id, handle: row.handle, createdAt: row.created_at });
    if (freshToken) setGuestCookie(response, freshToken);
    return response;
  }

  // ── 4. 제한 ──
  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  /*
   * select("*") — parent_id 로 글과 답글을 가른다. 이름으로 고르면 migration 전 DB 에서
   * 이 조회가 실패하고, 그러면 **원글 쓰기까지** 막힌다.
   */
  const { data: recent } = await admin
    .from("field_reports")
    .select("*")
    .eq("guest_id", session.id)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(200);

  const all = (recent ?? []) as RecentRow[];
  const rows = all.filter((r) => (isReply ? Boolean(r.parent_id) : !r.parent_id));
  const limits = resolveLimits();
  const verdict = checkRate({
    action: isReply ? "replies" : "posts",
    limits,
    recentTimestamps: rows.map((r) => Date.parse(r.created_at)),
    now: Date.now(),
  });

  if (!verdict.allowed) {
    /*
     * 429 + Retry-After. 화면은 남은 시간을 보여 줄 수 있고, 자동 재시도는 그 시간을 지킨다.
     * "잠시 후"라고만 하면 사용자가 계속 누른다.
     */
    const response = NextResponse.json(
      { error: "rate_limited", retryAfterSeconds: verdict.retryAfterSeconds },
      { status: 429 },
    );
    response.headers.set("Retry-After", String(verdict.retryAfterSeconds));
    if (freshToken) setGuestCookie(response, freshToken);
    return response;
  }

  const hospitalId = typeof payload.hospitalId === "string" ? payload.hospitalId : null;

  /*
   * 같은 내용 다시 올리기. 병원을 특정하지 않은 글은 빈 문자열로 묶는다 —
   * "지역만 아는 글"끼리 비교하는 것이 맞고, 병원별 글과 섞으면 서로 다른 병원 이야기가
   * 같은 내용이라는 이유로 막힌다.
   */
  // 답글은 부모 글 기준으로 묶는다 — 다른 글에 같은 "지금 열려 있어요"를 다는 것은 막지 않는다.
  if (
    isDuplicateBody({
      text: body,
      hospitalId: isReply ? parentId : (hospitalId ?? ""),
      previous: rows.map((r) => ({
        text: r.body,
        hospitalId: (isReply ? r.parent_id : r.hospital_id) ?? "",
        createdAt: Date.parse(r.created_at),
      })),
      now: Date.now(),
      limits,
    })
  ) {
    return fail(409, "같은 내용을 방금 올렸습니다.", freshToken);
  }

  // ── 5. 저장 ──
  // 답글은 지역·병원·주제를 비운다. 그 글이 어디 이야기인지는 부모가 말한다.
  // parent_id 는 답글일 때만 싣는다 — migration 전 DB 에서도 원글은 그대로 저장된다.
  const { error } = await admin.from("field_reports").insert(
    isReply && parent
      ? {
          id,
          category: parent.category,
          topic: null,
          body,
          sido: null,
          sigungu: null,
          hospital_id: null,
          hospital_name: null,
          handle: session.nickname,
          guest_id: session.id,
          parent_id: parent.id,
        }
      : {
          id,
          category,
          topic:
            payload.topic === null || payload.topic === undefined
              ? null
              : text(payload.topic, CHAT_TOPIC_MAX),
          body,
          sido,
          sigungu,
          hospital_id: hospitalId,
          hospital_name:
            payload.hospitalName === null || payload.hospitalName === undefined
              ? null
              : text(payload.hospitalName, 60),
          handle: session.nickname,
          guest_id: session.id,
        },
  );

  // 23505 = 같은 id 가 이미 있다. 두 번 눌린 것이고, 결과는 같다.
  if (error && error.code !== "23505") {
    return fail(500, "저장하지 못했습니다.", freshToken);
  }

  await touchGuestSession(admin, session.id);

  const response = NextResponse.json({ id, handle: session.nickname, createdAt: new Date().toISOString() });
  if (freshToken) setGuestCookie(response, freshToken);
  return response;
}

function fail(status: number, message: string, freshToken: string | null) {
  const response = NextResponse.json({ error: message }, { status });
  if (freshToken) setGuestCookie(response, freshToken);
  return response;
}
