"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { HospitalChooser } from "@/components/partner/HospitalChooser";
import { PartnerJoin } from "@/components/partner/PartnerJoin";
import { PartnerLoading } from "@/components/partner/PartnerLoading";
import { usePartner } from "@/features/partner/PartnerProvider";

/**
 * 파트너 화면 진입 조건.
 *
 * 경로별로 다르게 판정한다.
 *  - /partner/login : 게이트를 통과시킨다. 아니면 리다이렉트가 자기 자신을 향해 반복된다.
 *                     이미 들어와 있으면 대시보드로 돌려보낸다.
 *  - /partner       : 공개 화면이다. 미인증이면 무료 입점 안내(PartnerJoin)를 보여준다.
 *                     PRD §1 의 경로표가 /partner 를 '공개'로 두고 있다.
 *  - 그 밖의 /partner/* : 보호 화면이다. 미인증이면 **리다이렉트**한다(화면을 그리지 않는다).
 *
 * 리다이렉트는 클라이언트에서 한다. 현재 파트너 세션은 localStorage 에 있어
 * (lib/supabase/browser.ts storageKey) 서버·미들웨어가 읽을 수 없다.
 * 서버 가드가 필요하면 쿠키 기반 세션(@supabase/ssr)으로 옮겨야 하고, 그건 별도 작업이다.
 *
 * 실제 차단은 DB(RLS)가 한다. 이 컴포넌트는 헛입력을 막는 안내다.
 */

const LOGIN_PATH = "/partner/login";
/** 공개 화면. 미인증이라도 리다이렉트하지 않는다. */
const PUBLIC_PATHS = new Set(["/partner", LOGIN_PATH]);

export function PartnerGate({ children }: { children: React.ReactNode }) {
  const { phase, notice, dismissNotice, connection, source, signOut } = usePartner();
  const pathname = usePathname();
  const router = useRouter();

  const onLogin = pathname === LOGIN_PATH;
  const isPublic = PUBLIC_PATHS.has(pathname ?? "");

  // 보호 화면 + 미인증 → 로그인으로 보낸다. replace 라 뒤로가기로 되돌아오지 않는다.
  useEffect(() => {
    if (phase === "signed_out" && !isPublic) router.replace(LOGIN_PATH);
  }, [phase, isPublic, router]);

  // 로그인 화면에 이미 인증된 상태로 들어오면 대시보드로 돌려보낸다.
  useEffect(() => {
    if (onLogin && (phase === "ready" || phase === "choose_hospital")) router.replace("/partner");
  }, [onLogin, phase, router]);

  if (onLogin) return <>{children}</>;
  if (phase === "loading") return <PartnerLoading />;

  if (phase === "signed_out") {
    // /partner 는 공개 안내, 나머지는 리다이렉트가 끝날 때까지 화면을 그리지 않는다.
    return isPublic ? <PartnerJoin onSignIn={() => router.push(LOGIN_PATH)} /> : <PartnerLoading />;
  }

  if (phase === "choose_hospital") return <HospitalChooser />;

  if (phase === "no_membership" || phase === "error") {
    return (
      <main className="px-4 pt-8">
        <div className="ct-card p-7 text-center">
          <p className="text-[18px] font-bold">
            {phase === "no_membership" ? "연결된 의료기관이 없는 계정입니다." : "파트너 화면을 열 수 없습니다."}
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">
            {phase === "no_membership"
              ? "CareTime 운영팀이 계정을 의료기관에 연결한 뒤에 사용할 수 있습니다. 로그아웃 후 문의해 주세요."
              : (notice ?? "잠시 후 다시 시도해 주세요.")}
          </p>
          <div className="mt-5 flex gap-2">
            <button type="button" onClick={() => window.location.reload()} className="ct-secondary">
              다시 시도
            </button>
            <button type="button" onClick={() => void signOut()} className="ct-secondary">
              로그아웃
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <>
      {source === "supabase" && connection === "offline" && (
        <p className="mx-4 mt-3 rounded-field bg-caution-soft px-3.5 py-2.5 text-[13px] leading-relaxed text-caution-ink">
          실시간 연결이 끊겼습니다. 다른 기기에서 바꾼 값이 바로 보이지 않을 수 있습니다. 재연결되면 자동으로
          다시 불러옵니다.
        </p>
      )}
      {notice && (
        <div role="alert" className="mx-4 mt-3 flex items-start gap-3 rounded-field bg-limited-soft px-3.5 py-2.5">
          <p className="flex-1 text-[13px] leading-relaxed text-limited-ink">{notice}</p>
          <button type="button" onClick={dismissNotice} className="shrink-0 text-[13px] font-bold text-limited-ink">
            닫기
          </button>
        </div>
      )}
      {children}
    </>
  );
}
