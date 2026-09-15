import Link from "next/link";
import { EmergencyCallout } from "@/components/common/EmergencyCallout";

export function AppHeader({ title, backHref }: { title?: string; backHref?: string }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface">
      <div className="mx-auto flex h-14 max-w-app items-center justify-between px-4">
        <div className="flex min-w-0 items-center gap-2">
          {backHref && (
            <Link
              href={backHref}
              aria-label="뒤로"
              className="-ml-1 flex h-8 w-8 items-center justify-center text-ink-muted"
            >
              ‹
            </Link>
          )}
          {title ? (
            <h1 className="truncate text-[17px] font-semibold">{title}</h1>
          ) : (
            <Link href="/" className="text-[19px] font-bold tracking-tight text-blue">
              CareTime
            </Link>
          )}
        </div>
        <EmergencyCallout />
      </div>
    </header>
  );
}
