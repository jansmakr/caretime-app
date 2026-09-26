/**
 * 로그인 없이 쓰는 익명 닉네임.
 *
 * 계정(카카오 로그인)은 6단계다. 그 전까지 보호자는 로그인 없이 바로 글을 남기고,
 * 같은 사람의 글은 닉네임으로만 묶인다. 브라우저에 한 번 만들어 두고 계속 쓴다.
 *
 * 지역 이름은 **실제로 아는 경우에만** 붙인다.
 *   '영등포지킴이' 같은 닉네임은 읽는 사람에게 "영등포에 있는 사람"으로 읽힌다.
 *   무작위로 지역을 붙이면 아무 근거 없는 지역 신뢰도를 만들어 낸다. CareTime 은
 *   출처를 구분해서 보여주는 서비스이므로, 모르는 값을 그럴듯하게 채우지 않는다.
 *   지역을 모를 때는 시간대 낱말('야간', '응급')을 쓴다.
 */

const STORAGE_KEY = "caretime.chat.nickname";

const ROLE_WORDS = ["지킴이", "맘", "아빠", "보호자", "이웃"] as const;
/** 지역을 모를 때 쓰는 앞말. 장소를 가리키지 않는 낱말만 둔다. */
const NEUTRAL_WORDS = ["야간", "응급", "심야", "새벽", "주말"] as const;

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/** regionHint 는 보호자가 직접 고른 지역(시/군/구 또는 시/도)일 때만 넘긴다. */
export function createNickname(regionHint: string | null): string {
  const head = regionHint && regionHint.trim() !== "" ? regionHint.trim() : pick(NEUTRAL_WORDS);
  return `${head}${pick(ROLE_WORDS)}`;
}

/** 저장소를 못 쓰는 환경(시크릿 모드 등)에서도 죽지 않는다. 그때는 메모리에만 남는다. */
export function loadStoredNickname(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeNickname(nickname: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, nickname);
  } catch {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, nickname);
    } catch {
      // 저장할 수 없으면 이번 세션 동안 메모리에만 둔다. (store 가 들고 있다)
    }
  }
}
