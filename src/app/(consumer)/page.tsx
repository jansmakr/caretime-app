import Link from "next/link";
import { AppHeader } from "@/components/layout/AppHeader";
import { StageNotice } from "@/components/common/StageNotice";
import { DiscoveryForm } from "@/components/home/DiscoveryForm";
import { MyRegionGate } from "@/components/home/MyRegionGate";
import { InstallHint } from "@/components/common/InstallHint";
import { PartnerInquiry } from "@/components/common/PartnerInquiry";
import { LegalFooter } from "@/components/legal/LegalFooter";
import { showCareConditionForm, showHospitalDirectory } from "@/lib/demoContent";

/*
 * 홈은 다시 정적 렌더다.
 * 라이브 피드가 요청 시각(new Date())을 읽어서 force-dynamic 이 필요했는데,
 * 배너는 시각·건수를 쓰지 않으므로 그 이유가 없어졌다. 쿠키·요청 정보에 의존하는
 * 다른 요소도 홈에는 없다. (성능 목적의 추가 리팩터링은 하지 않았다)
 */

/*
 * 단, 약관·방침 한 줄(LegalFooter)은 **오늘 날짜로** "시행 전 / 동의하는 것으로
 * 봅니다"를 가른다. 정적으로 굳으면 빌드한 날의 판정이 시행일 뒤에도 남는다 —
 * 2026-10-26 이 지나도 재배포 전까지 "시행 전"이라고 적힌다. 한 시간마다 다시 그린다.
 */
export const revalidate = 3600;

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
            /*
              "지금 문 연 곳"만 적으면 평소 경험을 쓰려는 사람이 멈춘다. 글을
              쌓기로 한 것과 맞지 않는다 — 가본 이야기가 뒤에 오는 사람에게 남는다.
             */
            <>
              문 연 곳, 가본 곳
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
          홈 화면 바로가기. **한 줄이고, 닫으면 다시 안 뜬다.**
          밤에 아이콘 하나로 열리는 것이 이 서비스에서는 기능이라 첫 화면에서도
          찾을 수 있게 둔다. 다만 배너로 키우지 않는다 — 지금 할 일은 글이다.
          설치할 길이 없는 브라우저에서는 아무것도 그리지 않는다.
        */}
        <InstallHint />

        {/*
          의료기관 사전 신청. 보호자 흐름(제목 → 현장톡 버튼) 뒤에 둔다 —
          이 화면의 주인공은 보호자이고, 병원 담당자는 드물게 온다.
          평소에는 접힌 카드 한 장이고, 누를 때만 폼이 펼쳐진다(원칙 4).
        */}
        <PartnerInquiry />

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

      {/*
        약관·방침 한 줄. **홈에만 있다.** 개인정보보호법 제30조 2항의 "쉽게 확인할
        수 있도록"이 첫 화면 링크를 뜻하기 때문이다. 사업자 정보 4줄은 /more 로
        옮겼다 — 그쪽은 파는 곳에 걸리는 의무라 우리에게 해당하지 않는다.
      */}
      <LegalFooter />
    </>
  );
}
