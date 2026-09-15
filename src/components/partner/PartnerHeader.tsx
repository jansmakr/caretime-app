"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePartner } from "@/features/partner/PartnerProvider";

/**
 * 파트너 전용 상단 헤더.
 * 보호자 하단 메뉴(BottomNav)와 섞이지 않도록 탭을 위에 둔다. (기획안 5항)
 * 119 버튼은 보호자 화면에만 있다. 병원 직원 화면에서는 오탭 위험만 늘린다.
 */
const TABS = [
  { href: "/partner", label: "오늘 상태" },
  { href: "/partner/incoming", label: "내원예정" },
  { href: "/partner/capabilities", label: "진료기능" },
];

export function PartnerHeader() {
  const pathname = usePathname();
  const { hospital } = usePartner();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface">
      <div className="mx-auto max-w-app px-4">
        <div className="flex h-12 items-center gap-2">
          <span className="shrink-0 rounded-pill bg-blue-soft px-2 py-0.5 text-[12px] font-semibold text-blue">
            파트너
          </span>
          <h1 className="truncate text-[16px] font-semibold">{hospital.publicData.name}</h1>
        </div>
        <nav aria-label="파트너 메뉴">
          <ul className="-mb-px flex">
            {TABS.map((tab) => {
              const active = pathname === tab.href;
              return (
                <li key={tab.href} className="flex-1">
                  <Link
                    href={tab.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex h-11 items-center justify-center border-b-2 text-[14px] ${
                      active
                        ? "border-blue font-semibold text-blue"
                        : "border-transparent text-ink-muted"
                    }`}
                  >
                    {tab.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}
