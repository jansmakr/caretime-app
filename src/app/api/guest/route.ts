import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  GUEST_COOKIE,
  createGuestSession,
  findGuestSession,
  setGuestCookie,
} from "@/features/chat/guestSession";
import { myPostIdsOf } from "@/features/chat/myPosts";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { areWritesOpen } from "@/lib/demoContent";

/**
 * 이 브라우저의 게스트 세션. 없으면 만든다.
 *
 * 화면은 닉네임과 **내가 쓴 글의 id 목록**을 받는다. 세션 id 는 돌려주지 않는다 —
 * 응답에 실리면 스크립트가 읽을 수 있고, 그 순간 공유 문구·URL·분석 로그로 새어
 * 나갈 길이 생긴다. 세션은 httpOnly 쿠키로만 오간다.
 *
 * 왜 글 id 목록인가: 공개 뷰는 guest_id 를 내보내지 않으므로(그래야 한다) 화면은
 * 새로고침 뒤에 **어느 글이 내 글인지 알 수 없다.** 그러면 삭제 버튼이 사라진다.
 * 돌려주는 것은 id 뿐이고, 그 id 는 이미 공개 목록에 있는 값이다 — 새로 공개되는
 * 정보가 없다. 묶어 주는 것은 "이 브라우저가 쓴 것"이라는 사실 하나이고, 그것은
 * 이 브라우저 본인에게만 간다.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = createAdminSupabase();
  const store = await cookies();
  const existing = await findGuestSession(admin, store.get(GUEST_COOKIE)?.value);

  if (existing) {
    return NextResponse.json({
      nickname: existing.nickname,
      myPostIds: await myPostIdsOf(admin, existing.id),
    });
  }

  /*
   * 쓰기가 닫혀 있으면 **세션을 만들지 않는다.**
   *
   * 이 경로는 화면이 마운트될 때 불린다. 그래서 그냥 두면 출시 전 공개 기간에
   * 들어온 사람마다 세션 행이 생기고, 그 세션들은 방침 시행 전이라 동의 기록
   * (policy_version)이 없는 채로 남는다. 지울 수는 있지만 만들지 않는 쪽이 맞다.
   *
   * 이름이 없으면 화면은 이름 없이 그린다 — 글을 쓸 수 없는 동안 이름이 필요 없다.
   */
  if (!areWritesOpen()) {
    return NextResponse.json({ nickname: null, myPostIds: [] });
  }

  // 방금 만든 세션에는 글이 없다. 조회하지 않는다.
  const { session, token } = await createGuestSession(admin);
  const response = NextResponse.json({ nickname: session.nickname, myPostIds: [] });
  setGuestCookie(response, token);
  return response;
}
