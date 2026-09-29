import Link from "next/link";
import type { ChatFilter } from "@/features/chat/types";
import { chatHref } from "@/features/chat/urlFilter";

/**
 * 검색 결과에서 현장톡으로 나가는 길.
 *
 * 없으면 검색 결과가 막다른 길이 된다. 참여 병원이 0곳인 동안 목록은 구조적으로
 * 전부 "현재 상태 확인 필요"이고, 보호자가 얻는 답은 "전화해 보세요" 하나뿐이다.
 * 그건 임시 상태가 아니라 1차 출시의 기본 화면이다.
 *
 * 전화를 대신하지 않는다. 전화가 가장 정확하다는 것은 그대로 두고, 전화가 어렵거나
 * 통화가 안 될 때 갈 곳을 하나 더 준다 — 지금 그 앞에 서 있는 다른 보호자.
 *
 * 고른 조건을 그대로 들고 간다. 지역을 고른 사람이 전국 글을 보게 되면 "내 동네 이야기가
 * 없다"로 읽히고, 그건 사실이 아니다. (urlFilter 가 허용값만 통과시킨다)
 */
export function FieldTalkExit({
  filter,
  variant = "default",
}: {
  filter: ChatFilter;
  /** empty: 결과가 0건일 때. 그때는 이것이 그 화면의 유일한 다음 행동이다. */
  variant?: "default" | "empty";
}) {
  const region = filter.sigungu ?? filter.sido;

  return (
    <section className="ct-card p-5">
      <h2 className="text-[17px] font-bold leading-snug">
        {variant === "empty"
          ? "지금 그 앞에 있는 분께 물어보세요"
          : "상태가 확인되지 않았나요?"}
      </h2>

      <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">
        {variant === "empty"
          ? "조건에 맞는 의료기관 정보가 없어도, 현장에 있는 보호자에게 지금 상황을 물어볼 수 있습니다."
          : "의료기관이 직접 확인한 정보가 없을 때는, 지금 그 병원 앞에 있는 보호자에게 물어볼 수 있습니다."}
      </p>

      <Link href={chatHref(filter)} className="ct-primary mt-4">
        {region ? `${region} 현장톡 보기` : "현장톡 보기"}
      </Link>

      <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink-faint">
        이용자끼리 나누는 정보입니다. 의료기관이 확인한 정보가 아닙니다.
      </p>
    </section>
  );
}
