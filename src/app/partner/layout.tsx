import type { Metadata } from "next";
import { DemoNotice } from "@/components/common/DemoNotice";
import { PartnerGate } from "@/components/partner/PartnerGate";
import { PartnerHeader } from "@/components/partner/PartnerHeader";
import { PartnerProvider } from "@/features/partner/PartnerProvider";

export const metadata: Metadata = {
  title: "CareTime 파트너",
  // 병원 직원 전용 화면. 검색엔진에 노출하지 않는다.
  robots: { index: false, follow: false },
};

/**
 * 병원 파트너 레이아웃.
 * 보호자 화면의 하단 메뉴·Search Session 을 쓰지 않는다. 헤더 탭으로만 이동한다.
 * Supabase 연결 시 이메일 로그인 + hospital_members 소속 확인을 거친다. (카카오 로그인은 6단계)
 */
export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <PartnerProvider>
      <div className="mx-auto min-h-dvh max-w-app pb-8">
        <PartnerHeader />
        <DemoNotice />
        <PartnerGate>{children}</PartnerGate>
      </div>
    </PartnerProvider>
  );
}
