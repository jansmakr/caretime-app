import { createBrowserClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

let partnerClient: SupabaseClient | null = null;
let publicClient: SupabaseClient | null = null;

/**
 * 파트너 화면 전용 클라이언트. 병원 계정 로그인 세션을 **쿠키**에 저장한다.
 *
 * localStorage 였다가 옮겼다. 이유는 화면이 아니라 응답 본문이다 —
 * 세션이 localStorage 에 있으면 서버와 미들웨어가 그것을 읽을 수 없고, 서버 컴포넌트는
 * 일단 HTML 을 만들어 내려보낸 뒤 클라이언트가 리다이렉트한다. 그 사이 비인증자가
 * 응답 본문에서 보호 데이터를 읽는다. 화면만 가려지는 것이다.
 * 쿠키로 옮기면 미들웨어가 페이지를 그리기 전에 막을 수 있다.
 *
 * 저장소만 바뀐다. 읽기·쓰기 경로는 그대로고, 실제 권한 판정은 여전히 DB(RLS)가 한다.
 */
export function getBrowserSupabase(): SupabaseClient {
  if (!partnerClient) {
    partnerClient = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return partnerClient;
}

/**
 * 보호자 화면 전용 클라이언트. 세션을 읽지도 저장하지도 않는다.
 *
 * 같은 브라우저에서 /partner 에 로그인해도 보호자 화면의 Realtime 연결이 병원 계정 토큰으로
 * 재인증·재구독되지 않게 분리한다. (재구독 순간의 변경을 놓치는 문제가 운영에서 확인됨)
 * 보호자 화면은 언제나 anon 권한으로만 읽는다.
 *
 * **이쪽은 쿠키로 옮기지 않는다.** createBrowserClient 를 쓰면 파트너 세션 쿠키를 주워
 * 보호자 화면이 병원 계정으로 읽게 된다. 세션을 아예 안 읽는 것이 이 클라이언트의 일이다.
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
