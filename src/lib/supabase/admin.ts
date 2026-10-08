import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./config";

/**
 * service_role 클라이언트. **서버에서만 만든다.**
 *
 * 이 키는 RLS 를 우회한다. 브라우저 번들에 들어가면 그 순간 모든 정책이 무의미해지므로
 * NEXT_PUBLIC_ 접두사가 없는 이름으로만 읽는다 — 접두사가 없으면 Next 가 번들에 넣지 않는다.
 *
 * 쓰는 곳은 하나뿐이다: 게스트 글·반응을 저장하는 서버 라우트. 그 라우트가 세션과
 * 제한을 먼저 판정하고, 통과한 것만 이 클라이언트로 쓴다.
 */
export function createAdminSupabase(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (key === "") {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY 가 없습니다. 서버 전용 값입니다.");
  }
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
