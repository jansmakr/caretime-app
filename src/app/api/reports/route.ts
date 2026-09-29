import { NextResponse, type NextRequest } from "next/server";
import {
  GUEST_COOKIE,
  createGuestSession,
  findGuestSession,
  setGuestCookie,
  type GuestSession,
} from "@/features/chat/guestSession";
import { checkRate } from "@/features/p0/limits";
import { resolveLimits } from "@/features/p0/serverLimits";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * 신고 접수.
 *
 * 접수되면 DB 트리거가 **즉시** 글을 내린다(migration 20261001). 사람이 보기 전에 내린다 —
 * 신고는 새벽에 들어오고 운영자는 자고 있다. 복구만 사람이 정한다.
 *
 * 그래서 신고 자체를 서버만 받는다. anon 에게 열면 신고가 도배 수단이 된다 —
 * 누구나 아무 글이나 즉시 내릴 수 있게 된다. 제한도 따로 있다(시간당 5건).
 *
 * 같은 사람이 같은 글을 다시 신고하면 성공으로 돌려준다. 이미 내려간 글이고,
 * 사용자에게는 같은 결과다. (DB 의 unique index 가 막는다)
 */
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASONS = new Set([
  "PRIVACY",
  "SUSPECTED_FALSE",
  "ABUSE",
  "SPAM",
  "DANGEROUS_ADVICE",
  "OTHER",
]);

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

  let payload: { reportId?: unknown; reason?: unknown; detail?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return done(400, { error: "요청을 읽을 수 없습니다." }, freshToken);
  }

  const targetId =
    typeof payload.reportId === "string" && UUID.test(payload.reportId) ? payload.reportId : null;
  const reason =
    typeof payload.reason === "string" && REASONS.has(payload.reason) ? payload.reason : null;
  if (!targetId || !reason) return done(400, { error: "신고를 접수할 수 없습니다." }, freshToken);

  const detailRaw = typeof payload.detail === "string" ? payload.detail.trim() : "";
  const detail = detailRaw === "" ? null : detailRaw.slice(0, 200);

  // ── 제한 ──
  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  const { data: recent } = await admin
    .from("reports")
    .select("created_at")
    .eq("reporter_guest_id", session.id)
    .gte("created_at", since)
    .limit(100);

  const verdict = checkRate({
    action: "reports",
    limits: resolveLimits(),
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

  const { error } = await admin.from("reports").insert({
    target_type: "post",
    target_id: targetId,
    reporter_guest_id: session.id,
    reason,
    detail,
  });

  // 23505 = 같은 사람이 같은 글을 이미 신고했다. 결과는 같다.
  if (error && error.code !== "23505") {
    return done(500, { error: "신고를 접수하지 못했습니다." }, freshToken);
  }

  return done(200, { ok: true }, freshToken);
}

function done(status: number, body: Record<string, unknown>, freshToken: string | null) {
  const response = NextResponse.json(body, { status });
  if (freshToken) setGuestCookie(response, freshToken);
  return response;
}
