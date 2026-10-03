import Link from "next/link";
import { chatHref } from "@/features/chat/urlFilter";
import { isFieldTalkSharingLive } from "@/lib/demoContent";

/**
 * 홈 → 현장톡 배너.
 *
 * 홈에서 하던 일(주의문 · 등록창 · 본문 미리보기 · 글별 리액션 · 중복 작성 버튼)을
 * 전부 걷어내고 이 배너 하나로 바꾼 것이다. 읽기·쓰기 기능은 /chat 에 그대로 있다.
 *
 * 문구는 두 벌이다.
 *  - 준비 중: 현장톡의 서버 조회·작성이 아직 없다. 지금 기본값이다.
 *  - 활성: 서버 저장·다른 기기 수신이 검증된 뒤 자동으로 이 문구로 바뀐다.
 *    전환 조건은 `lib/demoContent.isFieldTalkSharingLive` 한 곳에만 있다.
 *
 * 지키는 것:
 *  - 배너 전체가 링크 하나다. 안에 버튼을 따로 두지 않는다(중첩 클릭 영역 금지).
 *  - min-height 만 두고 고정 높이를 강제하지 않는다. 글자 확대·줄바꿈에 잘리면 안 된다.
 *    (측정 높이 175px — 필수 문구 4종 + 44px 터치 타깃의 하한. 가독성을 우선해 이대로 둔다)
 *  - 번쩍임·강제 애니메이션·가짜 알림 점을 쓰지 않는다.
 *  - 건수·'방금'·참여자 수를 **적지 않는다.** 서버 조회가 없어 실제 값을 알 수 없고,
 *    브라우저 메모리·가상 시드를 제보 건수로 세면 거짓이 된다.
 *  - 조건 태그는 실제로 선택된 값이 있을 때만 붙인다. 임의 기본 지역을 만들지 않는다.
 */

const PREPARING = {
  hook: "지금 접수할까? 얼마나 기다릴까?",
  description: "주변 병원의 접수·대기 상황을 나눌 현장톡을 준비하고 있어요.",
  button: "현장톡 안내 보기 →",
} as const;

/*
 * 1차의 주 동작이다. 홈에서 h2 바로 아래에 오고, 이 화면의 유일한 주 버튼이다.
 * 문구를 "접수·대기"에서 "열었는지"로 옮겼다 — 보호자가 밤에 먼저 묻는 것이 그것이고,
 * 등록된 병원이 2곳뿐인 1차에서 우리가 답할 수 있는 것도 그것이다.
 * 증상·평가·추천을 적지 않는다.
 */
const ACTIVE = {
  hook: "지금 열었나요? 얼마나 기다리나요?",
  description:
    "같은 동네 보호자에게 지금 상황을 묻고, 본 것을 알려주세요. 지역을 고르지 않아도 글을 남길 수 있습니다.",
  button: "우리 동네 현장톡 열기 →",
  /** 실제 제보를 보여줄 때만 붙는 고지. 준비 중에는 보여 줄 제보가 없어 달지 않는다. */
  notice: "이용자 제보입니다. 방문 전 병원에 전화로 확인해 주세요.",
} as const;

export function LiveTalkBanner({
  sido = null,
  sigungu = null,
  category = null,
  categoryLabel = null,
}: {
  sido?: string | null;
  sigungu?: string | null;
  category?: string | null;
  /** 화면에 보일 진료 항목 이름. category 와 짝이 맞을 때만 넘긴다. */
  categoryLabel?: string | null;
}) {
  /*
   * 방은 하나다(전국). 지역은 브라우저에 기억된 내 지역으로 화면에서 좁히므로
   * 링크에 조건을 싣지 않는다 — 홈에서 고른 조건을 들고 가던 경로는 없어졌다.
   */
  const href = chatHref({ sido, sigungu });
  const copy = isFieldTalkSharingLive ? ACTIVE : PREPARING;
  // 태그는 실제로 고른 값만. 없으면 아무것도 붙이지 않는다.
  const tags = [sigungu ?? sido, categoryLabel].filter((v): v is string => Boolean(v));

  return (
    <section className="mt-5">
      <Link
        href={href}
        aria-label={`실시간 병원 상황 공유${isFieldTalkSharingLive ? "" : " · 준비 중"} · ${copy.button.replace(" →", "")}`}
        className="ct-card block min-h-[100px] p-4 transition active:scale-[0.99] active:brightness-[0.98]"
      >
        {tags.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span key={tag} className="ct-chip bg-blue-soft text-blue-deep">
                {tag}
              </span>
            ))}
          </div>
        )}

        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-bold text-blue-deep">
          실시간 병원 상황 공유
          {!isFieldTalkSharingLive && (
            /* 상태 표시. 색만으로 구분하지 않고 글자로 적는다. */
            <span className="rounded-pill bg-fill px-2 py-0.5 text-[11.5px] font-bold text-ink-muted">
              준비 중
            </span>
          )}
        </p>
        <p className="mt-0.5 break-keep text-[18px] font-extrabold leading-tight">{copy.hook}</p>
        <p className="mt-1.5 break-keep text-[13.5px] leading-snug text-ink-muted">
          {copy.description}
        </p>

        {/* 실제 button 이 아니다. 배너 전체가 링크이므로 중첩 클릭 영역을 만들지 않는다. */}
        <span className="mt-3 inline-flex min-h-[44px] items-center break-keep rounded-field bg-blue px-4 text-[15px] font-semibold text-white">
          {copy.button}
        </span>
      </Link>

      {/*
        안내 문구는 링크 밖에 둔다. 면책 고지는 클릭 대상이 아니다.
        준비 중에는 보여 줄 제보가 없어 "이용자 제보입니다"를 달지 않는다 —
        없는 제보를 있다고 읽히게 만들지 않기 위해서다.
      */}
      {isFieldTalkSharingLive && (
        <p className="mt-2 break-keep px-1 text-[12px] leading-relaxed text-ink-faint">
          {ACTIVE.notice}
        </p>
      )}
    </section>
  );
}
