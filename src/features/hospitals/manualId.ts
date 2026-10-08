import { createHash } from "node:crypto";

/**
 * 손으로 넣은 병원의 id.
 *
 * registry_key 를 그대로 id 로 썼다가 404 가 났다. 키는 '강서구|강서푸른꿈성모어린이병원'
 * 이고 `|`·`:` 가 URL 경로를 왕복하지 못한다. /hospital/<id> 가 열리지 않으면 그 병원은
 * 목록에만 있고 들어갈 수 없다.
 *
 * 그래서 id 는 **URL 안전한 불투명 값**이다. 읽을 수 있을 필요가 없다 — hpid 도
 * 'A1100001' 처럼 불투명하고, 사람이 보는 것은 이름이다.
 *
 * registry_key 에서 결정적으로 만든다. 같은 병원을 다시 넣으면 같은 id 가 나오므로
 * upsert 가 새 행을 만들지 않는다. id 가 바뀌면 그 병원을 가리키던 현장톡 글이 끊긴다.
 *
 * 서버·스크립트 전용이다(node:crypto). 브라우저에서 부르지 않는다.
 */

/** 접두사를 남긴다 — DB 를 보는 사람이 공공데이터 id 와 구분할 수 있어야 한다. */
export const MANUAL_ID_PREFIX = "m";

export function manualHospitalId(registryKey: string): string {
  const digest = createHash("sha256").update(registryKey).digest("hex");
  // 12자면 충돌 확률이 실질적으로 0이다(한 지역 수천 곳 규모에서).
  return `${MANUAL_ID_PREFIX}${digest.slice(0, 12)}`;
}

/** URL 경로에 그대로 넣어도 되는가. 넣기 전에 확인한다. */
export function isUrlSafeId(id: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(id);
}
