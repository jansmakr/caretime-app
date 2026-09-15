import type { HospitalLiveStatus } from "@/features/hospitals/types";
import { formatKstClock } from "@/lib/kst";

/**
 * Release Blocker 2번 — "오래된 병원상태가 현재정보처럼 표시됨" — 을 막는 단일 지점.
 *
 * 만료 처리를 스케줄러(pg_cron)에만 맡기지 않는다. 크론이 한 번 실패하면
 * 그대로 블로커가 되기 때문이다. 읽는 순간마다 여기서 판정한다.
 * 스케줄러는 나중에 '정리'용으로만 붙인다.
 */

export type Freshness =
  | { level: "fresh"; minutesAgo: number }
  | { level: "aging"; minutesAgo: number }
  | { level: "recheck"; minutesAgo: number };

/** config 로 뺄 값. 운영 데이터를 보고 조정한다. */
export const FRESHNESS_CONFIG = {
  freshMinutes: 60,
  agingMinutes: 180,
} as const;

export function minutesSince(iso: string, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60000));
}

export function getFreshness(verifiedAt: string, now: Date = new Date()): Freshness {
  const minutesAgo = minutesSince(verifiedAt, now);
  if (minutesAgo <= FRESHNESS_CONFIG.freshMinutes) return { level: "fresh", minutesAgo };
  if (minutesAgo <= FRESHNESS_CONFIG.agingMinutes) return { level: "aging", minutesAgo };
  return { level: "recheck", minutesAgo };
}

/** 만료된 상태는 조회 시점에서 걸러낸다. DB 쿼리에서도 동일 조건을 건다. */
export function isExpired(status: HospitalLiveStatus, now: Date = new Date()): boolean {
  return new Date(status.expiresAt).getTime() <= now.getTime();
}

/**
 * 사용자에게 보여줄 상태 문구.
 * 재개 예정 시각이 지났다고 '진료 가능'으로 바꾸지 않는다. (기획안 18항)
 */
export function describeStatus(
  status: HospitalLiveStatus | null,
  now: Date = new Date(),
): { tone: "confirmed" | "caution" | "limited" | "unverified"; text: string } {
  if (!status || isExpired(status, now)) {
    return { tone: "unverified", text: "현재 상태 확인 필요" };
  }

  const resumePassed =
    status.expectedResumeAt !== null &&
    new Date(status.expectedResumeAt).getTime() <= now.getTime();

  if (resumePassed) {
    return { tone: "caution", text: "재개 예정 시각 지남 · 재확인 필요" };
  }

  switch (status.status) {
    case "normal":
      return { tone: "confirmed", text: "확인 당시 진료 가능" };
    case "partial":
      return { tone: "caution", text: "일부 제한" };
    case "paused":
      return { tone: "limited", text: "일시 중단" };
    case "difficult":
      return { tone: "limited", text: "현재 어려움" };
  }
}

/** "22:30 진료 가능" 처럼 확정적으로 쓰지 않는다. (기획안 18항) */
export function describeTimePlan(status: HospitalLiveStatus | null): string | null {
  if (!status) return null;
  if (status.expectedResumeAt) return `${formatClock(status.expectedResumeAt)} 이후 재개 예정`;
  if (status.recheckAt) return `${formatClock(status.recheckAt)} 재확인 예정`;
  return null;
}

/** KST 기준. 서버(UTC)에서 렌더해도 브라우저와 같은 시각이 나온다. */
export function formatClock(iso: string): string {
  return formatKstClock(iso);
}

export function formatAgo(minutesAgo: number): string {
  if (minutesAgo < 1) return "방금";
  if (minutesAgo < 60) return `${minutesAgo}분 전`;
  const h = Math.floor(minutesAgo / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}
