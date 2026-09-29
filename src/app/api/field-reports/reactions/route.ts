import { NextResponse, type NextRequest } from "next/server";
import {
  GUEST_COOKIE,
  createGuestSession,
  findGuestSession,
  setGuestCookie,
  type GuestSession,
} from "@/features/chat/guestSession";
import { checkRate } from "@/features/p0/limits";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * 반응 누르기. 글과 같은 이유로 서버만 쓴다.
 *
 * 반응은 글보다 훨씬 자주 눌리므로 제한이 따로다(features/p0/limits 의 reactions).
 * 같은 세션이 같은 글에 같은 반응을 두 번 누르면 기본키가 막고, 그것을 오류로 올리지
 * 않는다 — 이미 눌린 것이고 사용자에게는 같은 결과다.
 *
 * 취소는 아직 없다. 누른 것을 되돌리려면 지우는 경로가 필요하고, 그건 "누가 눌렀는지"를
 * 서버가 아는 지금은 가능하다 — 다만 이번 턴의 범위는 쓰기를 서버로 옮기는 것까지다.
 */
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEYS = new Set(["low_wait", "doctor_present", "closed"]);

export async function POST(request: NextRequest) {
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

  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  const { data: recent } = await admin
    .from("field_report_reactions")
    .select("created_at")
    .eq("guest_id", session.id)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(400);

  const verdict = checkRate({
    action: "reactions",
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

  return done(200, { ok: true }, freshToken);
}

function done(status: number, body: Record<string, unknown>, freshToken: string | null) {
  const response = NextResponse.json(body, { status });
  if (freshToken) setGuestCookie(response, freshToken);
  return response;
}
