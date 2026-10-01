import { isDemoContentAllowed } from "@/lib/demoContent";

/**
 * Mock 정책: 개발 단계 데이터를 실제 연동처럼 보이게 하면 안 된다.
 *
 * **반대도 성립한다 — 실제 데이터를 가상이라고 말하면 안 된다.**
 * 강서구 달빛어린이병원을 넣은 뒤에도 이 배너가 "모두 가상 데이터"라고 말하고 있었다.
 * 그건 첫 작성자에게 "여기 쓰는 것도 가짜"로 읽히고, 쓸 이유를 없앤다.
 *
 * 그래서 판정을 lib/demoContent 에 맡긴다. 가짜 데이터를 낼 수 있는 환경에서만 붙는다.
 * 운영에서는 그 플래그가 꺼져 있으므로 배너가 없다.
 *
 * 배너를 떼는 조건은 플래그 하나가 아니다 — 그 플래그를 끌 수 있으려면
 * 화면에 나가는 병원이 전부 실제 데이터여야 한다(docs/LAUNCH-checklist.md).
 */
export function DemoNotice() {
  if (!isDemoContentAllowed) return null;

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
