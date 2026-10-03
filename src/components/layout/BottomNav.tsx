"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * 하단 메뉴는 보호자 기능만 둔다. 병원·관리자 기능은 여기에 넣지 않는다. (기획안 5항)
 *
 * 현장톡(/chat)을 더하면서 '실시간'(/live, 5단계 자리표시자)을 뺐다.
 * 두 항목이 같은 것을 가리켜 중복이었다. /live 경로는 살려 두고 /chat 으로 리다이렉트한다.
 * 규칙의 뜻은 "개수"가 아니라 "보호자 화면과 병원·관리자 화면을 섞지 않는다"이다.
 */
const ITEMS = [
  {
    href: "/",
    label: "찾기",
    icon: (
      <>
        <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" />
        <path d="M16 16l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </>
    ),
  },
  {
    href: "/chat",
    label: "현장톡",
    icon: (
      <path
        d="M20 12.5c0 3.6-3.6 6.5-8 6.5-.9 0-1.8-.1-2.6-.35L5 20.5l1.2-3.1C4.8 16.2 4 14.4 4 12.5 4 8.9 7.6 6 12 6s8 2.9 8 6.5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    href: "/more",
    label: "더보기",
    icon: (
      <>
        <circle cx="5.5" cy="12" r="1.6" fill="currentColor" />
        <circle cx="12" cy="12" r="1.6" fill="currentColor" />
        <circle cx="18.5" cy="12" r="1.6" fill="currentColor" />
      </>
    ),
  },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 bg-surface/90 pb-[env(safe-area-inset-bottom)] shadow-bar backdrop-blur-md">
      <ul className="mx-auto flex max-w-app">
        {ITEMS.map((item) => {
          const active =
            // /search 는 1차에 닫혀 있다(404). 활성 판정에서 뺀다.
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-[60px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors ${
                  active ? "text-ink" : "text-ink-faint"
                }`}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
                  {item.icon}
                </svg>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
