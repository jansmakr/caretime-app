import Link from "next/link";
import { EmergencyCallout } from "@/components/common/EmergencyCallout";
import { PartnerCta } from "@/components/common/PartnerCta";

export function AppHeader({ title, backHref }: { title?: string; backHref?: string }) {
  return (
    <header className="sticky top-0 z-40 bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-app items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-1">
          {backHref && (
            <Link
              href={backHref}
              aria-label="뒤로"
              className="-ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink active:bg-fill"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          )}
          {title ? (
            <h1 className="truncate text-[18px] font-bold">{title}</h1>
          ) : (
            <Link href="/" className="flex items-center gap-1.5 text-[20px] font-extrabold tracking-tight">
              <span className="h-2.5 w-2.5 rounded-full bg-blue" aria-hidden />
              CareTime
            </Link>
          )}
        </div>
        {/* 오른쪽 묶음: 참여 CTA → 119. 119 가 항상 가장 바깥(엄지에 가까운 쪽)이다. */}
        <div className="flex shrink-0 items-center gap-2">
          <PartnerCta />
          <EmergencyCallout />
        </div>
      </div>
    </header>
  );
}
