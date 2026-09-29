import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  GUEST_COOKIE,
  createGuestSession,
  findGuestSession,
  setGuestCookie,
} from "@/features/chat/guestSession";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * 이 브라우저의 게스트 세션. 없으면 만든다.
 *
 * 화면은 닉네임만 받는다. **세션 id 는 돌려주지 않는다** — 응답에 실리면 스크립트가
 * 읽을 수 있고, 그 순간 공유 문구·URL·분석 로그로 새어 나갈 길이 생긴다.
 * 세션은 httpOnly 쿠키로만 오간다.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = createAdminSupabase();
  const store = await cookies();
  const existing = await findGuestSession(admin, store.get(GUEST_COOKIE)?.value);

  if (existing) return NextResponse.json({ nickname: existing.nickname });

  const { session, token } = await createGuestSession(admin);
  const response = NextResponse.json({ nickname: session.nickname });
  setGuestCookie(response, token);
  return response;
}
