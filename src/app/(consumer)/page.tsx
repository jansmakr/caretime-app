import { AppHeader } from "@/components/layout/AppHeader";
import { DemoNotice } from "@/components/common/DemoNotice";
import { LiveTalkBanner } from "@/components/home/LiveTalkBanner";
import { HomeSearchForm } from "@/components/home/HomeSearchForm";

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
        <h2 className="text-[28px] font-extrabold leading-[1.3]">
          지금 어떤 상황인지
          <br />
          말씀해주세요.
        </h2>
        <HomeSearchForm />
        {/*
         * 현장톡 배너. 본문 흐름 안에 두고 하단 고정·팝업으로 만들지 않는다.
         * 홈에는 아직 지역·진료 항목 선택 UI 가 없어서 넘길 조건이 없다.
         * 임의 기본 지역을 만들지 않고 /chat 으로만 보낸다. 조건 전달은 2단계에서 붙는다.
         */}
        <LiveTalkBanner />
      </main>
    </>
  );
}
