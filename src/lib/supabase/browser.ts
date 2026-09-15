import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

let partnerClient: SupabaseClient | null = null;
let publicClient: SupabaseClient | null = null;

/**
 * 파트너 화면 전용 클라이언트. 병원 계정 로그인 세션을 저장한다.
 */
export function getBrowserSupabase(): SupabaseClient {
  if (!partnerClient) {
    partnerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "caretime.partner.auth" },
    });
  }
  return partnerClient;
}

/**
 * 보호자 화면 전용 클라이언트. 세션을 읽지도 저장하지도 않는다.
 *
 * 같은 브라우저에서 /partner 에 로그인해도 보호자 화면의 Realtime 연결이 병원 계정 토큰으로
 * 재인증·재구독되지 않게 분리한다. (재구독 순간의 변경을 놓치는 문제가 운영에서 확인됨)
 * 보호자 화면은 언제나 anon 권한으로만 읽는다.
 */
export function getPublicBrowserSupabase(): SupabaseClient {
  if (!publicClient) {
    publicClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: "caretime.public.no-session",
      },
    });
  }
  return publicClient;
}
