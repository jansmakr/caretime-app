import { checkRate, type GuestLimits, type LimitedAction, type RateCheckResult } from "./limits";

/**
 * 서버 메모리에서 세는 제한. **DB 에 행을 남기지 않는 요청**(읽기)에만 쓴다.
 *
 * 쓰기 제한은 저장된 행의 created_at 으로 센다. 읽기는 남는 행이 없으므로 그 방법을
 * 못 쓴다. 읽기 기록을 표로 남기면 셀 수는 있지만, 그건 **새로 보관하는 개인 활동 기록**이다
 * (CLAUDE.md: 그때는 멈추고 묻는다). 그래서 메모리에서 센다.
 *
 * 한계: 서버 인스턴스마다 따로 센다. 인스턴스가 여럿이면 한 사람이 그 수만큼 더 읽을 수
 * 있고, 재시작하면 처음부터 센다. 돌려주는 것이 "그 사람 본인이 누른 반응"뿐이라
 * 이 정도로 둔다 — 긁어 가도 남의 정보가 나오지 않는다.
 *
 * 키는 게스트 세션 id 다. IP 를 쓰지 않는다(수집하지 않기로 한 값이다).
 */

/** 기억하는 주체 수. 넘치면 가장 오래 안 쓴 것부터 버린다 — 메모리가 끝없이 늘지 않게. */
export const MEMORY_RATE_MAX_KEYS = 5_000;

export interface MemoryRateBucket {
  /** 주체 → 최근에 허용된 요청 시각(ms). Map 의 순서가 곧 최근 사용 순서다. */
  hits: Map<string, number[]>;
}

export function createMemoryRateBucket(): MemoryRateBucket {
  return { hits: new Map() };
}

/** 허용되면 한 건을 센다. 막히면 세지 않는다 — 막힌 요청이 창을 늘리지 않게. */
export function takeMemorySlot(input: {
  bucket: MemoryRateBucket;
  key: string;
  action: LimitedAction;
  limits: GuestLimits;
  now: number;
}): RateCheckResult {
  const { bucket, key, action, limits, now } = input;
  const longest = Math.max(...limits[action].map((rule) => rule.windowMs));
  const recent = (bucket.hits.get(key) ?? []).filter((t) => t > now - longest);

  const verdict = checkRate({ action, limits, recentTimestamps: recent, now });
  if (verdict.allowed) recent.push(now);

  bucket.hits.delete(key);
  bucket.hits.set(key, recent);
  while (bucket.hits.size > MEMORY_RATE_MAX_KEYS) {
    const oldest = bucket.hits.keys().next().value;
    if (oldest === undefined) break;
    bucket.hits.delete(oldest);
  }
  return verdict;
}
