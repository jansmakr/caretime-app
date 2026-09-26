import { AppHeader } from "@/components/layout/AppHeader";
import { DemoNotice } from "@/components/common/DemoNotice";
import { HomeLiveFeed } from "@/components/home/HomeLiveFeed";
import { HomeSearchForm } from "@/components/home/HomeSearchForm";

/**
 * 요청 시각을 읽으므로 정적 생성하지 않는다.
 * 빌드 때 찍힌 시각이 박히면 배포 후 "3시간 전"부터 시작한다. (/chat 과 같은 이유)
 */
export const dynamic = "force-dynamic";

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
        {/* 검색 바 바로 아래. 야간에 앱을 여는 사람에게 가장 먼저 필요한 건
            검색 결과보다 방금 다녀온 보호자의 한 줄이다. */}
        <HomeLiveFeed renderedAt={new Date().toISOString()} />
      </main>
    </>
  );
}
