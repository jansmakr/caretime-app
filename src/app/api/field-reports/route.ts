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
import { resolveLimits } from "@/features/p0/serverLimits";
import { createAdminSupabase } from "@/lib/supabase/admin";
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
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.length > max) return null;
  return trimmed;
}

export async function POST(request: NextRequest) {
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

  if (!id || !category || !body) return fail(400, "글을 저장할 수 없습니다.", freshToken);

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
  // 시군구만 있으면 어디인지 알 수 없다. DB 의 CHECK 와 같은 규칙을 여기서 먼저 본다.
  if (sigungu !== null && sido === null) return fail(400, "지역이 올바르지 않습니다.", freshToken);

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
  const { data: recent } = await admin
    .from("field_reports")
    .select("created_at,body,hospital_id")
    .eq("guest_id", session.id)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = (recent ?? []) as { created_at: string; body: string; hospital_id: string | null }[];
  const limits = resolveLimits();
  const verdict = checkRate({
    action: "posts",
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
  if (
    isDuplicateBody({
      text: body,
      hospitalId: hospitalId ?? "",
      previous: rows.map((r) => ({
        text: r.body,
        hospitalId: r.hospital_id ?? "",
        createdAt: Date.parse(r.created_at),
      })),
      now: Date.now(),
      limits,
    })
  ) {
    return fail(409, "같은 내용을 방금 올렸습니다.", freshToken);
  }

  // ── 5. 저장 ──
  const { error } = await admin.from("field_reports").insert({
    id,
    category,
    topic: payload.topic === null || payload.topic === undefined ? null : text(payload.topic, CHAT_TOPIC_MAX),
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
  });

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
