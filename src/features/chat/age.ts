import { formatMomentAgo } from "@/lib/relativeTime";

/**
 * 글이 얼마나 오래됐는가.
 *
 * 글을 지우지 않고 쌓는다(migration 20261007). 그래서 목록에 2년 전 글이 섞이고,
 * **병원이 진료시간을 바꾸면 그 글은 거짓이 된다.** 우리가 할 수 있는 것은 지우는
 * 것도 고치는 것도 아니라 **언제 쓴 글인지 분명히 보여주는 것**이다.
 *
 * "3분 전"은 최근 글에 쓸모 있고, 오래된 글에는 "2년 전"보다 날짜가 낫다 —
 * 2024년 3월이라고 적혀 있으면 읽는 사람이 그 사이에 무엇이 바뀌었을지 스스로 센다.
 */

const DAY_MS = 24 * 60 * 60_000;

export function postAgeDays(createdAt: string, now: Date): number {
  const written = Date.parse(createdAt);
  if (Number.isNaN(written)) return 0;
  return Math.max(0, Math.floor((now.getTime() - written) / DAY_MS));
}

/* ────────────────────────────────────────────────────────────
 * 글 카드·답글의 시간 한 줄 (2026-10-26)
 * ──────────────────────────────────────────────────────────── */


const HOUR_MS = 60 * 60_000;

/** 서울 시간의 연·월·일·시·분. 서버(UTC)와 브라우저가 같은 글자를 그리게 시간대를 고정한다. */
function seoulParts(date: Date): { y: number; mo: number; d: number; h: number; mi: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { y: get("year"), mo: get("month"), d: get("day"), h: get("hour"), mi: get("minute") };
}

const pad = (n: number) => String(n).padStart(2, "0");

export interface PostTime {
  /** 화면에 보이는 한 줄. "10분 전 · 오후 5:12" · "3일 전 · 10/23 21:40" */
  text: string;
  /** 스크린리더가 읽는 문장. "2026년 10월 23일 오후 9시 40분, 3일 전" */
  spoken: string;
  /** <time dateTime>. ISO 그대로. */
  iso: string;
  /** 24시간이 지났는가. 지났으면 시간 글자를 옅게 그린다. */
  stale: boolean;
}

/**
 * "상대 시간 · 정확한 시각". **서울 시간 기준.**
 *
 * 상대 시간만 있으면 "3일 전"이 어느 밤인지 셈해야 하고, 정확한 시각만 있으면
 * 얼마나 지났는지 셈해야 한다. 둘을 한 줄에 두면 셈이 없다(원칙 5).
 * 오늘 글은 "오후 5:12", 그 밖은 "10/23 21:40", 해가 다르면 "2025/10/23 21:40".
 */
export function formatPostTime(createdAt: string, now: Date): PostTime | null {
  const written = new Date(createdAt);
  if (Number.isNaN(written.getTime())) return null;

  const w = seoulParts(written);
  const n = seoulParts(now);
  const sameDay = w.y === n.y && w.mo === n.mo && w.d === n.d;
  const half = w.h < 12 ? "오전" : "오후";
  const h12 = w.h % 12 === 0 ? 12 : w.h % 12;

  const exact = sameDay
    ? `${half} ${h12}:${pad(w.mi)}`
    : `${w.y === n.y ? "" : `${w.y}/`}${w.mo}/${w.d} ${pad(w.h)}:${pad(w.mi)}`;
  const relative = formatMomentAgo(createdAt, now);

  return {
    text: `${relative} · ${exact}`,
    spoken: `${w.y}년 ${w.mo}월 ${w.d}일 ${half} ${h12}시 ${w.mi}분, ${relative}`,
    iso: written.toISOString(),
    stale: now.getTime() - written.getTime() >= 24 * HOUR_MS,
  };
}

