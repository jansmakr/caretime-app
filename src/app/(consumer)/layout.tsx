import { BottomNav } from "@/components/layout/BottomNav";
import { LegalFooter } from "@/components/legal/LegalFooter";
import { SearchSessionProvider } from "@/features/search-session/SearchSessionProvider";
import { DiscoveryProvider } from "@/features/discovery/DiscoveryProvider";

/**
 * 보호자 화면 레이아웃.
 * Search Session(건강정보)은 이 그룹 안에서만 존재한다. /partner 에는 전달되지 않는다.
 *
 * 약관·방침 링크는 여기 한 곳에 둔다. 화면마다 붙이면 어느 화면에는 없게 된다 —
 * 글을 쓸 수 있는 화면이 셋이고 앞으로 늘어난다. 문서가 준비되기 전에는 그려지지
 * 않는다(LegalFooter).
 */
export default function ConsumerLayout({ children }: { children: React.ReactNode }) {
  return (
    <SearchSessionProvider>
      <DiscoveryProvider>
        <div className="mx-auto min-h-dvh max-w-app pb-[calc(76px+env(safe-area-inset-bottom))]">
          {children}
          <LegalFooter />
        </div>
        <BottomNav />
      </DiscoveryProvider>
    </SearchSessionProvider>
  );
}
