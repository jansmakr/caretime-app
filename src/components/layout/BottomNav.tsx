"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** 하단 메뉴는 정확히 3개. 병원·관리자 기능은 여기에 넣지 않는다. (기획안 5항) */
const ITEMS = [
  { href: "/", label: "찾기" },
  { href: "/live", label: "실시간" },
  { href: "/more", label: "더보기" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 bg-surface shadow-bar">
      <ul className="mx-auto flex max-w-app">
        {ITEMS.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" || pathname === "/search" : pathname.startsWith(item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-[58px] items-center justify-center text-[14px] ${
                  active ? "font-semibold text-blue" : "text-ink-muted"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
