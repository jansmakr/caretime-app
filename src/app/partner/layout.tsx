import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DemoNotice } from "@/components/common/DemoNotice";
import { PartnerGate } from "@/components/partner/PartnerGate";
import { PartnerHeader } from "@/components/partner/PartnerHeader";
import { PartnerProvider } from "@/features/partner/PartnerProvider";
import { showPartnerEntry } from "@/lib/demoContent";

export const metadata: Metadata = {
  title: "CareTime 파트너",
  // 병원 직원 전용 화면. 검색엔진에 노출하지 않는다.
  robots: { index: false, follow: false },
};

/**
 * 병원 파트너 레이아웃.
 * 보호자 화면의 하단 메뉴·Search Session 을 쓰지 않는다. 헤더 탭으로만 이동한다.
 * Supabase 연결 시 이메일 로그인 + hospital_members 소속 확인을 거친다. (카카오 로그인은 6단계)
 *
 * 1차에는 참여 병원이 0곳이라 이 화면 전체를 닫는다(lib/demoContent.showPartnerEntry).
 * 링크만 떼지 않고 라우트에서 막는 이유: 주소를 아는 사람에게는 그대로 열려 있고,
 * 그 화면은 지금 보여 줄 값도 받을 값도 없다. 코드는 지우지 않았다.
 */
export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  if (!showPartnerEntry) notFound();

  return (
    <PartnerProvider>
      <div className="mx-auto min-h-dvh max-w-app pb-[calc(24px+env(safe-area-inset-bottom))]">
        <PartnerHeader />
        <DemoNotice />
        <PartnerGate>{children}</PartnerGate>
      </div>
    </PartnerProvider>
  );
}
