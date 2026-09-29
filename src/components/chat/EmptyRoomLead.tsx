/**
 * 아무도 없는 방에 처음 들어온 사람에게 보이는 안내.
 *
 * **출시 직후에는 반드시 0건이다.** 그때 "아직 올라온 글이 없습니다"만 적으면 사실은
 * 맞지만 아무 일도 일으키지 않는다. 첫 사용자는 그 문장을 읽고 화면을 닫는다 —
 * 막 시작한 방인지, 고장난 건지, 아무도 안 쓰는 방인지 구분할 수 없기 때문이다.
 *
 * 그래서 세 가지를 말한다.
 *   1. 비어 있는 이유 — 고장이 아니다
 *   2. 당신이 첫 번째다 — 뒤에 올 사람에게 도움이 된다
 *   3. 무엇을 쓰면 되는지 — 빈 칸을 보고 무엇을 적을지 모르는 것이 실제 장벽이다
 *
 * 가짜 글로 채우지 않는다. 그건 두 번 지웠다. 없는 것을 있는 것처럼 보이게 하는 대신,
 * 없다는 사실을 쓸 이유로 바꾼다.
 *
 * 화면은 원칙 1 을 따른다 — 이 화면의 결정은 "첫 글을 쓴다" 하나다. 그래서 여기에
 * 버튼을 두지 않는다. 바로 아래가 작성창이고, 버튼을 또 두면 결정이 둘이 된다.
 */
export function EmptyRoomLead() {
  return (
    <section className="ct-card p-5">
      <h2 className="text-[19px] font-bold leading-snug">
        아직 아무도 글을 남기지 않았어요
      </h2>

      <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">
        현장톡이 막 열렸습니다. 고장이 아니라 아직 첫 글이 올라오지 않은 것입니다.
      </p>

      <p className="mt-3 text-[16px] font-semibold leading-relaxed">
        지금 병원에 계신다면, 본 것을 한 줄만 남겨 주세요.
        <br />
        <span className="text-ink-muted">
          뒤에 오는 보호자가 헛걸음을 덜 합니다.
        </span>
      </p>

      {/*
        무엇을 쓰면 되는지 예를 든다. 아래 작성창의 템플릿 칩과 같은 종류다 —
        빈 칸을 보고 무엇을 적을지 모르는 것이 실제 장벽이라, 보기를 먼저 보여 준다.
        전부 "본 것"이다. 진단·평가·추천이 들어가지 않는다.
      */}
      <ul className="mt-4 space-y-2 rounded-field bg-fill px-4 py-3.5">
        {[
          "방금 접수했는데 앞에 3명 대기라고 해요",
          "지금 봉합 가능한지 물어보신 분 계신가요?",
          "화상 처치는 오늘 어렵다고 안내받았어요",
        ].map((example) => (
          <li key={example} className="text-[15px] leading-relaxed text-ink-muted">
            · {example}
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[14px] leading-relaxed text-ink-faint">
        로그인 없이 바로 올라갑니다. 이름·연락처는 저장하지 않습니다.
      </p>
    </section>
  );
}
