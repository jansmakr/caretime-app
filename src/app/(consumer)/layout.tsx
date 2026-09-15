import { BottomNav } from "@/components/layout/BottomNav";
import { SearchSessionProvider } from "@/features/search-session/SearchSessionProvider";

/**
 * 보호자 화면 레이아웃.
 * Search Session(건강정보)은 이 그룹 안에서만 존재한다. /partner 에는 전달되지 않는다.
 */
export default function ConsumerLayout({ children }: { children: React.ReactNode }) {
  return (
    <SearchSessionProvider>
      <div className="mx-auto min-h-dvh max-w-app pb-[58px]">{children}</div>
      <BottomNav />
    </SearchSessionProvider>
  );
}
