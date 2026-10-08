import { NextResponse, type NextRequest } from "next/server";
import {
  GUEST_COOKIE,
  createGuestSession,
  findGuestSession,
  setGuestCookie,
  type GuestSession,
} from "@/features/chat/guestSession";
import { checkRate } from "@/features/p0/limits";
import { findPii } from "@/features/p0/pii";
import { resolveLimits } from "@/features/p0/serverLimits";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { areWritesOpen } from "@/lib/demoContent";

/**
 * 목록에 없는 병원 요청.
 *
 * 글이 아니다. 공개되지 않고 운영자만 본다(migration 20261002).
 * 그래서 응답에 아무 내용도 담지 않는다 — 접수됐다는 것만 알린다.
 *
 * 제한은 글쓰기와 같은 게스트 세션 기준이다. 'reports' 규칙을 쓴다(시간당 5건) —
 * 요청은 글보다 드물고, 한 사람이 한 밤에 다섯 곳 넘게 찾을 일은 없다.
 */
export const dynamic = "force-dynamic";

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

  let payload: { name?: unknown; sido?: unknown; sigungu?: unknown; areaHint?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return done(400, { error: "요청을 읽을 수 없습니다." }, freshToken);
  }

  const name = text(payload.name, 60);
  if (name === null || name.length < 2) {
    return done(400, { error: "병원 이름을 적어 주세요." }, freshToken);
  }

  const sido = text(payload.sido, 20);
  const sigungu = text(payload.sigungu, 30);
  if (sigungu !== null && sido === null) {
    return done(400, { error: "지역이 올바르지 않습니다." }, freshToken);
  }
  const areaHint = text(payload.areaHint, 60);

  /*
   * 여기에도 개인정보 필터를 건다. 운영자만 보는 값이어도 담지 않는다 —
   * 보호자가 "제 번호 010-… 로 알려주세요"라고 적을 수 있고, 그걸 저장하면
   * 우리가 받지 않기로 한 것을 받게 된다.
   */
  const pii = findPii([name, areaHint].filter(Boolean).join(" "));
  if (pii) return done(422, { error: pii.message }, freshToken);

  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  const { data: recent } = await admin
    .from("hospital_requests")
    .select("created_at")
    .eq("guest_id", session.id)
    .gte("created_at", since)
    .limit(50);

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

  const { error } = await admin.from("hospital_requests").insert({
    name,
    sido,
    sigungu,
    area_hint: areaHint,
    guest_id: session.id,
  });

  // 23505 = 같은 사람이 같은 병원을 이미 요청했다. 결과는 같다.
  if (error && error.code !== "23505") {
    return done(500, { error: "요청을 접수하지 못했습니다." }, freshToken);
  }

  return done(200, { ok: true }, freshToken);
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.length > max) return null;
  return trimmed;
}

function done(status: number, body: Record<string, unknown>, freshToken: string | null) {
  const response = NextResponse.json(body, { status });
  if (freshToken) setGuestCookie(response, freshToken);
  return response;
}
