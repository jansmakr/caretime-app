import { redirect } from "next/navigation";
import { chatHref } from "@/features/chat/urlFilter";

/**
 * /live → /chat 리다이렉트.
 *
 * 하단 메뉴에 '실시간'(5단계 자리표시자)과 '현장톡'이 나란히 있어 중복이었다.
 * 메뉴에서는 빼되 이 경로로 공유된 기존 링크가 깨지지 않도록 화면은 남겨 리다이렉트한다.
 *
 * 넘기는 조건은 허용목록을 통과한 지역뿐이다(`chatHref` 가 검증한다). 잘못된 값은
 * 조용히 버리고 /chat 으로 보낸다. 위치·나이·개인 건강 조건은 받지 않는다.
 * 병원·카테고리 조건은 1차에 없으므로 넘기지 않는다 — 받아도 쓸 곳이 없다.
 */
export default async function LiveRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  redirect(
    chatHref({
      sido: typeof params.sido === "string" ? params.sido : null,
      sigungu: typeof params.sigungu === "string" ? params.sigungu : null,
    }),
  );
}
