import { AppHeader } from "@/components/layout/AppHeader";
import { DemoNotice } from "@/components/common/DemoNotice";
import { DiscoveryForm } from "@/components/home/DiscoveryForm";
import { HomeLiveTalkBanner } from "@/components/home/HomeLiveTalkBanner";

/*
 * 홈은 다시 정적 렌더다.
 * 라이브 피드가 요청 시각(new Date())을 읽어서 force-dynamic 이 필요했는데,
 * 배너는 시각·건수를 쓰지 않으므로 그 이유가 없어졌다. 쿠키·요청 정보에 의존하는
 * 다른 요소도 홈에는 없다. (성능 목적의 추가 리팩터링은 하지 않았다)
 */

export default function HomePage() {
  return (
    <>
      <AppHeader />
      <DemoNotice />
      <main className="px-5 pt-8">
        <h2 className="text-[26px] font-extrabold leading-[1.3]">
          어디에서 어떤 진료를
          <br />
          찾으시나요?
        </h2>
        <DiscoveryForm />
        {/*
         * 현장톡 배너. 본문 흐름 안에 두고 하단 고정·팝업으로 만들지 않는다.
         * 선택한 지역·일반 카테고리만 넘긴다. 나이·방문 목적·좌표는 넘기지 않는다.
         */}
        <HomeLiveTalkBanner />
      </main>
    </>
  );
}
