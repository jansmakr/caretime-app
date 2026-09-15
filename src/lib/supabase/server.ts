import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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
