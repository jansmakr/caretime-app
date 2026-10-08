import type { Metadata } from "next";
import { AppHeader } from "@/components/layout/AppHeader";
import { StageNotice } from "@/components/common/StageNotice";
import { ChatRoom } from "@/components/chat/ChatRoom";
import { readMyPostIds } from "@/features/chat/myPosts";
import { fetchFieldReports } from "@/features/chat/repository";
import { chatFilterFromParams } from "@/features/chat/urlFilter";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "실시간 현장톡 · CareTime",
  description:
    "지금 병원 앞에 있는 보호자끼리 현장 상황을 묻고 답하는 공간입니다. 의료기관이 확인한 정보와 분리해서 보여줍니다.",
};

/**
 * 요청 시각과 URL 조건을 읽으므로 정적 생성하지 않는다.
 * 빌드 때 찍힌 시각이 박히면 배포 후 "3시간 전"부터 시작한다.
 */
export const dynamic = "force-dynamic";

/**
 * 실시간 현장톡 (서버).
 *
 * 상대시각의 기준을 서버 시각 하나로 고정해서 넘긴다. 데모 대화와 첫 렌더가
 * 서버·브라우저에서 같은 값을 만들어야 hydration 이 어긋나지 않는다.
 * 건강정보를 다루지 않으므로 Search Session 에 접근하지 않는다.
 *
 * 초기 조건은 URL 에서 받되 허용목록을 통과한 값만 쓴다. 잘못된 값은 조용히 버린다.
 * 나이·정확한 위치·개인 건강 조건은 받는 키 자체를 두지 않았다. (urlFilter)
 *
 * 글도 여기서 읽어 넘긴다. 클라이언트에서만 읽으면 **처음 그려지는 것은 언제나 빈 방**이고,
 * 출시 직후처럼 글이 적을 때 그 한 순간이 "아무도 없는 곳"으로 읽힌다.
 * 조회가 실패해도 화면은 연다 — 목록이 비는 것이 화면 전체가 막히는 것보다 낫다.
 */
export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  /*
   * 조회 실패와 "아직 글이 없음"을 구분해서 넘긴다.
   * 둘을 같게 다루면 서버가 죽은 날에도 화면이 "아직 올라온 글이 없습니다"라고 말한다.
   * 그건 사실이 아니고, 첫 사용자는 그 말을 믿고 방이 비었다고 생각한다.
   */
  /*
   * 거르는 일을 서버가 한다. 전에는 최신 100건을 받아 브라우저가 걸렀다 — 글을 쌓기
   * 시작하면 "내 구 보기"가 그 100건 밖의 글을 못 본다.
   *
   * 조건은 URL 에서 온다. 내 지역은 브라우저에 있어서 서버가 못 읽으므로, 첫 화면은
   * 링크에 지역이 없으면 **전국**이다. 화면이 마운트된 뒤 내 지역으로 좁힐 수 있다.
   */
  const filter = chatFilterFromParams(params);
  const initial = isSupabaseConfigured
    ? await fetchFieldReports(createServerSupabase(), {
        sido: filter.sido,
        sigungu: filter.sigungu,
        recentOnly: filter.recentOnly,
      }).then(
        (messages) => ({ messages, failed: false }),
        () => ({ messages: [], failed: true }),
      )
    : { messages: [], failed: false };

  /*
   * 이 브라우저가 쓴 글이 무엇인지 서버가 읽어 넘긴다. 없으면 첫 그림에 삭제 버튼이
   * 없다 — 자기 글을 지우러 온 사람에게는 그게 '없는 기능'이다.
   */
  const myPostIds = await readMyPostIds();

  return (
    <>
      <AppHeader title="💬 실시간 현장톡" backHref="/" />
      <StageNotice />
      <ChatRoom
        renderedAt={new Date().toISOString()}
        initialFilter={filter}
        initialMessages={initial.messages}
        initialLoadFailed={initial.failed}
        initialMyPostIds={myPostIds}
      />
    </>
  );
}
