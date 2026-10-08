import { cookies } from "next/headers";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { GUEST_COOKIE, findGuestSession } from "./guestSession";

/**
 * 이 브라우저가 쓴 글의 id. **서버에서만 부른다**(쿠키와 service role 을 쓴다).
 *
 * 왜 서버에서 읽는가: 공개 뷰는 `guest_id` 를 내보내지 않는다(그래야 한다). 그래서
 * 화면은 목록만 보고는 어느 글이 내 글인지 알 수 없고, 그러면 **삭제 버튼이 없다.**
 * 브라우저가 마운트 뒤에 /api/guest 로 물어볼 수도 있지만, 그때까지 첫 그림에는
 * 버튼이 없다 — 자기 글을 지우러 온 사람이 처음 보는 화면에 그 버튼이 없으면
 * 없는 기능이다.
 *
 * 돌려주는 것은 id 뿐이고 그 id 는 이미 공개 목록에 있는 값이다. 새로 공개되는
 * 정보가 없다. 묶어 주는 사실("이 브라우저가 썼다")은 이 브라우저 본인에게만 간다.
 *
 * 세션이 없으면 빈 배열이다. 여기서 세션을 만들지 않는다 — 읽기만 하러 온 사람에게
 * 쿠키를 심지 않는다.
 */

/** 한 번에 돌려주는 내 글 수. 이보다 많이 쓴 사람의 옛 글은 목록에서 빠진다. */
export const MY_POST_PAGE = 200;

export async function readMyPostIds(): Promise<string[]> {
  try {
    const store = await cookies();
    const token = store.get(GUEST_COOKIE)?.value;
    if (!token) return [];

    const admin = createAdminSupabase();
    const session = await findGuestSession(admin, token);
    if (!session) return [];

    return await myPostIdsOf(admin, session.id);
  } catch {
    /*
     * 조회가 실패하면 삭제 버튼이 늦게 붙는다(마운트 뒤 /api/guest 가 다시 묻는다).
     * 화면 전체를 막을 이유가 아니다.
     */
    return [];
  }
}

export async function myPostIdsOf(
  admin: ReturnType<typeof createAdminSupabase>,
  guestId: string,
): Promise<string[]> {
  const { data } = await admin
    .from("field_reports")
    .select("id")
    .eq("guest_id", guestId)
    // 이미 내려간 글에는 지울 것이 없다.
    .eq("visibility", "VISIBLE")
    .order("created_at", { ascending: false })
    .limit(MY_POST_PAGE);
  return ((data ?? []) as { id: string }[]).map((row) => row.id);
}
