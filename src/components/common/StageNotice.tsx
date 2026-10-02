import { CALL_IS_SUREST } from "@/lib/copy";
import { isBeta, isDemoContentAllowed } from "@/lib/demoContent";

/**
 * 화면 맨 위 단계 안내. **자리는 하나다.**
 *
 * 전에는 DEMO 배너만 있었다. 그 자리를 그대로 쓰고, 무엇을 말할지만 단계에 따라
 * 고른다 — 새 자리를 만들면 안내가 둘이 되고, 급한 사람이 읽어야 하는 줄이 늘어난다.
 *
 *   ① 가짜 데이터를 낼 수 있는 환경 → DEMO. 가장 급한 경고다.
 *   ② 그 밖에 베타 운영 중        → 베타 안내.
 *   ③ 둘 다 아니면              → 아무것도 그리지 않는다.
 *
 * 로컬 개발에서는 ①이 먼저다(둘 다 켜져 있다). 베타 문구를 눈으로 확인하려면
 * 운영 빌드로 띄운다 — 거기서는 DEMO 가 꺼진다.
 *
 * ── 베타 문구에 넣지 않는 것 ────────────────────────────────
 * "베타라서 책임지지 않는다" 류를 쓰지 않는다. 효력이 없고 신뢰만 깎는다.
 * 그 일은 약관이 한다. 여기서는 사실 셋만 말한다 — 베타다 / 등록된 곳이 아직 적다 /
 * 확실하지 않으면 전화가 가장 정확하다.
 *
 * 전화 문구는 lib/copy 의 상수를 읽는다. 같은 말을 두 곳에 적으면 갈라진다.
 */
export function StageNotice() {
  if (isDemoContentAllowed) {
    return (
      <Slot tone="caution">
        <Badge tone="caution">DEMO</Badge>
        표시된 의료기관과 상태는 모두 가상 데이터이며 실제 진료정보가 아닙니다.
      </Slot>
    );
  }

  if (isBeta) {
    return (
      <Slot tone="quiet">
        <Badge tone="quiet">베타</Badge>
        베타로 운영 중입니다. 등록된 의료기관이 아직 적습니다. {CALL_IS_SUREST}
      </Slot>
    );
  }

  return null;
}

function Slot({ tone, children }: { tone: "caution" | "quiet"; children: React.ReactNode }) {
  return (
    <div className="px-4 pt-1">
      <p
        className={`flex items-start gap-2 rounded-field px-3.5 py-2.5 text-[12.5px] leading-snug ${
          tone === "caution" ? "bg-caution-soft text-caution-ink" : "bg-fill text-ink-muted"
        }`}
      >
        {children}
      </p>
    </div>
  );
}

function Badge({ tone, children }: { tone: "caution" | "quiet"; children: React.ReactNode }) {
  return (
    <span
      className={`mt-px shrink-0 rounded-md px-1.5 py-px text-[10.5px] font-bold tracking-wide ${
        tone === "caution" ? "bg-caution text-white" : "bg-ink-muted text-white"
      }`}
    >
      {children}
    </span>
  );
}
