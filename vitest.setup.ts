/**
 * 테스트 전역 가드.
 *
 * 목적 하나: **실수로 운영 Supabase 에 테스트를 쏘는 경로를 구조로 막는다.**
 *
 * 턴 2 이후의 테스트는 권한 거부와 동시수정 충돌을 반복 호출한다. 그걸 연결된 프로젝트에
 * 쏘면 실패 로그가 쌓이고 되돌릴 수 없는 상태가 남는다. 그래서 문서로 "로컬에서 돌려라"라고
 * 적어 두는 대신, URL 이 로컬이 아니면 테스트가 **시작되지 않게** 한다.
 *
 * 판정 대상은 두 이름이다. .env.local 을 읽어 들이는 코드가 나중에 붙어도 막히게 하려는 것이다.
 *   SUPABASE_URL             (서버·테스트용)
 *   NEXT_PUBLIC_SUPABASE_URL (앱 번들용)
 *
 * DB 를 타지 않는 순수 로직 테스트는 두 값이 아예 없어도 통과한다.
 * DB 가 필요한 테스트는 requireLocalSupabase() 를 직접 불러 "설정되어 있고 로컬인지"까지 본다.
 */

const LOCAL_HOST = /^(127\.0\.0\.1|localhost|\[::1\])$/;
const CHECKED_KEYS = ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"] as const;

function hostOf(value: string): string | null {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

for (const key of CHECKED_KEYS) {
  const raw = process.env[key];
  if (!raw || raw.trim() === "") continue;

  const host = hostOf(raw.trim());
  if (host === null) {
    throw new Error(
      `[테스트 가드] ${key} 를 URL 로 읽을 수 없습니다. 로컬 Supabase 주소만 허용합니다.`,
    );
  }
  if (!LOCAL_HOST.test(host)) {
    // 값 전체(프로젝트 ref 포함)를 찍지 않고 호스트만 알린다.
    throw new Error(
      `[테스트 가드] ${key} 가 로컬이 아닙니다 (host=${host}). ` +
        "테스트는 supabase start 로 띄운 127.0.0.1 인스턴스만 대상으로 합니다. " +
        "연결된 프로젝트에 권한 거부·동시수정 테스트를 쏘면 되돌릴 수 없는 상태가 남습니다.",
    );
  }
}

/**
 * DB 를 타는 테스트가 맨 앞에서 부른다.
 * 가드(위)는 "원격이면 실패"를, 이 함수는 "로컬이 실제로 설정되어 있는지"를 본다.
 */
export function requireLocalSupabase(): { url: string } {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (url.trim() === "") {
    throw new Error(
      "[테스트 가드] 로컬 Supabase 주소가 없습니다. supabase start 후 SUPABASE_URL 을 넣어 주세요.",
    );
  }
  const host = hostOf(url.trim());
  if (host === null || !LOCAL_HOST.test(host)) {
    throw new Error(`[테스트 가드] 로컬이 아닌 주소입니다 (host=${host ?? "?"}).`);
  }
  return { url: url.trim() };
}
