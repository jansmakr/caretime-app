import { minutesSince } from "./freshness";

/**
 * 사용자 공유 정보(제보 · 현장톡)의 상대시각 단일 지점.
 *
 * freshness.ts 의 formatAgo 는 "방금 / 12분 전" 처럼 확인시각 배지용 표기다.
 * 글이 올라온 시각은 문장으로 읽히므로 "방금 전"까지 붙인다.
 * 두 화면이 같은 문구를 쓰게 여기 하나만 둔다.
 */
export function formatMomentAgo(createdAt: string, now: Date = new Date()): string {
  const minutes = minutesSince(createdAt, now);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}
