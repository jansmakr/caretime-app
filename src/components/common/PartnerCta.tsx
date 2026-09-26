import Link from "next/link";

/**
 * 의료기관 무료 참여 CTA.
 *
 * 헤더 우측에서 119 버튼 바로 왼쪽에 놓인다. 119(빨강)와 색으로 구분되고,
 * 급한 상황에서 오탭해도 전화가 걸리지 않는 쪽(라우팅)이라 119 안쪽에 두지 않는다.
 * 보호자 화면에만 있다. /partner 는 PartnerHeader 를 쓰므로 여기서 다시 노출되지 않는다.
 */
export function PartnerCta() {
  return (
    <Link
      href="/partner"
      aria-label="의료기관 무료 참여 안내"
      className="flex shrink-0 items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1.5
                 text-xs font-semibold text-blue-700 shadow-sm transition-all
                 hover:bg-blue-100 active:scale-[0.97] active:bg-blue-100"
    >
      <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
        무료
      </span>
      <span className="whitespace-nowrap">의료기관 참여</span>
    </Link>
  );
}
