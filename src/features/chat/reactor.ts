/**
 * 이 브라우저를 가리키는 값.
 *
 * 같은 사람이 같은 글의 같은 반응을 두 번 세지 않기 위한 것뿐이다. **인증 수단이 아니다** —
 * 지우면 다시 누를 수 있고, 다른 사람이 흉내 낼 수도 있다. 그 이상을 이 값에 기대지 않는다.
 * 서버 게스트 세션(다음 턴)이 생기면 그 id 로 바뀐다.
 *
 * 개인정보를 담지 않는다. 무작위 값이고 어디에도 이름·기기 정보를 섞지 않는다.
 */

const KEY = "caretime.chat.reactor.v1";

function randomKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `r_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function loadReactorKey(): string {
  if (typeof window === "undefined") return randomKey();
  try {
    const stored = window.localStorage.getItem(KEY);
    if (stored && stored.length >= 8) return stored;
    const created = randomKey();
    window.localStorage.setItem(KEY, created);
    return created;
  } catch {
    // 사생활 보호 모드 등으로 저장이 막힌 경우. 이번 세션에서만 쓰는 값으로 돈다.
    return randomKey();
  }
}
