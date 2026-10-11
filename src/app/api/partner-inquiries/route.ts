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
import { areWritesOpen } from "@/lib/demoContent";

/**
 * 의료기관 사전 신청 접수.
 *
 * ── 개인정보 필터를 **걸지 않는다** ─────────────────────────
 * 다른 쓰기 경로(글·병원 요청)는 전화번호가 보이면 422 로 막는다. 여기서는 막지
 * 않는다 — **연락처가 목적**이기 때문이다. 적는 쪽은 병원 담당자이고, 자기 연락처를
 * 스스로 적는다. 그 값을 걸러 내면 이 폼이 아무 일도 못 한다.
 *
 * 대신 다른 것을 지킨다: 공개 뷰가 없고(migration 20261011), 응답에 아무것도 담지
 * 않으며, 보관 기간이 있다(1년).
 *
 * ── 동의를 서버가 다시 본다 ─────────────────────────────────
 * 화면에 체크박스가 있지만 화면은 증거가 아니다. 주소와 요청 모양을 아는 사람은
 * 화면을 거치지 않고 보낼 수 있다. 그래서 서버가 보고, DB 도 본다(check 제약).
 * 세 겹인 것이 과해 보이지만 **없는 동의를 받았다고 적는 것**이 가장 나쁘다.
 *
 * ── 제한 ────────────────────────────────────────────────────
 * 글쓰기와 같은 게스트 세션 기준이고 'reports' 규칙(시간당 5건)을 쓴다. 한 사람이
 * 한 시간에 다섯 번 넘게 신청할 일이 없다. 새 식별자를 만들지 않는다 —
 * IP 를 세려면 수집 항목이 늘고 방침을 고쳐야 한다.
 */
export const dynamic = "force-dynamic";

const HOSPITAL_MAX = 60;
const CONTACT_MAX = 120;
const MESSAGE_MAX = 500;

export async function POST(request: NextRequest) {
  // 출시 전 공개 기간에는 받지 않는다. 화면만 닫는 것은 닫은 것이 아니다.
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

  let payload: {
    hospitalName?: unknown;
    contact?: unknown;
    message?: unknown;
    consented?: unknown;
  };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return done(400, { error: "요청을 읽을 수 없습니다." }, freshToken);
  }

  const hospitalName = text(payload.hospitalName, HOSPITAL_MAX);
  if (hospitalName === null || hospitalName.length < 2) {
    return done(400, { error: "병원 이름을 적어 주세요." }, freshToken);
  }

  const contact = text(payload.contact, CONTACT_MAX);
  if (contact === null || contact.length < 3) {
    return done(400, { error: "연락처를 적어 주세요." }, freshToken);
  }

  const message = text(payload.message, MESSAGE_MAX);

  /*
   * 동의가 없으면 여기서 끝난다. 저장하지 않는다 — 받아 두고 나중에 동의를 받는
   * 길을 만들면, 동의 없이 보관한 기간이 생긴다.
   */
  if (payload.consented !== true) {
    return done(422, { error: "개인정보 수집·이용에 동의해 주셔야 접수됩니다." }, freshToken);
  }

  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  const { data: recent } = await admin
    .from("partner_inquiries")
    .select("created_at")
    .eq("guest_id", session.id)
    .gte("created_at", since)
    .limit(50);

  const verdict = checkRate({
    action: "reports",
    limits: resolveLimits(),
    recentTimestamps: ((recent ?? []) as { created_at: string }[]).map((r) =>
      Date.parse(r.created_at),
    ),
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

  const { error } = await admin.from("partner_inquiries").insert({
    hospital_name: hospitalName,
    contact,
    message,
    consented: true,
    guest_id: session.id,
  });

  // 23505 = 같은 사람이 같은 병원으로 이미 넣었다. 두 번 눌렀을 뿐이다 — 같은 답을 준다.
  if (error && error.code !== "23505") {
    return done(500, { error: "접수하지 못했습니다. 잠시 후 다시 시도해 주세요." }, freshToken);
  }

  /*
   * 응답에 아무것도 담지 않는다. 적은 값을 되돌려 주면 그 값이 로그·히스토리에
   * 한 번 더 남는다. 접수됐다는 것만 알린다.
   */
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
