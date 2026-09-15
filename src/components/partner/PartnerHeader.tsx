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
  const { hospital, phase, source, signOut } = usePartner();
  const signedIn = source === "supabase" && (phase === "ready" || phase === "no_membership");

  return (
    <header className="sticky top-0 z-40 bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto max-w-app px-4">
        <div className="flex h-14 items-center gap-2">
          <span className="shrink-0 rounded-md bg-ink px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-white">
            PARTNER
          </span>
          <h1 className="min-w-0 flex-1 truncate text-[18px] font-bold">
            {hospital?.publicData.name ?? "CareTime"}
          </h1>
          {signedIn && (
            <button
              type="button"
              onClick={() => void signOut()}
              className="shrink-0 rounded-pill px-2.5 py-1.5 text-[13px] font-semibold text-ink-faint active:bg-surface"
            >
              로그아웃
            </button>
          )}
        </div>
        {phase === "ready" && (
          <nav aria-label="파트너 메뉴" className="pb-3">
            {/* 세그먼트 컨트롤: 보호자 화면의 하단 탭과 모양부터 다르게 둔다. */}
            <ul className="flex rounded-field bg-line/70 p-1">
              {TABS.map((tab) => {
                const active = pathname === tab.href;
                return (
                  <li key={tab.href} className="flex-1">
                    <Link
                      href={tab.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex h-9 items-center justify-center rounded-[10px] text-[14px] font-semibold transition ${
                        active ? "bg-surface text-ink" : "text-ink-faint"
                      }`}
                    >
                      {tab.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </div>
    </header>
  );
}
