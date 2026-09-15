import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BottomNav } from "@/components/layout/BottomNav";
import { SearchSessionProvider } from "@/features/search-session/SearchSessionProvider";

export const metadata: Metadata = {
  title: "CareTime · 지금 필요한 진료정보를 빠르게",
  description:
    "야간·휴일 의료기관의 세부 진료기능과 현재 상황을 출처와 확인시각을 구분해 보여주는 의료정보 내비게이션입니다.",
  // 건강정보가 담긴 화면은 색인시키지 않는다.
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#FFFFFF",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5, // 확대를 막지 않는다. 저시력 사용자가 쓰는 앱이다.
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <SearchSessionProvider>
          <div className="mx-auto min-h-dvh max-w-app pb-[58px]">{children}</div>
          <BottomNav />
        </SearchSessionProvider>
      </body>
    </html>
  );
}
