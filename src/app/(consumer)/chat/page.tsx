import type { Metadata } from "next";
import { AppHeader } from "@/components/layout/AppHeader";
import { DemoNotice } from "@/components/common/DemoNotice";
import { ChatRoom } from "@/components/chat/ChatRoom";

export const metadata: Metadata = {
  title: "실시간 현장톡 · CareTime",
  description:
    "지금 병원 앞에 있는 보호자끼리 현장 상황을 묻고 답하는 공간입니다. 의료기관이 확인한 정보와 분리해서 보여줍니다.",
};

/**
 * 요청 시각을 읽으므로 정적 생성하지 않는다.
 * 빌드 때 한 번 찍힌 시각이 박히면 배포 후 "3시간 전"부터 시작한다.
 */
export const dynamic = "force-dynamic";

/**
 * 실시간 현장톡 (서버).
 *
 * 상대시각의 기준을 서버 시각 하나로 고정해서 넘긴다. 데모 대화와 첫 렌더가
 * 서버·브라우저에서 같은 값을 만들어야 hydration 이 어긋나지 않는다.
 * 건강정보를 다루지 않으므로 Search Session 에 접근하지 않는다.
 */
export default function ChatPage() {
  return (
    <>
      <AppHeader title="💬 실시간 현장톡" backHref="/" />
      <DemoNotice />
      <ChatRoom renderedAt={new Date().toISOString()} />
    </>
  );
}
