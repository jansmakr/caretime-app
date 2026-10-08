import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

/**
 * 서버 컴포넌트용 읽기 클라이언트. 요청마다 새로 만들고 세션을 저장하지 않는다.
 * anon 키로만 읽으므로 RLS 공개 읽기 정책 밖의 데이터는 서버 렌더에도 나오지 않는다.
 */
export function createServerSupabase(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * 로그인한 사용자로 읽는 서버 클라이언트.
 *
 * 보호자 읽기에는 쓰지 않는다 — 그쪽은 위의 createServerSupabase(anon) 다.
 * 이것은 /admin 처럼 "누가 요청했는지"가 있어야 답이 달라지는 화면용이다.
 * 여기서도 권한 판정은 하지 않는다. RLS 가 한다.
 *
 * 서버 컴포넌트에서는 쿠키를 쓸 수 없다. 토큰 갱신은 미들웨어가 하고, 여기서는
 * 쓰기 시도를 조용히 넘긴다(그게 @supabase/ssr 이 권하는 방식이다).
 */
export async function createServerSupabaseWithSession(): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // 서버 컴포넌트에서 호출된 경우. 갱신은 미들웨어가 이미 했다.
        }
      },
    },
  });
}
