"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** 하단 메뉴는 정확히 3개. 병원·관리자 기능은 여기에 넣지 않는다. (기획안 5항) */
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
    href: "/live",
    label: "실시간",
    icon: (
      <path
        d="M3 12h4l2.5-6 5 12 2.5-6H21"
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
            item.href === "/" ? pathname === "/" || pathname === "/search" : pathname.startsWith(item.href);
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
