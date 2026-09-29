import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * 보호 화면을 **페이지를 그리기 전에** 막는다.
 *
 * 왜 클라이언트 가드로는 부족한가: 서버 컴포넌트는 HTML 을 만들어 내려보낸 뒤에야
 * 클라이언트가 리다이렉트한다. 그 응답 본문에 신청자 담당자명·연락처 같은 값이 들어
 * 있으면 비인증자가 그것을 읽는다. 화면만 가려지는 것이다. 미들웨어는 본문이 만들어지기
 * 전에 끊으므로 읽을 것이 남지 않는다.
 *
 * 여기서 하는 것은 **인증**뿐이다. "로그인했는가"만 본다.
 * 어느 병원 소속인지, 운영자인지 같은 **권한**은 DB(RLS)가 판정한다. 미들웨어에서
 * 권한까지 흉내 내면 판정이 두 곳에 생기고, 두 곳은 언젠가 갈라진다.
 */

const LOGIN_PATH = "/partner/login";

/**
 * 로그인 없이 열리는 /partner 경로.
 *
 * /partner 자체는 공개다 — 무료 입점 안내가 거기 있고, 아직 계정이 없는 병원이 보는
 * 화면이다. PRD §1 의 경로표도 공개로 두고 있다.
 */
const PUBLIC_PARTNER_PATHS = new Set(["/partner", LOGIN_PATH]);

/** 로그인이 필요한가. 판정을 한 곳에 두고 테스트가 이 함수를 직접 본다. */
export function requiresSession(pathname: string): boolean {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return true;
  if (!pathname.startsWith("/partner")) return false;
  return !PUBLIC_PARTNER_PATHS.has(pathname);
}

export async function middleware(request: NextRequest) {
  /*
   * 쿠키를 붙일 응답을 먼저 만든다. getUser() 가 만료된 토큰을 갱신하면 그 새 쿠키를
   * 여기 실어 보내야 하고, 그러지 않으면 다음 요청에서 또 만료된 토큰이 온다.
   */
  let response = NextResponse.next({ request });

  // Supabase 설정이 없으면 앱은 Mock 으로 돈다. 그때는 막을 세션도 없다.
  if (!isSupabaseConfigured) return response;

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => {
        for (const { name, value } of cookies) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookies) response.cookies.set(name, value, options);
      },
    },
  });

  /*
   * getUser() 를 쓴다. getSession() 은 쿠키에 담긴 값을 그대로 믿기 때문에
   * 서버 판정의 근거로 쓸 수 없다 — 쿠키는 클라이언트가 만든 것이다.
   * getUser() 는 Auth 서버에 토큰을 확인시킨다. 만료됐으면 여기서 갱신도 된다.
   */
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user || !requiresSession(request.nextUrl.pathname)) return response;

  /*
   * 세션이 없거나 만료됐다. 페이지를 만들지 않고 돌려보낸다.
   * 돌아올 곳을 next 로 실어 준다 — 로그인하고 나서 보던 화면으로 되돌아가야 한다.
   */
  const login = new URL(LOGIN_PATH, request.url);
  login.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  /*
   * 정적 파일과 이미지 최적화 경로는 지나간다. 매 요청마다 Auth 서버에 묻지 않기 위해서다.
   * 보호 대상이 /partner 와 /admin 뿐이지만 matcher 를 그 둘로 좁히지 않는다 —
   * 세션 갱신이 그 경로에서만 일어나면 다른 화면에 머무는 동안 토큰이 만료된다.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
