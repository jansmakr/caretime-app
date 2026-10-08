/**
 * 비회원 별명 (PRD §3.1).
 *
 * 형식: 허용목록 형용사 + 동물/자연명 + 무작위 4자리. 예 '차분한수달4821'.
 * **서버가 발급한다.** 클라이언트가 만든 이름을 그대로 받으면 금지어 검사를 우회할 수 있다.
 *
 * 금지: 의료인·병원·공식·관리자·실명을 암시하는 단어. 별명은 인증 수단이 아니다(§3.1 말미).
 *
 * 기존 `features/chat/nickname.ts` 와의 차이: 그쪽은 지역 이름을 붙였다(`강서구맘`).
 * PRD 는 지역을 쓰지 않는 허용목록 조합을 쓴다 — 지역명이 들어가면 그 지역에 있다는
 * 신호로 읽히는데, 별명은 그것을 보증하지 않는다. 두 파일을 합치는 시점은 P0 API 전환 때다.
 */

/**
 * ⏳ 아직 어디서도 import 되지 않는다. 지금 화면은 features/chat/nickname.ts 를 쓴다.
 *    게스트 세션 발급을 서버 API 로 옮기는 턴에 이쪽으로 갈아탄다(아래 '두 파일' 문단).
 */

/** 형용사. 상태·품질·감정 평가로 읽히지 않는 중립적인 낱말만 둔다. */
const ADJECTIVES = [
  "차분한",
  "조용한",
  "느긋한",
  "성실한",
  "다정한",
  "꼼꼼한",
  "부지런한",
  "든든한",
  "씩씩한",
  "슬기로운",
  "너그러운",
  "정다운",
] as const;

/** 동물·자연명. 사람·직업·기관을 가리키지 않는 낱말만 둔다. */
const NOUNS = [
  "수달",
  "다람쥐",
  "고래",
  "부엉이",
  "수리",
  "노루",
  "청솔",
  "미나리",
  "달맞이",
  "은하수",
  "물망초",
  "산들바람",
  "초승달",
  "잣나무",
] as const;

/**
 * 금지 낱말. 별명이 의료인·기관·운영자를 암시하면 그 글이 공식 안내로 읽힌다.
 * 부분 일치로 검사한다 — '김간호사', '○○병원직원' 같은 조합까지 걸러야 한다.
 */
const BANNED_FRAGMENTS = [
  "의사",
  "의료진",
  "간호",
  "원장",
  "전문의",
  "교수",
  "약사",
  "병원",
  "의원",
  "클리닉",
  "센터",
  "응급실",
  "보건소",
  "공식",
  "인증",
  "관리자",
  "운영",
  "운영자",
  "어드민",
  "admin",
  "케어타임",
  "caretime",
  "119",
  "닥터",
  "doctor",
  "nurse",
] as const;

export const NICKNAME_SUFFIX_DIGITS = 4;

export interface NicknameParts {
  adjective: string;
  noun: string;
  suffix: string;
}

/**
 * 난수 주입형. 서버에서는 crypto 난수를, 테스트에서는 고정 함수를 넣는다.
 * Math.random 을 기본값으로 두지만, 서버 발급 경로는 반드시 crypto 를 넘긴다.
 */
export type RandomSource = () => number;

function pick<T>(items: readonly T[], random: RandomSource): T {
  return items[Math.floor(random() * items.length) % items.length];
}

export function buildNickname(random: RandomSource = Math.random): string {
  const parts = buildNicknameParts(random);
  return `${parts.adjective}${parts.noun}${parts.suffix}`;
}

export function buildNicknameParts(random: RandomSource = Math.random): NicknameParts {
  const suffix = String(Math.floor(random() * 10_000)).padStart(NICKNAME_SUFFIX_DIGITS, "0");
  return { adjective: pick(ADJECTIVES, random), noun: pick(NOUNS, random), suffix };
}

export type NicknameRejection = "BANNED_WORD" | "NOT_ALLOWLISTED" | "BAD_SHAPE";

/**
 * 발급된 별명이 계약을 지키는지 확인한다.
 *
 * 허용목록 조합이 아니면 거절한다 — 자유 입력 별명을 받지 않기 위한 방어다.
 * 서버 발급값도 한 번 통과시켜, 목록에 금지어가 섞여 들어가는 실수를 잡는다.
 */
export function validateNickname(
  nickname: string,
): { ok: true } | { ok: false; code: NicknameRejection } {
  const trimmed = nickname.trim();
  const shape = new RegExp(`^(.+?)(\\d{${NICKNAME_SUFFIX_DIGITS}})$`).exec(trimmed);
  if (!shape) return { ok: false, code: "BAD_SHAPE" };

  const head = shape[1];

  /*
   * 금지어는 **낱말 부분만** 본다. 뒤의 4자리는 난수다.
   * 전체 문자열을 검사하면 '119'가 들어간 suffix('차분한수달1190')가 금지어로 걸린다 —
   * 서버가 정상 발급한 별명이 검증에서 거절되는 경로가 생긴다.
   */
  const loweredHead = head.toLowerCase();
  if (BANNED_FRAGMENTS.some((word) => loweredHead.includes(word.toLowerCase()))) {
    return { ok: false, code: "BANNED_WORD" };
  }

  const adjective = ADJECTIVES.find((a) => head.startsWith(a));
  if (!adjective) return { ok: false, code: "NOT_ALLOWLISTED" };
  const noun = head.slice(adjective.length);
  if (!(NOUNS as readonly string[]).includes(noun)) return { ok: false, code: "NOT_ALLOWLISTED" };

  return { ok: true };
}

/** 허용목록 자체에 금지어가 없는지. 목록을 늘릴 때 테스트로 잡는다. */
export function allowlistIsClean(): boolean {
  const all = [...ADJECTIVES, ...NOUNS].map((w) => w.toLowerCase());
  return !all.some((word) => BANNED_FRAGMENTS.some((banned) => word.includes(banned.toLowerCase())));
}

export const NICKNAME_WORDLIST_SIZE = {
  adjectives: ADJECTIVES.length,
  nouns: NOUNS.length,
  /** 조합 수. 같은 방에서 충돌이 잦으면 목록을 늘린다. */
  combinations: ADJECTIVES.length * NOUNS.length * 10_000,
} as const;
