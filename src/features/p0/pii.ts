/**
 * 게시 전 개인정보 걸러내기.
 *
 * 현장톡은 로그인 없이 누구나 쓰고 누구나 읽는다. 그래서 한 번 올라간 개인정보는
 * 지우기 전에 이미 읽힌다. 올라간 뒤에 지우는 것보다 올라가기 전에 막는 것이 싸다.
 *
 * **서버에서 판정한다.** 화면에서만 막으면 화면을 거치지 않는 요청에 뚫린다.
 * (같은 이유로 rate limit 도 서버에 있다 — features/p0/serverLimits)
 *
 * ── 무엇을 막고 무엇을 막지 않는가 ──────────────────────────
 *
 * 막는 것: 전화번호·이메일·주민등록번호 모양·카드번호 길이의 숫자열.
 * 이것들은 "적을 이유가 없는" 값이다. 현장 상황을 전하는 데 필요하지 않다.
 *
 * 막지 않는 것: 이름처럼 보이는 문자열. 한국어 이름은 일반 낱말과 구분되지 않아
 * 정규식으로 잡으면 멀쩡한 글이 계속 막힌다. 그건 "쓰지 말라"는 안내와 신고로 다룬다.
 *
 * 놓치는 것이 있다는 전제로 만든다. 이건 마지막 방어선이 아니라 첫 번째 체다 —
 * 실수로 적은 것을 잡는다. 작정하고 우회하는 것은 신고 → 격리가 맡는다.
 */

export type PiiKind = "phone" | "email" | "rrn" | "long_digits";

export interface PiiFinding {
  kind: PiiKind;
  /** 사용자에게 보여 줄 안내. 무엇이 걸렸는지 알아야 고칠 수 있다. */
  message: string;
}

/*
 * 숫자 사이에 들어갈 수 있는 구분자. 010-1234-5678, 010.1234.5678, 010 1234 5678,
 * 공일공1234오륙칠팔 같은 우회는 잡지 못한다 — 첫 번째 체다.
 */
const SEP = "[\\s.\\-–—()]*";

/** 휴대전화·지역번호. 국제표기(+82)도 본다. */
const PHONE = new RegExp(
  `(?:\\+?82${SEP}1[0-9]|01[016789]|0[2-6][0-9]?)${SEP}[0-9]{3,4}${SEP}[0-9]{4}`,
);

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

/** 주민등록번호 모양. 실제 유효성은 보지 않는다 — 모양만으로 충분히 위험하다. */
const RRN = new RegExp(`[0-9]{6}${SEP}[1-4][0-9]{6}`);

/** 카드번호 길이의 연속 숫자. 계좌번호도 여기 걸린다. */
const LONG_DIGITS = new RegExp(`(?:[0-9]${SEP}){11,}[0-9]`);

const RULES: { kind: PiiKind; pattern: RegExp; message: string }[] = [
  {
    kind: "rrn",
    pattern: RRN,
    message: "주민등록번호로 보이는 숫자가 있습니다. 지우고 다시 올려 주세요.",
  },
  {
    kind: "phone",
    pattern: PHONE,
    message: "전화번호로 보이는 숫자가 있습니다. 개인 연락처는 올릴 수 없습니다.",
  },
  {
    kind: "email",
    pattern: EMAIL,
    message: "이메일 주소가 있습니다. 개인 연락처는 올릴 수 없습니다.",
  },
  {
    kind: "long_digits",
    pattern: LONG_DIGITS,
    message: "카드·계좌번호로 보이는 긴 숫자가 있습니다. 지우고 다시 올려 주세요.",
  },
];

/**
 * 첫 번째로 걸린 것을 돌려준다. 여러 개를 한 번에 알려 주지 않는다 —
 * 급한 사람에게 목록을 읽히는 것보다 하나를 고치게 하는 편이 빠르다(원칙 5).
 */
export function findPii(text: string): PiiFinding | null {
  for (const rule of RULES) {
    if (rule.pattern.test(text)) return { kind: rule.kind, message: rule.message };
  }
  return null;
}

/**
 * 병원 대표번호는 막지 않는다.
 *
 * "여기 02-1234-5678로 전화해 보세요"는 개인정보가 아니라 도움이 되는 정보다.
 * 그런데 위 규칙은 그것도 잡는다. 그래서 **이미 아는 병원 번호는 통과시킨다.**
 * 아는 번호만 통과시키는 것이 핵심이다 — "병원 번호처럼 보이면 통과"로 만들면
 * 개인 번호를 병원 번호인 척 적을 수 있다.
 */
export function findPiiExcludingKnown(text: string, knownPhones: string[]): PiiFinding | null {
  let scrubbed = text;
  for (const phone of knownPhones) {
    const digits = phone.replace(/[^0-9]/g, "");
    if (digits.length < 8) continue;
    // 구분자가 어떻게 들어가도 같은 번호로 본다.
    const loose = digits.split("").join(SEP);
    scrubbed = scrubbed.replace(new RegExp(loose, "g"), " ");
  }
  return findPii(scrubbed);
}
