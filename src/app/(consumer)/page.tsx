import Link from "next/link";
import { AppHeader } from "@/components/layout/AppHeader";
import { StageNotice } from "@/components/common/StageNotice";
import { DiscoveryForm } from "@/components/home/DiscoveryForm";
import { MyRegionGate } from "@/components/home/MyRegionGate";
import { showCareConditionForm, showHospitalDirectory } from "@/lib/demoContent";

/*
 * 홈은 다시 정적 렌더다.
 * 라이브 피드가 요청 시각(new Date())을 읽어서 force-dynamic 이 필요했는데,
 * 배너는 시각·건수를 쓰지 않으므로 그 이유가 없어졌다. 쿠키·요청 정보에 의존하는
 * 다른 요소도 홈에는 없다. (성능 목적의 추가 리팩터링은 하지 않았다)
 */

/**
 * 홈.
 *
 * 1차의 결정은 하나다 — **현장톡을 연다.** 그래서 현장톡이 첫 화면의 맨 위에 있고,
 * 가장 큰 글씨와 유일한 주 버튼을 가진다(UI 원칙 1·5).
 *
 * 전에는 지역·진료 항목·방문 목적을 먼저 묻고, 그 아래에 현장톡 배너가 있었다.
 * 세 질문은 "야간 소아 외상 병원 찾기"의 입구이고 답으로 나오는 것은 병원 2곳의
 * 목록이다. 보호자가 밤에 묻는 것은 "지금 어디 열었나요?" 이고 그 답은 현장톡에 있다.
 * 폼은 지우지 않고 내렸다(lib/demoContent.showCareConditionForm).
 *
 * 병원 전화번호·주소를 찾는 길은 아래에 작게 남긴다. 전화번호는 1차에서도 가장
 * 쓸모 있는 값이라 길을 없애지 않는다 — 다만 주 버튼을 두 개 만들지 않는다.
 */
export default function HomePage() {
  return (
    <>
      <AppHeader />
      <StageNotice />
      <main className="px-5 pt-8">
        <h2 className="break-keep text-[26px] font-extrabold leading-[1.3]">
          {showCareConditionForm ? (
            <>
              어디에서 어떤 진료를
              <br />
              찾으시나요?
            </>
          ) : (
            <>
              지금 문 연 곳,
              <br />
              먼저 물어보세요
            </>
          )}
        </h2>

        {showCareConditionForm && <DiscoveryForm />}

        {/*
         * 지역을 아직 안 고른 사람에게는 그것만 묻고, 고른 사람에게는 현장톡 배너를
         * 보여준다. 둘을 나란히 두면 "건너뛰고 들어갈까"를 먼저 판단하게 된다.
         * 배너는 본문 흐름 안에 두고 하단 고정·팝업으로 만들지 않는다.
         */}
        <MyRegionGate />

        {/*
         * 병원 목록으로 가는 길은 1차에 없다. 글을 병원이 아니라 구에 걸기로 했고,
         * 병원 이름은 본문에 그냥 쓴다. 라우트도 닫혀 있다(404).
         * 되살릴 때 이 칸이 돌아온다 — lib/demoContent.showHospitalDirectory.
         */}
        {showHospitalDirectory && (
          <section className="mt-6 border-t border-line pt-5">
            <h3 className="text-[15px] font-bold">의료기관 전화번호 · 주소</h3>
            <p className="mt-1.5 break-keep text-[13.5px] leading-relaxed text-ink-muted">
              강서구 야간·휴일 진료 지정 의료기관을 등록해 두었습니다. 지금 상황은 전화로
              확인하는 것이 가장 정확합니다.
            </p>
            <Link href="/search" className="ct-secondary mt-3 w-full">
              의료기관 목록 보기
            </Link>
          </section>
        )}

      </main>
    </>
  );
}
