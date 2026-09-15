import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CareTime · 지금 필요한 진료정보를 빠르게",
  description:
    "야간·휴일 의료기관의 세부 진료기능과 현재 상황을 출처와 확인시각을 구분해 보여주는 의료정보 내비게이션입니다.",
  // 건강정보가 담긴 화면은 색인시키지 않는다.
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#F2F4F6",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5, // 확대를 막지 않는다. 저시력 사용자가 쓰는 앱이다.
};

/**
 * 루트 레이아웃은 html/body 만 둔다.
 * 보호자 화면은 (consumer), 병원 화면은 partner 레이아웃이 각자의 내비게이션을 가진다.
 * 두 화면이 하단 메뉴를 공유하지 않게 하려는 분리다. (기획안 5항)
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* Pretendard 가변 폰트. 화면에 쓰인 글자만 내려받는 동적 서브셋이라 첫 로딩이 가볍다. */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
