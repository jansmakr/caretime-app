import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

let client: SupabaseClient | null = null;

/**
 * 브라우저 전용 클라이언트. 탭 안에서 하나만 만든다.
 * 파트너 로그인 세션은 여기에만 저장된다. 보호자 화면은 로그인하지 않고 같은 클라이언트로 읽기·구독만 한다.
 */
export function getBrowserSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "caretime.partner.auth" },
    });
  }
  return client;
}
