/**
 * 사업자 정보 — **한 곳에서만 적는다.**
 *
 * 푸터, 이용약관, 개인정보 처리방침 셋이 같은 값을 보여 줘야 한다. 세 군데에 적으면
 * 주소를 옮기거나 보호책임자가 바뀌는 날 두 곳만 고쳐지고, 어느 쪽이 맞는지 알 수 없게
 * 된다. 사업자 정보는 표기 의무가 있는 값이라 "둘 중 하나가 틀린" 상태가 그대로 위반이다.
 *
 * 그래서 문서 본문(docs/legal/*.md)에는 값을 쓰지 않고 **토큰**을 쓴다.
 * 렌더할 때 이 파일의 값으로 바꾼다.
 *
 *     상호: {{상호}} / 대표: {{대표자}}
 *
 * 토큰 목록은 아래 COMPANY_TOKENS 하나뿐이고, 문서에 쓸 수 있는 것도 그것뿐이다.
 * docs/legal/README.md 에 같은 표가 있다(사람이 읽는 쪽).
 */

export const COMPANY = {
  name: "주식회사 이노메딕",
  ceo: "박대수",
  address: "서울특별시 금천구 디지털로10길 78, 10층",
  registrationNumber: "818-86-03381",
  privacyOfficer: "강혁",
  email: "help@caretime.kr",
} as const;

/**
 * 문서 본문에 쓸 수 있는 토큰. 한국어로 둔다 — 본문을 쓰는 사람이 개발자가 아니다.
 *
 * 여기 없는 토큰은 바꾸지 않고 **그대로 화면에 남긴다.** 조용히 빈칸으로 만들면
 * "상호: " 처럼 값이 빠진 문장이 그대로 공개된다. 보이게 두면 눈에 걸린다.
 * 테스트가 `{{` 가 남아 있는지도 본다(features/legal/legal.test.ts).
 */
export const COMPANY_TOKENS: Record<string, string> = {
  "{{상호}}": COMPANY.name,
  "{{대표자}}": COMPANY.ceo,
  "{{주소}}": COMPANY.address,
  "{{사업자등록번호}}": COMPANY.registrationNumber,
  "{{보호책임자}}": COMPANY.privacyOfficer,
  "{{이메일}}": COMPANY.email,
};

export function applyCompanyTokens(text: string): string {
  let out = text;
  for (const [token, value] of Object.entries(COMPANY_TOKENS)) {
    out = out.split(token).join(value);
  }
  return out;
}

/** 바꾸지 못한 토큰. 비어 있지 않으면 문서에 오타가 있다는 뜻이다. */
export function unknownTokens(text: string): string[] {
  const found = text.match(/\{\{[^}\n]{1,40}\}\}/g) ?? [];
  return [...new Set(found.filter((token) => !(token in COMPANY_TOKENS)))];
}
