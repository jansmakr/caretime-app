import Link from "next/link";
import { AppHeader } from "@/components/layout/AppHeader";
import { LEGAL_DOC_PATH, loadLegalDocument } from "@/features/legal/documents";

/** 방침 파일을 읽으므로 정적 생성하지 않는다. */
export const dynamic = "force-dynamic";

/**
 * 더보기.
 *
 * 약관·방침은 **준비되지 않아도 줄을 둔다.** 여기서는 "아직 없다"는 사실까지 적는
 * 것이 맞다 — 찾으러 온 사람에게 아무 줄도 안 보이면 어디에 있는지 계속 찾는다.
 * 본문이 없는 동안에는 링크로 만들지 않고 '준비 중'으로 둔다.
 *
 * 1차에는 참여 병원이 0곳이라 의료기관 등록 줄도 '준비 중'이다. (lib/demoContent)
 */
export default function MorePage() {
  const legal = (["terms", "privacy"] as const).map((id) => {
    const doc = loadLegalDocument(id);
    return {
      href: LEGAL_DOC_PATH[id],
      label: doc.title || (id === "terms" ? "이용약관" : "개인정보 처리방침"),
      ready: doc.ready,
      note: doc.ready ? `시행 ${doc.effectiveDate}` : "준비 중",
    };
  });

  return (
    <>
      <AppHeader title="더보기" />
      <main className="space-y-3 px-4 pb-6 pt-3">
        <ul className="ct-card divide-y divide-fill overflow-hidden">
          {legal.map((item) =>
            item.ready ? (
              <li key={item.href}>
                <Link href={item.href} className="flex items-center justify-between px-5 py-4 active:bg-fill">
                  <span className="text-[16px] font-medium">{item.label}</span>
                  <span className="text-[12.5px] font-semibold text-ink-faint">{item.note} ›</span>
                </Link>
              </li>
            ) : (
              <li key={item.href} className="flex items-center justify-between px-5 py-4">
                <span className="text-[16px] font-medium text-ink-muted">{item.label}</span>
                <span className="rounded-pill bg-fill px-2.5 py-1 text-[12px] font-semibold text-ink-faint">
                  {item.note}
                </span>
              </li>
            ),
          )}
          <li className="flex items-center justify-between px-5 py-4">
            <span className="text-[16px] font-medium text-ink-muted">의료기관 정보 등록</span>
            <span className="rounded-pill bg-fill px-2.5 py-1 text-[12px] font-semibold text-ink-faint">
              준비 중
            </span>
          </li>
        </ul>

        <section className="ct-card p-5">
          <h2 className="ct-section-title">CareTime 참여 의료기관 안내</h2>
          <p className="mt-2 text-[14.5px] leading-relaxed text-ink-muted">
            참여 의료기관은 환자와 보호자의 편의를 위해 진료정보와 현재 상황을 공유해 주고
            있습니다. 의료진 상황, 응급환자 발생, 수술·처치, 대기환자 증가 등으로 실제
            진료상황은 언제든 달라질 수 있습니다. 예상과 다른 상황이 생기더라도 서로 배려하는
            마음으로 이용해 주세요.
          </p>
        </section>

        <Link href="/" className="ct-secondary w-full">
          진료정보 찾기로 돌아가기
        </Link>
      </main>
    </>
  );
}
