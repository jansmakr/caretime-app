/**
 * 현장톡의 "글쓰기" 버튼. **작성창은 접혀 있고, 이 버튼을 누르면 펼쳐진다.**
 *
 * 작성창이 펼쳐져 있으면 360px 첫 화면을 입력칸·음성·지역 줄이 차지해서
 * 올라온 글이 한 줄도 안 보였다(2026-10-26 결정). 들어온 사람이 먼저 보려는 것은
 * 글이고, 쓰려는 사람은 한 번 누르면 된다(원칙 1·4).
 *
 * 펼친 뒤의 작성창은 그대로다 — 올리기 전 확인 시트, 119 확인 창, 지역 고르기 모두
 * ChatComposer 안에 있고 바뀌지 않는다. 답글 입력(ChatBubble)은 이 버튼과 무관하다.
 *
 * 빈 방에서도 접어 둔다. 바로 위 안내(EmptyRoomLead)가 "한 줄만 남겨 주세요"라고
 * 말하고, 이 버튼이 그 화면의 결정 하나다.
 */
export function ComposeOpenButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} aria-expanded={false} className="ct-primary">
      글쓰기
    </button>
  );
}
