import type { MetadataRoute } from "next";

/**
 * 홈 화면 바로가기(PWA) 선언.
 *
 * 왜 필요한가: 밤에 아이가 아플 때 브라우저를 열고 주소를 치는 단계가 하나라도
 * 줄면 그만큼 빨리 도착한다. 아이콘 하나로 열리는 것이 이 서비스에서는 기능이다.
 *
 * ── 범위 ────────────────────────────────────────────────────
 * 알림(푸시)·오프라인 캐시(service worker)를 넣지 않는다. 바로가기만 만든다.
 *   · 푸시는 수집 항목이 늘고(구독 토큰) 방침을 고쳐야 한다. 2차에 로그인과 함께.
 *   · 오프라인 캐시는 **오래된 글을 최신인 양 보여 줄 수 있다.** 이 서비스에서
 *     가장 하면 안 되는 일이다. 네트워크가 없으면 없다고 보이는 쪽이 맞다.
 *
 * `display: "standalone"` 이라 주소창이 사라진다. 그래서 머리띠의 CareTime 글자가
 * 유일한 "여기가 어디인지"가 된다 — 지우지 않는다.
 *
 * HTTPS 에서만 설치가 돈다. 로컬(http)에서는 manifest 가 응답하는 것까지만 확인할
 * 수 있고, 실제 설치는 배포 뒤 `*.vercel.app` 에서 본다(docs/DEPLOY-order.md I절).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CareTime 현장톡",
    // 아이콘 아래에 붙는 이름. 길면 잘린다.
    short_name: "현장톡",
    description: "지금 문 연 곳, 가본 곳. 같은 동네 보호자에게 묻고 알려주는 곳.",
    /*
     * 바로가기로 열면 홈이 아니라 **현장톡으로 바로 간다.** 아이콘을 만든 사람은
     * 이미 이 서비스가 무엇인지 알고, 급할 때 필요한 것은 방이다(원칙 1·5).
     */
    start_url: "/chat",
    scope: "/",
    display: "standalone",
    background_color: "#F2F4F6",
    // 머리띠 색과 같다(app/layout 의 viewport.themeColor). 두 값이 갈라지면 깜빡인다.
    theme_color: "#F2F4F6",
    lang: "ko",
    dir: "ltr",
    orientation: "portrait",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      /*
       * 안드로이드는 아이콘을 제조사 모양대로 깎는다. 여유를 둔 판을 따로 준다 —
       * 안 주면 말풍선 모서리가 잘린다.
       */
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
