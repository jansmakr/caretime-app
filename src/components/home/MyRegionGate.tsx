"use client";

import { useState } from "react";
import Link from "next/link";
import { RegionPicker } from "@/components/chat/RegionPicker";
import { HomeLiveTalkBanner } from "@/components/home/HomeLiveTalkBanner";
import { useMyRegion } from "@/features/regions/myRegion";
import { regionLabel } from "@/features/regions/sigungu";

/**
 * 처음 들어온 사람에게 **한 번만** 묻는다 — "어느 지역에 계세요?"
 *
 * 왜 묻는가: 전국 하나의 방이고, 글에는 글쓴이의 구가 붙는다. 그 값을 모르면 글이
 * 지역 없이 올라가고, 뒤에 오는 사람이 "내 동네 글"로 좁혀 볼 수 없다.
 *
 * GPS 를 쓰지 않는다. 좌표는 수집 항목이고 동의 화면이 따로 필요하며, 우리가 필요한
 * 것은 구 하나다. 고른 값은 **이 기기에만** 남는다(localStorage, 서버로 가지 않는다).
 *
 * ── 이 화면의 결정은 하나다 ─────────────────────────────────
 * 아직 안 고른 사람에게는 **고르는 것만** 보인다. 현장톡 버튼과 나란히 두면 "건너뛰고
 * 들어갈까"를 먼저 판단하게 되고, 그러면 대부분 건너뛴다 — 지역 없는 글이 쌓인다
 * (원칙 1).
 *
 * 다만 **막아 세우지 않는다.** "나중에 고르기"가 있고, 누르면 평소 화면이 나온다.
 * 급한 사람을 지역 선택 앞에 세워 두는 것이 가장 나쁘다(원칙 10).
 *
 * ── 첫 HTML 에는 배너를 그린다 ──────────────────────────────
 * 저장소는 서버가 못 읽으므로, 마운트 전에는 지역을 아는지 모른다. 그때 자리를 비워
 * 두면 **홈의 주 버튼이 첫 그림에서 사라진다** — 느린 기기에서 빈 상자를 보게 되고,
 * 그건 현장톡 쪽에서 이미 한 번 고친 실수다.
 *
 * 그래서 모르는 동안에는 배너를 그린다. 마운트 뒤에 지역이 없으면 묻는 카드로 바뀐다.
 * 돌아온 사람에게는 배너가 그대로 남고, 처음 온 사람은 한 틱 뒤에 질문을 본다.
 * 그 사이에 배너를 눌러 들어갔더라도 방에서 "내 지역 고르기"로 고를 수 있다 —
 * 어느 쪽으로도 막히지 않는다.
 */
export function MyRegionGate() {
  const { region, loaded, save } = useMyRegion();
  /*
   * "나중에"는 **이 방문 동안만** 기억한다. 저장하면 "안 고르겠다"가 영구 설정이 되고
   * 다시 물어볼 길이 없어진다. 다음에 들어오면 한 번 더 보이는 쪽이 낫다.
   */
  const [skipped, setSkipped] = useState(false);

  if (loaded && region === null && !skipped) {
    return (
      <section className="ct-card mt-5 p-5">
        <h3 className="break-keep text-[18px] font-bold leading-snug">어느 지역에 계세요?</h3>
        <p className="mt-1.5 break-keep text-[14px] leading-relaxed text-ink-muted">
          글에 지역이 붙어서 같은 동네 보호자가 찾아 읽을 수 있습니다. 위치 정보는 쓰지
          않고, 고른 지역은 이 기기에만 저장됩니다.
        </p>

        <div className="mt-4">
          <RegionPicker region={null} onChange={save} />
        </div>

        <button
          type="button"
          onClick={() => setSkipped(true)}
          className="mt-3 min-h-[44px] w-full text-[13.5px] font-semibold text-ink-faint"
        >
          나중에 고르기
        </button>
      </section>
    );
  }

  return (
    <>
      <HomeLiveTalkBanner />

      {/*
        저장소를 읽기 전에는 **아무것도 적지 않는다.** 모르는 상태에서 "지역을 고르지
        않았습니다"를 적으면, 고른 사람에게도 한 번 그렇게 보인다 — 틀린 말이 깜빡인다.
      */}
      {loaded &&
        (region === null ? (
          /*
           * "나중에"를 누른 사람에게만 보인다. 길을 하나 준다 — 눌러서 고를 수 있는
           * 링크다. "여기서는 못 한다"는 안내가 아니다.
           */
          <p className="mt-2 break-keep px-1 text-[12.5px] leading-relaxed text-ink-faint">
            전국 글을 보고 있습니다.{" "}
            <Link href="/chat" className="font-semibold text-blue underline">
              내 지역 고르기
            </Link>
          </p>
        ) : (
          /*
           * "현장톡에서 바꿀 수 있습니다"를 뺐다. **홈에서는 못 바꾼다는 안내였다.**
           * 바꿀 수 있는 자리(현장톡의 "내 지역 바꾸기")에서 할 말이고, 그 자리에
           * 이미 버튼이 있다. 여기서는 지금 걸린 값만 말한다.
           */
          <p className="mt-2 break-keep px-1 text-[12.5px] leading-relaxed text-ink-faint">
            내 지역 <span className="font-semibold text-ink-muted">{regionLabel(region)}</span>
          </p>
        ))}
    </>
  );
}
