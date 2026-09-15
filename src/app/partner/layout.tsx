import type { Metadata } from "next";
import { DemoNotice } from "@/components/common/DemoNotice";
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
 * 로그인(작성 권한)은 6단계 카카오 로그인과 함께 붙는다. 지금은 데모 병원 1곳 고정이다.
 */
export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <PartnerProvider>
      <div className="mx-auto min-h-dvh max-w-app pb-8">
        <PartnerHeader />
        <DemoNotice />
        {children}
      </div>
    </PartnerProvider>
  );
}
