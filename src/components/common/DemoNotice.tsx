/**
 * Mock 정책(기획안 MOCK 정책): 개발 단계 데이터를 실제 연동처럼 보이게 하면 안 된다.
 * 실데이터 연동 전까지 이 배너를 끄지 않는다.
 */
export function DemoNotice() {
  return (
    <div className="px-4 pt-1">
      <p className="flex items-start gap-2 rounded-field bg-caution-soft px-3.5 py-2.5 text-[12.5px] leading-snug text-caution-ink">
        <span className="mt-px shrink-0 rounded-md bg-caution px-1.5 py-px text-[10.5px] font-bold tracking-wide text-white">
          DEMO
        </span>
        표시된 의료기관과 상태는 모두 가상 데이터이며 실제 진료정보가 아닙니다.
      </p>
    </div>
  );
}
