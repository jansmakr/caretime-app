import type { Metadata, Viewport } from "next";
import "./globals.css";
import { isSearchIndexingOpen } from "@/lib/demoContent";

export const metadata: Metadata = {
  title: "CareTime · 지금 필요한 진료정보를 빠르게",
  description:
    "야간·휴일 의료기관의 세부 진료기능과 현재 상황을 출처와 확인시각을 구분해 보여주는 의료정보 내비게이션입니다.",
  /*
   * 색인 여부는 lib/demoContent 가 정한다.
   *
   * 전에는 주석에 "색인시키지 않는다"고 적고 값은 `index: true` 였다 — 코드가 주석을
   * 따르지 않았고, 그래서 "noindex 유지"가 사실이 아니었다. 띄워서 메타 태그를 읽고
   * 찾았다.
   *
   * 지금은 닫는다. 아는 사람 몇 명에게 주소를 주며 시작하고, 검색으로 들어온 사람은
   * 등록된 의료기관이 2곳인 것을 모르고 온다. 여는 시점은 사람이 따로 정한다.
   */
  robots: { index: isSearchIndexingOpen, follow: isSearchIndexingOpen },

  /*
   * 홈 화면 바로가기(app/manifest.ts). iOS 사파리는 manifest 의 아이콘을 쓰지 않고
   * apple-touch-icon 을 본다 — 안 주면 화면을 캡처한 그림이 아이콘이 된다.
   */
  manifest: "/manifest.webmanifest",
  icons: { apple: "/apple-touch-icon.png" },
  appleWebApp: {
    capable: true,
    title: "현장톡",
    // 상태표시줄을 머리띠 색과 같이 둔다. 다르면 위쪽에 띠가 하나 더 보인다.
    statusBarStyle: "default",
  },
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
