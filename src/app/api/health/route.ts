import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * 살아 있는가. **읽기만 한다.**
 *
 * 무엇을 보는가: 앱이 DB 에 실제로 닿는지. 화면이 200 을 주는 것으로는 알 수 없다 —
 * Supabase 값이 비면 앱은 Mock 으로 **조용히** 돌고, 그때 현장톡은 "빈 방"처럼
 * 보인다. 고장과 빈 방을 눈으로 구분할 수 없는 것이 이 서비스의 실제 위험이라
 * (크론이 멈춰도 화면이 그대로인 것과 같은 종류다) 기계가 묻는 자리를 하나 둔다.
 *
 * ── 지키는 것 ───────────────────────────────────────────────
 *   · **쓰기를 하지 않는다.** 공개 뷰에서 한 줄 읽는 것이 전부다.
 *   · **anon 키로 읽는다.** service_role 을 쓰면 RLS 를 지나치므로, 보호자가
 *     실제로 읽는 길이 열려 있는지를 확인하지 못한다.
 *   · 응답에 **키도 오류 상세도 담지 않는다.** 이 주소는 누구나 부를 수 있다.
 *     원인은 Vercel 로그에서 본다 — 밖으로 나가는 것은 ok 한 글자다.
 *   · 캐시하지 않는다. 캐시된 200 은 "지금 살아 있다"가 아니다.
 *   · **5초 안에 답한다.** 처음 만들 때 이게 없었고, 로컬에서 Supabase 를 멈춰
 *     놓고 불러 보니 **503 이 아니라 그냥 매달렸다**(curl 이 타임아웃). 멈춘 서버는
 *     TCP 는 받고 답을 안 준다. 매달리는 헬스체크는 없는 것보다 나쁘다 —
 *     감시하는 쪽도 같이 타임아웃하고, 그러면 "고장"이 아니라 "모름"이 된다.
 *
 * ── 쓰는 법 ─────────────────────────────────────────────────
 *   curl -s -o /dev/null -w '%{http_code}' <배포주소>/api/health   → 200
 *
 * 색인은 미들웨어가 막는다(`X-Robots-Tag: noindex, nofollow`). matcher 가 /api 를
 * 포함하므로 여기서 따로 붙이지 않는다 — 두 곳에서 붙이면 한쪽만 고치게 된다.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** 이 안에 답이 없으면 고장으로 본다. 감시 도구의 기본 타임아웃보다 짧게 둔다. */
const TIMEOUT_MS = 5_000;

function answer(ok: boolean) {
  return NextResponse.json(
    { ok },
    {
      status: ok ? 200 : 503,
      headers: { "Cache-Control": "no-store, max-age=0" },
    },
  );
}

export async function GET() {
  /*
   * 환경변수가 없으면 앱은 Mock 으로 돈다. 그 상태를 200 으로 답하면 이 라우트가
   * 잡으려던 사고(값을 빠뜨린 채 배포)를 그대로 통과시킨다.
   */
  if (!isSupabaseConfigured) return answer(false);

  try {
    const supabase = createServerSupabase();
    /*
     * 공개 뷰에서 한 줄. 0건이어도 성공이다 — 빈 방은 고장이 아니다.
     * 보는 것은 "질의가 돌아왔는가" 하나다.
     */
    const { error } = await supabase
      .from("field_reports_public")
      .select("id")
      .limit(1)
      // 답이 없는 것도 고장이다. 기다리지 않고 503 으로 끊는다.
      .abortSignal(AbortSignal.timeout(TIMEOUT_MS));
    return answer(error === null);
  } catch {
    // 네트워크·DNS·타임아웃. 무엇이든 밖으로는 같은 답이다.
    return answer(false);
  }
}
