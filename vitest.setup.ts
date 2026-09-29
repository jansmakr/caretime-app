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

import { readFileSync } from "node:fs";

const LOCAL_HOST = /^(127\.0\.0\.1|localhost|\[::1\])$/;
const CHECKED_KEYS = ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"] as const;

/**
 * .env.local 을 process.env 로 올린다. vitest 는 next 와 달리 이 파일을 자동으로 읽지 않는다.
 *
 * 이미 들어 있는 값은 덮지 않는다 — CI 나 셸에서 명시적으로 준 값이 우선이다.
 * 올린 직후에 아래 가드가 돈다. 즉 "읽어 들이는 코드가 붙으면 그 값도 검사받는다".
 */
function loadEnvLocal(): void {
  let raw: string;
  try {
    raw = readFileSync(new URL("./.env.local", import.meta.url), "utf8");
  } catch {
    return; // 없으면 그냥 넘어간다. DB 를 안 타는 테스트는 값이 없어도 돈다.
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i <= 0) continue;
    const key = trimmed.slice(0, i).trim();
    if (process.env[key] !== undefined) continue;
    process.env[key] = trimmed.slice(i + 1).trim();
  }
}

loadEnvLocal();

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

/**
 * DB 를 타는 테스트가 쓰는 주소·키 묶음.
 *
 * requireLocalSupabase() 의 판정을 먼저 통과해야 키를 돌려준다 — 순서가 중요하다.
 * 키 값은 어떤 경우에도 오류 문구에 담지 않는다.
 */
export function requireLocalKeys(): { url: string; anonKey: string; serviceKey: string } {
  const { url } = requireLocalSupabase();
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

  if (anonKey === "" || serviceKey === "") {
    throw new Error(
      "[테스트 가드] 로컬 anon / service_role 키가 .env.local 에 없습니다. " +
        "supabase start 출력의 키를 넣어 주세요. (운영 프로젝트 키를 넣지 마세요)",
    );
  }
  return { url, anonKey, serviceKey };
}
