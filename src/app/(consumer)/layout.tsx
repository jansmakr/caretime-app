import { LegalFooter } from "@/components/legal/LegalFooter";
import { SearchSessionProvider } from "@/features/search-session/SearchSessionProvider";
import { DiscoveryProvider } from "@/features/discovery/DiscoveryProvider";

/**
 * 보호자 화면 레이아웃.
 * Search Session(건강정보)은 이 그룹 안에서만 존재한다. /partner 에는 전달되지 않는다.
 *
 * 하단 고정 메뉴를 지웠다(2026-10-06). 1차의 화면은 홈과 현장톡 둘이고, 메뉴 셋 중
 * '찾기'는 닫힌 화면(404)을 가리켰고, '현장톡'은 거의 항상 현재 위치였고, '더보기'의
 * 내용(약관·방침)은 이미 모든 화면 푸터에 있다. 남는 것이 하나면 메뉴가 아니다 —
 * 그리고 고정 바는 급한 사람이 읽을 화면을 60px 깎는다(원칙 4·10).
 *
 * 이동 경로는 화면 안에 있다: 홈의 주 버튼 → 현장톡, 현장톡 아래 '진료정보 찾기'
 * → 홈, 헤더의 뒤로 버튼, 푸터의 약관·방침 링크. /more 라우트는 남겨 둔다.
 *
 * 사업자 정보와 약관·방침 링크는 여기 한 곳에 둔다. 화면마다 붙이면 어느 화면에는
 * 없게 된다 — 글을 쓸 수 있는 화면이 셋이고 앞으로 늘어난다. 사업자 정보는 항상
 * 보이고, 약관·방침 링크는 문서가 준비된 뒤에 보인다(LegalFooter).
 */
export default function ConsumerLayout({ children }: { children: React.ReactNode }) {
  return (
    <SearchSessionProvider>
      <DiscoveryProvider>
        <div className="mx-auto min-h-dvh max-w-app pb-[calc(16px+env(safe-area-inset-bottom))]">
          {children}
          <LegalFooter />
        </div>
      </DiscoveryProvider>
    </SearchSessionProvider>
  );
}
