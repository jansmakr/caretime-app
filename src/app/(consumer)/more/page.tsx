import Link from "next/link";
import { AppHeader } from "@/components/layout/AppHeader";

const ITEMS = [
  { label: "의료기관 정보 등록", note: "7단계" },
  { label: "서비스 안내", note: "1단계" },
  { label: "개인정보 처리방침", note: "2단계" },
];

export default function MorePage() {
  return (
    <>
      <AppHeader title="더보기" />
      <main className="px-4 py-5">
        <ul className="ct-card divide-y divide-line">
          {ITEMS.map((item) => (
            <li key={item.label} className="flex items-center justify-between px-4 py-4">
              <span className="text-[15px]">{item.label}</span>
              <span className="text-[13px] text-ink-faint">{item.note} 예정</span>
            </li>
          ))}
        </ul>

        <section className="ct-card mt-4 p-4">
          <h2 className="text-[15px] font-semibold">CareTime 참여 의료기관 안내</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
            참여 의료기관은 환자와 보호자의 편의를 위해 진료정보와 현재 상황을 공유해 주고
            있습니다. 의료진 상황, 응급환자 발생, 수술·처치, 대기환자 증가 등으로 실제
            진료상황은 언제든 달라질 수 있습니다. 예상과 다른 상황이 생기더라도 서로 배려하는
            마음으로 이용해 주세요.
          </p>
        </section>

        <Link href="/" className="ct-secondary mt-4">
          진료정보 찾기로 돌아가기
        </Link>
      </main>
    </>
  );
}
