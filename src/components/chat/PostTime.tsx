import { formatPostTime, postAgeDays } from "@/features/chat/age";

/**
 * 글·답글의 시간 한 줄. "3일 전 · 10/23 21:40" (서울 시간).
 *
 * ── 색으로 나이를 가른다 ────────────────────────────────────
 *   · 24시간 안 — 진한 회색(ink-muted). 지금 상황일 수 있는 글이다
 *   · 24시간 지남 — 옅은 회색(ink-faint, 흰 바탕 대비 5.6:1). 읽히되 한 발 물러난다
 *   · 30일 지남 — 주의 색 굵게. 글을 지우지 않고 쌓으므로 병원이 바뀌었을 수 있다는
 *     신호다(features/chat/age). 옅게 하면 가장 오래된 글이 가장 안 보이게 된다
 *
 * 줄이 길어져 카드가 복잡해지지 않게 **한 줄로 묶는다**(whitespace-nowrap).
 * 스크린리더에는 "10/23" 대신 "2026년 10월 23일 오후 9시 40분, 3일 전"을 읽힌다.
 */
export function PostTime({ createdAt, now }: { createdAt: string; now: Date }) {
  const time = formatPostTime(createdAt, now);
  if (time === null) return null;

  const tone =
    postAgeDays(createdAt, now) >= 30
      ? "font-bold text-caution-ink"
      : time.stale
        ? "font-normal text-ink-faint"
        : "font-semibold text-ink-muted";

  return (
    <time dateTime={time.iso} className={`whitespace-nowrap text-[14px] ${tone}`}>
      <span aria-hidden="true">{time.text}</span>
      <span className="sr-only">{time.spoken}</span>
    </time>
  );
}
