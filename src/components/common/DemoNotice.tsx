/**
 * Mock 정책(기획안 MOCK 정책): 개발 단계 데이터를 실제 연동처럼 보이게 하면 안 된다.
 * 실데이터 연동 전까지 이 배너를 끄지 않는다.
 */
export function DemoNotice() {
  return (
    <div className="border-b border-line bg-[#FFF8E8] px-4 py-2 text-[12px] leading-snug text-caution">
      데모 화면입니다. 표시된 의료기관과 상태는 모두 가상 데이터이며 실제 진료정보가 아닙니다.
    </div>
  );
}
