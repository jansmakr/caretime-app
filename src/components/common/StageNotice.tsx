import { CALL_IS_SUREST } from "@/lib/copy";
import { isBeta, isDemoContentAllowed } from "@/lib/demoContent";

/**
 * 화면 맨 위 단계 안내. **자리는 하나다.**
 *
 * 전에는 DEMO 배너만 있었다. 그 자리를 그대로 쓰고, 무엇을 말할지만 단계에 따라
 * 고른다 — 새 자리를 만들면 안내가 둘이 되고, 급한 사람이 읽어야 하는 줄이 늘어난다.
 *
 * 베타면 베타 안내, 아니면 아무것도 그리지 않는다.
 *
 * 전에는 가짜 데이터가 켜진 환경에서 "표시된 의료기관과 상태는 모두 가상
 * 데이터입니다"로 이 자리를 덮었다. 병원 목록을 1차에서 내린 뒤로 **표시되는
 * 의료기관이 없어서 그 문장이 거짓**이 됐고, 첫 작성자는 그것을 "여기 쓰는 것도
 * 가짜"로 읽는다. 그래서 자리는 베타 안내가 쓰고, 가짜 데이터 사실은 꼬리말로만
 * 붙인다(개발 환경에서만).
 *
 * ── 베타 문구에 넣지 않는 것 ────────────────────────────────
 * "베타라서 책임지지 않는다" 류를 쓰지 않는다. 효력이 없고 신뢰만 깎는다.
 * 그 일은 약관이 한다. 여기서는 사실 셋만 말한다 — 베타다 / 등록된 곳이 아직 적다 /
 * 확실하지 않으면 전화가 가장 정확하다.
 *
 * 전화 문구는 lib/copy 의 상수를 읽는다. 같은 말을 두 곳에 적으면 갈라진다.
 */
export function StageNotice() {
  if (!isBeta) return null;

  return (
    <Slot>
      <Badge>베타</Badge>
      <span>
        베타로 운영 중입니다. 등록된 의료기관이 아직 적습니다. {CALL_IS_SUREST}
        {/*
          가짜 데이터가 켜진 환경(개발)에서만 붙는 꼬리말. 운영에서는 나오지 않는다.
          여기를 통째로 "모두 가상 데이터"로 덮지 않는다 — 병원 목록을 내린 뒤로는
          화면에 표시되는 의료기관이 없어서 그 문장이 거짓이고, 첫 작성자가
          "여기 쓰는 것도 가짜"로 읽는다. 같은 이유로 전에 한 번 고친 자리다.
        */}
        {isDemoContentAllowed && " (개발 환경 — 목록에 가상 글이 섞입니다)"}
      </span>
    </Slot>
  );
}

function Slot({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pt-1">
      <p className="flex items-start gap-2 rounded-field bg-fill px-3.5 py-2.5 text-[12.5px] leading-snug text-ink-muted">
        {children}
      </p>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="mt-px shrink-0 rounded-md bg-ink-muted px-1.5 py-px text-[10.5px] font-bold tracking-wide text-white">
      {children}
    </span>
  );
}
