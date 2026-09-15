import { AppHeader } from "@/components/layout/AppHeader";

export default function LivePage() {
  return (
    <>
      <AppHeader title="실시간" />
      <main className="px-4 py-10">
        <div className="ct-card p-6 text-center">
          <p className="text-[16px] font-semibold">실시간 정보 공유는 5단계에서 열립니다.</p>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
            보호자가 남긴 현장 정보는 의료기관의 공식 정보와 분리해서 보여줄 예정입니다.
          </p>
        </div>
      </main>
    </>
  );
}
