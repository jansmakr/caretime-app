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
 * 이동 경로는 화면 안에 있다: 홈의 주 버튼 → 현장톡, 현장톡 아래 '홈으로'
 * → 홈, 헤더의 뒤로 버튼, 푸터의 약관·방침 링크. /more 라우트는 남겨 둔다.
 *
 * ── 푸터를 여기서 뺐다 (2026-10-06) ────────────────────────
 * 전에는 모든 보호자 화면 아래에 사업자 정보 4줄 + 약관·방침 줄이 붙었다. 둘을
 * 갈랐다.
 *   · 사업자 정보 → /more 로 옮겼다(components/legal/CompanyInfo). 전자상거래법의
 *     초기화면 표시 의무는 파는 곳에 걸리고, 우리는 팔지 않는다.
 *   · 약관·방침 한 줄 → **홈에만** 둔다(LegalFooter). 개인정보보호법 제30조 2항의
 *     "쉽게 확인할 수 있도록"은 첫 화면 링크를 뜻한다. 메뉴 안으로만 옮기면 두 번
 *     들어가게 된다.
 * 다른 화면에서는 머리띠의 "더보기"가 길을 준다.
 */
export default function ConsumerLayout({ children }: { children: React.ReactNode }) {
  return (
    <SearchSessionProvider>
      <DiscoveryProvider>
        <div className="mx-auto min-h-dvh max-w-app pb-[calc(16px+env(safe-area-inset-bottom))]">
          {children}
        </div>
      </DiscoveryProvider>
    </SearchSessionProvider>
  );
}
