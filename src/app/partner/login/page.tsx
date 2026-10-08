import type { Metadata } from "next";
import { PartnerSignInForm } from "@/components/partner/PartnerSignInForm";

export const metadata: Metadata = {
  title: "파트너 로그인 · CareTime",
  // 병원 직원 전용. partner 레이아웃이 이미 noindex 지만 여기서도 명시한다.
  robots: { index: false, follow: false },
};

/**
 * /partner/login
 *
 * 미인증 상태로 보호 화면(/partner/capabilities 등)에 들어오면 PartnerGate 가 여기로 보낸다.
 * 이 경로만 게이트를 통과한다 — 아니면 리다이렉트가 자기 자신을 향해 반복된다.
 */
export default function PartnerLoginPage() {
  return <PartnerSignInForm />;
}
