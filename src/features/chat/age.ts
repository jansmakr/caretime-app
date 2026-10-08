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

/**
 * 오래된 글의 날짜. 올해 글은 "3월 14일", 지난해 글은 "2025년 3월 14일".
 *
 * 연도를 늘 적지 않는 이유: 올해 글에 연도를 붙이면 읽을 글자가 늘어난다(원칙 4).
 * 해가 다르면 그때는 연도가 가장 중요한 정보다.
 */
export function formatPostDate(createdAt: string, now: Date): string {
  const written = new Date(createdAt);
  if (Number.isNaN(written.getTime())) return "";

  const month = written.getMonth() + 1;
  const day = written.getDate();
  const sameYear = written.getFullYear() === now.getFullYear();
  return sameYear
    ? `${month}월 ${day}일`
    : `${written.getFullYear()}년 ${month}월 ${day}일`;
}
