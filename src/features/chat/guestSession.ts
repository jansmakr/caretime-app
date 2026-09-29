import { createHash, randomBytes } from "node:crypto";
import type { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildNickname } from "@/features/p0/nickname";

/**
 * 비회원 세션. **서버에서만 다룬다.**
 *
 * 왜 서버인가: 누가 몇 건 썼는지 세려면 그 사람을 가리키는 값이 있어야 하는데,
 * 클라이언트가 만든 값은 지우고 다시 만들면 그만이다. 그러면 제한이 제한이 아니다.
 *
 * 쿠키는 httpOnly 다. 화면 스크립트가 읽을 수 없고, 따라서 실수로 URL·공유 문구·
 * 분석 로그에 섞여 나갈 경로가 없다.
 *
 * 담는 것: 무작위 토큰과 닉네임뿐이다. 이름·연락처·기기 정보를 넣지 않는다.
 * DB 에는 토큰 자체가 아니라 해시를 둔다 — DB 를 읽을 수 있는 사람이 남의 세션을
 * 그대로 쓸 수 있으면 안 된다.
 */

export const GUEST_COOKIE = "caretime_guest";

/** 세션 수명. 짧으면 "아까 그 사람"이 끊기고, 길면 한 값이 오래 남는다. */
export const GUEST_SESSION_DAYS = 30;

export interface GuestSession {
  id: string;
  nickname: string;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** 쿠키의 토큰으로 살아 있는 세션을 찾는다. 없거나 만료·해지됐으면 null. */
export async function findGuestSession(
  admin: SupabaseClient,
  token: string | undefined,
): Promise<GuestSession | null> {
  if (!token) return null;

  const { data, error } = await admin
    .from("guest_sessions")
    .select("id,nickname,expires_at,revoked_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  if (error || !data) return null;
  const row = data as { id: string; nickname: string; expires_at: string; revoked_at: string | null };
  if (row.revoked_at !== null) return null;
  if (Date.parse(row.expires_at) <= Date.now()) return null;

  return { id: row.id, nickname: row.nickname };
}

/**
 * 새 세션. 닉네임은 **서버가 정한다.**
 *
 * 전에는 브라우저가 만들어 localStorage 에 뒀다. 그러면 누구나 바꿀 수 있고, 같은
 * 이름을 여러 사람이 쓸 수도 있어 "아까 그 사람"이 성립하지 않는다.
 * 금지어 검사도 서버에서 한 번만 하면 된다(features/p0/nickname).
 */
export async function createGuestSession(
  admin: SupabaseClient,
): Promise<{ session: GuestSession; token: string }> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + GUEST_SESSION_DAYS * 24 * 60 * 60_000).toISOString();

  const { data, error } = await admin
    .from("guest_sessions")
    .insert({ token_hash: hashToken(token), nickname: buildNickname(), expires_at: expiresAt })
    .select("id,nickname")
    .single();

  if (error) throw new Error(`게스트 세션 생성 실패: ${error.message}`);
  const row = data as { id: string; nickname: string };
  return { session: { id: row.id, nickname: row.nickname }, token };
}

/** 마지막 사용 시각. 정리 작업이 오래 안 쓴 세션을 가려낼 때 쓴다. */
export async function touchGuestSession(admin: SupabaseClient, id: string): Promise<void> {
  await admin.from("guest_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", id);
}

/**
 * 세션 쿠키를 응답에 싣는다.
 *
 * httpOnly — 화면 스크립트가 읽을 수 없다. 그래서 실수로 URL·공유 문구·분석 로그에
 * 섞여 나갈 경로가 없다.
 * sameSite=lax — 다른 사이트에서 온 POST 에는 쿠키가 실리지 않는다.
 * secure — 운영에서만. 로컬은 http 라 켜면 쿠키가 아예 저장되지 않는다.
 *
 * 라우트 파일에 두지 않는다. Next 는 route.ts 에서 정해진 것 말고 다른 export 를
 * 허용하지 않는다(빌드가 막는다).
 */
export function setGuestCookie(response: NextResponse, token: string): void {
  response.cookies.set(GUEST_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GUEST_SESSION_DAYS * 24 * 60 * 60,
  });
}
