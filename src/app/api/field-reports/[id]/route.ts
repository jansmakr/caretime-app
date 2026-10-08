import { NextResponse, type NextRequest } from "next/server";
import {
  GUEST_COOKIE,
  findGuestSession,
  type GuestSession,
} from "@/features/chat/guestSession";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * 내가 쓴 글 지우기.
 *
 * 익명 게시판에서 자기 글을 못 지우면, 잘못 쓴 사람에게 남는 방법이 자기 글을
 * 신고하는 것뿐이다. 그건 운영자에게 가는 길이고 본인이 쓸 길이 아니다.
 *
 * ── 누가 지울 수 있는가 ─────────────────────────────────────
 * 쿠키의 게스트 세션이 **그 글의 작성자일 때만** 지워진다. 판정은 DB 가 한다 —
 * `where id = ? and guest_id = ?` 한 문장이라 "확인한 뒤에 지운다" 사이의 틈이 없다.
 * 남의 글이거나 없는 글이면 똑같이 404 다. 있다/없다를 알려 주지 않는다 —
 * 글 id 를 넣어 보며 누가 썼는지 떠보는 길을 만들지 않는다.
 *
 * ── 왜 행을 지우지 않고 REMOVED 로 두는가 ───────────────────
 *   · 이미 읽고 있는 사람 화면에서도 사라져야 한다. 그 경로가 broadcast 트리거이고,
 *     트리거는 insert·update 에만 걸려 있다. 행을 지우면 아무 신호도 가지 않는다.
 *   · 공개 뷰가 REMOVED 를 거른다. 즉 누르는 순간 모든 화면에서 사라진다.
 *
 * ⚠️ **행은 지워지지 않는다. 2026-10-07(migration 20261007)부터 그렇다.**
 * 글의 자동 삭제를 끄면서 retention_policy 에서 field_reports 행을 뺐다. 그래서
 * purge_expired() 는 이제 현장톡 글을 건드리지 않는다 — REMOVED 로 둔 행도 남는다.
 *
 * 방침에 쓸 말은 "누르면 즉시 공개가 중단된다" 까지다. **"완전히 삭제된다"고 쓰면
 * 거짓이 된다.** 본문을 DB 에서 없애는 길은 지금 운영자 콘솔의 delete 하나뿐이고,
 * 그 절차는 docs/OPS-moderation.md 에 있다.
 *
 * 제한을 걸지 않았다. 지울 수 있는 것은 자기 글뿐이라 연타로 남에게 가는 피해가 없고,
 * 글쓰기 제한이 이미 그 사람이 만들 수 있는 글 수를 묶고 있다.
 */
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "없는 글입니다." }, { status: 404 });

  const admin = createAdminSupabase();

  /*
   * 세션이 없으면 작성자일 수 없다. 여기서는 세션을 만들지 않는다 —
   * 글을 쓰지도 않은 브라우저에 세션을 발급할 이유가 없다.
   */
  const token = request.cookies.get(GUEST_COOKIE)?.value;
  const session: GuestSession | null = await findGuestSession(admin, token);
  if (!session) return NextResponse.json({ error: "없는 글입니다." }, { status: 404 });

  const { data, error } = await admin
    .from("field_reports")
    .update({ visibility: "REMOVED" })
    .eq("id", id)
    .eq("guest_id", session.id)
    .select("id");

  if (error) {
    return NextResponse.json({ error: "지우지 못했습니다." }, { status: 500 });
  }

  /*
   * 0행이면 남의 글이거나 없는 글이다 — 둘을 구분해서 답하지 않는다.
   * 이미 지운 글을 다시 지우면 여기서도 0행이지만, 그 경우도 사용자에게는 같은
   * 결과("지워졌다")다. 그래서 404 를 돌려주더라도 화면은 목록에서 빼 둔다.
   */
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "없는 글입니다." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
