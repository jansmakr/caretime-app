"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { HospitalChooser } from "@/components/partner/HospitalChooser";
import { PartnerJoin } from "@/components/partner/PartnerJoin";
import { PartnerLoading } from "@/components/partner/PartnerLoading";
import { usePartner } from "@/features/partner/PartnerProvider";
import { describeConflict } from "@/features/partner/service";

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
 * **실제 차단은 두 곳이 한다.** 페이지가 만들어지기 전에 미들웨어(src/middleware.ts)가
 * 비인증 요청을 돌려보내고, 데이터 접근은 DB(RLS)가 판정한다.
 * 이 컴포넌트가 하는 일은 그 사이의 안내다 — 세션이 화면을 쓰는 도중에 끊긴 경우,
 * 그리고 소속이 여럿일 때의 선택 화면.
 *
 * 그래서 여기의 리다이렉트는 보안 장치가 아니다. 그 역할은 미들웨어로 옮겼다
 * (파트너 세션이 localStorage 가 아니라 쿠키에 있어 서버가 읽을 수 있다).
 */

const LOGIN_PATH = "/partner/login";
/** 공개 화면. 미인증이라도 리다이렉트하지 않는다. */
const PUBLIC_PATHS = new Set(["/partner", LOGIN_PATH]);

export function PartnerGate({ children }: { children: React.ReactNode }) {
  const { phase, notice, dismissNotice, connection, source, signOut, conflict, resolveConflict } =
    usePartner();
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
      {/*
        동시수정. 야간에 당직자 둘이 같은 화면을 보는 일은 흔하다.
        "충돌이 발생했습니다"로 끝내지 않는다 — 무엇이 달라졌는지 적고, 할 행동 하나를 준다.
        자동으로 다시 읽지 않는다. 그러면 방금 누른 값이 말없이 사라진다(원칙 1·5·6).
      */}
      {conflict && (
        <div
          role="alert"
          className="mx-4 mt-3 rounded-field bg-caution-soft px-4 py-3.5 text-caution-ink"
        >
          <p className="text-[15px] font-bold leading-relaxed">
            {describeConflict(conflict.changes)}
          </p>
          <p className="mt-1 text-[14px] leading-relaxed">
            내가 누른 값은 저장되지 않았습니다. 최신 상태를 확인하고 다시 눌러 주세요.
          </p>
          <button
            type="button"
            onClick={resolveConflict}
            className="mt-3 min-h-[44px] w-full rounded-field bg-caution-ink px-4 text-[16px] font-bold text-white active:scale-[0.99]"
          >
            최신 상태 보기
          </button>
        </div>
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
