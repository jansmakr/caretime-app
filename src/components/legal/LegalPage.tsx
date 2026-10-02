import Link from "next/link";
import { AppHeader } from "@/components/layout/AppHeader";
import { LegalBody } from "@/components/legal/LegalBody";
import { loadLegalDocument, type LegalDocId } from "@/features/legal/documents";
import { isPolicyInForce, todayInSeoul } from "@/features/legal/version";

/**
 * /terms · /privacy 공통 화면.
 *
 * 준비되지 않았으면 그렇게 말한다. 빈 문서를 "방침"이라는 제목으로 보여 주면
 * 읽은 사람은 이것이 방침의 전부라고 믿는다. 그게 가장 나쁜 쪽이다.
 */
export function LegalPage({ id, fallbackTitle }: { id: LegalDocId; fallbackTitle: string }) {
  const document = loadLegalDocument(id);
  const title = document.title || fallbackTitle;
  /*
   * 시행일이 아직 오지 않았으면 그렇게 적는다. 사전 고지 기간에 "시행일 2026-10-13"만
   * 적어 두면 읽는 사람은 지금 효력이 있는 줄로 안다.
   */
  const upcoming =
    document.ready && document.effectiveDate !== null && !isPolicyInForce()
      ? document.effectiveDate
      : null;

  return (
    <>
      <AppHeader title={title} backHref="/more" />
      <main className="space-y-3 px-4 pb-6 pt-3">
        <section className="ct-card p-5">
          {document.ready ? (
            <>
              {upcoming ? (
                <p className="rounded-field bg-caution-soft px-3.5 py-2.5 text-[13px] font-semibold leading-relaxed text-caution-ink">
                  {upcoming} 부터 시행됩니다. 지금은 미리 읽어 보실 수 있도록 공개한
                  것이며 아직 효력이 없습니다. (오늘 {todayInSeoul()})
                </p>
              ) : (
                <p className="text-[13px] font-semibold text-ink-faint">
                  시행일 {document.effectiveDate}
                </p>
              )}
              <div className="mt-3">
                <LegalBody document={document} />
              </div>
            </>
          ) : (
            <>
              <h2 className="ct-section-title">준비 중입니다</h2>
              <p className="mt-2 text-[14.5px] leading-relaxed text-ink-muted">
                {title} 본문을 준비하고 있습니다. 아직 올리지 않은 문서를 방침으로
                보여 드리지 않습니다.
              </p>
              {/*
                문서가 없는 동안에도 이것만은 적는다. 보관 기간은 docs/DATA-INVENTORY.md
                와 DB 의 retention_policy 표에서 온 값이다 — 여기 숫자를 손으로 바꾸면
                방침과 실제가 갈라진다.
              */}
              <p className="mt-2 text-[14.5px] leading-relaxed text-ink-muted">
                지금 저장하는 것은 글 내용과 서버가 만든 별명뿐입니다. 글은 24시간 동안
                공개되고 30일 뒤 지워집니다. 이름·연락처·위치는 저장하지 않습니다.
              </p>
            </>
          )}
        </section>

        <Link href="/" className="ct-secondary w-full">
          진료정보 찾기로 돌아가기
        </Link>
      </main>
    </>
  );
}
