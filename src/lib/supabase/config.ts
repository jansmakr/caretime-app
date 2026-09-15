/**
 * Supabase 연결 설정.
 *
 * 값이 비어 있으면 앱은 Mock 데이터로 동작한다. (README 「Mock 정책」)
 * NEXT_PUBLIC_* 는 빌드 시점에 인라인되므로 process.env.X 를 직접 참조해야 한다.
 * service role 키는 브라우저 번들에 들어가면 안 되므로 이 파일에서 읽지 않는다.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = SUPABASE_URL !== "" && SUPABASE_ANON_KEY !== "";
