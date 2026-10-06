import Link from "next/link";
import { EmergencyCallout } from "@/components/common/EmergencyCallout";
import { PartnerCta } from "@/components/common/PartnerCta";
import { showPartnerEntry } from "@/lib/demoContent";

export function AppHeader({
  title,
  backHref,
  /** 더보기 진입점을 그릴 것인가. /more 자신에게는 자기 링크를 두지 않는다. */
  showMore = true,
}: {
  title?: string;
  backHref?: string;
  showMore?: boolean;
}) {
  return (
    <header className="sticky top-0 z-40 bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-app items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-1">
          {backHref && (
            <Link
              href={backHref}
              aria-label="뒤로"
              className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink active:bg-fill"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          )}
          {title ? (
            <h1 className="truncate text-[18px] font-bold">{title}</h1>
          ) : (
            <Link href="/" className="flex items-center gap-1.5 text-[20px] font-extrabold tracking-tight">
              <span className="h-2.5 w-2.5 rounded-full bg-blue" aria-hidden />
              CareTime
            </Link>
          )}
        </div>
        {/*
          오른쪽 묶음: 더보기 → 참여 CTA → 119. 119 가 항상 가장 바깥(엄지에 가까운
          쪽)이다. 1차에는 참여 병원이 없어 CTA 를 내린다 — 아무도 들어갈 수 없는 문이다.

          ── 더보기는 **서랍이 아니다** ───────────────────────
          /more 로 보낸다. 서랍(오버레이·포커스 트랩·스크롤 잠금·ESC)은 한 번 읽는
          내용에 붙이기에는 큰 장치다(원칙 10). 화면이 이미 있고 약관·방침이 그
          화면 맨 위 두 줄이라, 열면 바로 보인다.

          하단 고정 메뉴를 지운 결정과 어긋나지 않는다. 그때 지운 것은 **아무 데도
          가지 않는 문 네 개**와 화면 아래 60px 이었다. 이것은 머리띠 안의 44px
          하나이고 본문을 깎지 않는다.
        */}
        <div className="flex shrink-0 items-center gap-2">
          {showMore && (
          <Link
            href="/more"
            aria-label="더보기 — 약관·개인정보 처리방침·사업자 정보"
            className="flex h-11 min-w-[44px] items-center justify-center rounded-full px-2 text-[14px] font-semibold text-ink-muted active:bg-fill"
          >
            더보기
          </Link>
          )}
          {showPartnerEntry && <PartnerCta />}
          <EmergencyCallout />
        </div>
      </div>
    </header>
  );
}
