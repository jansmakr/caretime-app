import { NextResponse, type NextRequest } from "next/server";
import {
  GUEST_COOKIE,
  createGuestSession,
  findGuestSession,
  setGuestCookie,
  type GuestSession,
} from "@/features/chat/guestSession";
import { checkRate } from "@/features/p0/limits";
import { createMemoryRateBucket, takeMemorySlot } from "@/features/p0/memoryRate";
import { resolveLimits } from "@/features/p0/serverLimits";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { areWritesOpen } from "@/lib/demoContent";

/**
 * 반응 누르기. 글과 같은 이유로 서버만 쓴다.
 *
 * 반응은 글보다 훨씬 자주 눌리므로 제한이 따로다(features/p0/limits 의 reactions).
 * 같은 세션이 같은 글에 같은 반응을 두 번 누르면 기본키가 막고, 그것을 오류로 올리지
 * 않는다 — 이미 눌린 것이고 사용자에게는 같은 결과다.
 *
 * 취소는 없다. 화면도 취소를 보여 주지 않는다(다시 누르면 "이미 알려 주셨어요").
 * 전에는 화면에서만 내려가는 취소가 있었는데, 서버 숫자는 그대로라 화면 숫자가 거짓이 됐다.
 *
 * 내 글에는 누를 수 없다. 화면이 칩을 읽기 전용으로 그리지만 그것만으로는 닫은 것이
 * 아니다 — 요청 모양을 아는 사람은 그대로 보낼 수 있다. 글의 guest_id 와 대조한다.
 *
 * 응답의 already 는 "이미 누른 것"이다. 화면은 그때 숫자를 올리지 않는다 —
 * 그 반응은 이미 서버 숫자에 들어 있다.
 */
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEYS = new Set(["low_wait", "doctor_present", "closed"]);

export async function POST(request: NextRequest) {
  /*
   * 출시 전 공개 기간에는 받지 않는다. 화면만 닫는 것은 닫은 것이 아니다 —
   * 주소와 요청 모양을 아는 사람은 그대로 쓸 수 있다. (lib/demoContent.areWritesOpen)
   */
  if (!areWritesOpen()) {
    return NextResponse.json({ error: "아직 준비 중입니다." }, { status: 503 });
  }
  const admin = createAdminSupabase();

  const token = request.cookies.get(GUEST_COOKIE)?.value;
  let session: GuestSession | null = await findGuestSession(admin, token);
  let freshToken: string | null = null;
  if (!session) {
    const created = await createGuestSession(admin);
    session = created.session;
    freshToken = created.token;
  }

  let payload: { reportId?: unknown; key?: unknown };
  try {
    payload = (await request.json()) as { reportId?: unknown; key?: unknown };
  } catch {
    return done(400, { error: "요청을 읽을 수 없습니다." }, freshToken);
  }

  const reportId =
    typeof payload.reportId === "string" && UUID.test(payload.reportId) ? payload.reportId : null;
  const key = typeof payload.key === "string" && KEYS.has(payload.key) ? payload.key : null;
  if (!reportId || !key) return done(400, { error: "반응을 저장할 수 없습니다." }, freshToken);

  /*
   * 누구의 글인가, 답글인가. select("*") 로 읽는다 — parent_id 컬럼이 없는 DB
   * (migration 20261022 전)에서도 이 조회가 깨지지 않게.
   *
   * 답글에는 반응이 없다. 반응 표의 외래키는 field_reports 를 가리켜서 답글 id 도
   * 받아 버린다 — 화면에 없는 숫자가 쌓인다.
   */
  const { data: report, error: ownerError } = await admin
    .from("field_reports")
    .select("*")
    .eq("id", reportId)
    .maybeSingle();
  if (ownerError) return done(500, { error: "저장하지 못했습니다." }, freshToken);
  const target = report as { guest_id: string | null; parent_id?: string | null } | null;
  if (target?.parent_id) return done(400, { error: "반응을 저장할 수 없습니다." }, freshToken);
  // 방금 만든 세션에는 글이 없다.
  if (!freshToken && target?.guest_id === session.id) {
    return done(403, { error: "own_post" }, freshToken);
  }

  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  const { data: recent } = await admin
    .from("field_report_reactions")
    .select("created_at")
    .eq("guest_id", session.id)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(400);

  const limits = resolveLimits();
  const verdict = checkRate({
    action: "reactions",
    limits,
    recentTimestamps: ((recent ?? []) as { created_at: string }[]).map((r) => Date.parse(r.created_at)),
    now: Date.now(),
  });

  if (!verdict.allowed) {
    const response = NextResponse.json(
      { error: "rate_limited", retryAfterSeconds: verdict.retryAfterSeconds },
      { status: 429 },
    );
    response.headers.set("Retry-After", String(verdict.retryAfterSeconds));
    if (freshToken) setGuestCookie(response, freshToken);
    return response;
  }

  const { error } = await admin
    .from("field_report_reactions")
    .insert({ report_id: reportId, key, guest_id: session.id });

  // 23505 = 이미 누름. 23503 = 없는 글(지워졌거나 격리됨). 둘 다 사용자에게 알릴 일이 아니다.
  if (error && error.code !== "23505" && error.code !== "23503") {
    return done(500, { error: "저장하지 못했습니다." }, freshToken);
  }

  return done(200, { ok: true, already: error?.code === "23505" }, freshToken);
}

/** 이 서버 인스턴스의 읽기 제한 기록. (features/p0/memoryRate 의 한계 주석) */
const readBucket = createMemoryRateBucket();

/** 한 번에 돌려주는 내 반응 수. 화면이 읽는 글(최근 100건 안팎)보다 넉넉하게. */
const MY_REACTION_PAGE = 500;

/**
 * 이 브라우저가 누른 반응. **본인 것만** 돌려준다.
 *
 * 왜 필요한가: 누른 표시가 브라우저 메모리에만 있으면 새로고침에 사라진다. 그러면
 * 같은 칩을 또 누르고, 화면 숫자는 오르는데 서버는 중복이라 받지 않는다 —
 * 새로고침 전까지 **실제보다 1 많은 숫자**가 보인다.
 *
 * 돌려주는 것: 글 id → 반응 키. 글 id 는 이미 공개 목록에 있는 값이고, 묶어 주는 사실
 * ("이 브라우저가 눌렀다")은 이 브라우저 본인에게만 간다. 남이 누른 것·세션 id 는 없다.
 *
 * 세션이 없으면 빈 값이다. 여기서 세션을 만들지 않는다 — 읽기만 하러 온 사람에게
 * 쿠키를 심지 않는다(/api/guest 와 같은 이유).
 */
export async function GET(request: NextRequest) {
  const admin = createAdminSupabase();
  const session = await findGuestSession(admin, request.cookies.get(GUEST_COOKIE)?.value);
  if (!session) return NextResponse.json({ mine: {} });

  const verdict = takeMemorySlot({
    bucket: readBucket,
    key: session.id,
    action: "reactionReads",
    limits: resolveLimits(),
    now: Date.now(),
  });
  if (!verdict.allowed) {
    const response = NextResponse.json(
      { error: "rate_limited", retryAfterSeconds: verdict.retryAfterSeconds },
      { status: 429 },
    );
    response.headers.set("Retry-After", String(verdict.retryAfterSeconds));
    return response;
  }

  const { data, error } = await admin
    .from("field_report_reactions")
    .select("report_id,key")
    .eq("guest_id", session.id)
    .order("created_at", { ascending: false })
    .limit(MY_REACTION_PAGE);
  if (error) return NextResponse.json({ error: "읽지 못했습니다." }, { status: 500 });

  const mine: Record<string, string[]> = {};
  for (const row of (data ?? []) as { report_id: string; key: string }[]) {
    (mine[row.report_id] ??= []).push(row.key);
  }
  return NextResponse.json({ mine });
}

function done(status: number, body: Record<string, unknown>, freshToken: string | null) {
  const response = NextResponse.json(body, { status });
  if (freshToken) setGuestCookie(response, freshToken);
  return response;
}
