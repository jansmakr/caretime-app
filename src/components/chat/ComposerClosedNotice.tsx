/**
 * 작성창이 닫혀 있을 때의 안내.
 *
 * 지금은 열려 있다(lib/demoContent.isFieldTalkSharingLive). 플래그를 내리면 이쪽이
 * 나온다 — 장애 때 읽기는 두고 쓰기만 닫는 경로다.
 *
 * /chat 과 병원 상세가 같은 문구를 쓴다. 한쪽만 고쳐서 "준비 중"과 작성창이 같은 날
 * 다른 화면에 뜨는 일을 막는다.
 */
export function ComposerClosedNotice() {
  return (
    <section className="ct-card p-5">
      <h2 className="ct-section-title">현장 상황 남기기</h2>
      <p className="mt-2 rounded-field border border-amber-200 bg-amber-50 px-3.5 py-3 text-[13.5px] leading-relaxed text-amber-900">
        <span className="mr-1.5 font-bold">준비 중</span>
        제보 작성과 공유 기능을 준비하고 있습니다. 아직 다른 분들에게 전달되지 않아 작성창을
        열어 두지 않았습니다. 지금 상황은 병원에 전화로 확인해 주세요.
      </p>
    </section>
  );
}
