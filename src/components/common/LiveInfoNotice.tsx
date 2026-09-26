import { USER_REPORT_DISCLAIMER } from "@/lib/copy";

/**
 * 실시간 제보 유의사항 배너 (공통).
 *
 * 보호자 자율 공유 데이터의 면책과 "의료기관 현장 상황 우선" 원칙을 고지한다.
 * 제보를 읽는 자리와 쓰는 자리 양쪽에 고정 노출한다. 접어서 숨기는 UI 를 만들지 않는다.
 * 문구는 lib/copy.ts 한 곳에만 있다.
 *
 * compact: 같은 화면에서 두 번째로 나올 때(작성 폼 상단). 문구는 동일하고 여백만 줄인다.
 */
export function LiveInfoNotice({ compact = false }: { compact?: boolean }) {
  return (
    <p
      role="note"
      className={`rounded-field border border-amber-200 bg-amber-50 leading-relaxed text-amber-900 ${
        compact ? "px-3.5 py-2.5 text-[12.5px]" : "px-4 py-3 text-[13px]"
      }`}
    >
      <span className="mr-1.5 font-bold" aria-hidden>
        유의
      </span>
      {USER_REPORT_DISCLAIMER}
    </p>
  );
}
