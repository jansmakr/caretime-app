import { AppHeader } from "@/components/layout/AppHeader";

export default function LivePage() {
  return (
    <>
      <AppHeader title="실시간" />
      <main className="px-4 pt-10">
        <div className="ct-card px-6 py-10 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-soft text-blue" aria-hidden>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M3 12h4l2.5-6 5 12 2.5-6H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="mt-4 text-[18px] font-bold">실시간 정보 공유는 5단계에서 열립니다.</p>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">
            보호자가 남긴 현장 정보는 의료기관의 공식 정보와 분리해서 보여줄 예정입니다.
          </p>
        </div>
      </main>
    </>
  );
}
