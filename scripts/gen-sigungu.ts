/**
 * 행정표준코드(법정동코드 전체자료)에서 시·군·구 목록을 뽑아 코드로 만든다.
 *
 *   npm run gen:sigungu -- data/법정동코드_전체자료.txt
 *
 * 왜 스크립트인가: 전국 229개 이름을 **손으로 적으면 틀린다.** 틀리면 그 구를 고른
 * 사람의 글이 엉뚱한 지역에 붙고, 이미 쌓인 글을 손으로 옮겨야 한다. 그리고
 * "강서구"는 서울과 부산에 둘 다 있다 — 이름만으로는 구분되지 않는다(그래서 저장은
 * 늘 시도+시군구 쌍이다).
 *
 * ── 파일 받는 곳 ────────────────────────────────────────────
 * 행정표준코드관리시스템(www.code.go.kr) → 법정동코드 → **전체자료** 내려받기.
 * 탭으로 나뉜 텍스트이고 열은 `법정동코드  법정동명  폐지여부` 다.
 *
 *   1111000000	서울특별시 종로구	존재
 *   4111100000	경기도 수원시 장안구	존재
 *
 * ── 뽑는 규칙 ───────────────────────────────────────────────
 *   · 폐지된 행은 버린다.
 *   · 코드 10자리 중 **시군구 레벨**(앞 5자리가 유효하고 뒤 5자리가 0)만 쓴다.
 *   · 일반구가 있는 시(수원시 장안구 등)는 **시로 묶는다** — "내 지역"으로 시 단위가
 *     충분하고, 일반구까지 내려가면 목록이 커지면서 틀릴 자리도 늘어난다.
 *   · 세종특별자치시는 하위가 없어 그 자체가 한 항목이다.
 *
 * ── 검증을 통과하지 못하면 쓰지 않는다 ─────────────────────
 * 시도별 개수를 아래 표와 맞춘다(합 229). 하나라도 어긋나면 **파일을 쓰지 않고
 * 멈춘다** — 틀린 목록이 조용히 들어가는 것이 가장 나쁘다. 행정구역이 바뀌어
 * 개수가 달라졌다면 이 표를 먼저 고친다(그 자체가 사람이 확인할 일이다).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { SIDO_LIST, type Sido } from "../src/features/reports/regions";

/** 시도별 시·군·구 개수. 2023년 군위군 대구 편입 반영. 합 229. */
const EXPECTED: Record<Sido, number> = {
  서울: 25,
  부산: 16,
  대구: 9,
  인천: 10,
  광주: 5,
  대전: 5,
  울산: 5,
  세종: 1,
  경기: 31,
  강원: 18,
  충북: 11,
  충남: 15,
  전북: 14,
  전남: 22,
  경북: 22,
  경남: 18,
  제주: 2,
};

/** 파일의 긴 시도명 → 우리 짧은 표기. regions.ts 의 별칭과 같은 규칙이다. */
const SIDO_OF: [prefix: string, sido: Sido][] = [
  ["서울특별시", "서울"],
  ["부산광역시", "부산"],
  ["대구광역시", "대구"],
  ["인천광역시", "인천"],
  ["광주광역시", "광주"],
  ["대전광역시", "대전"],
  ["울산광역시", "울산"],
  ["세종특별자치시", "세종"],
  ["경기도", "경기"],
  ["강원특별자치도", "강원"],
  ["강원도", "강원"],
  ["충청북도", "충북"],
  ["충청남도", "충남"],
  ["전북특별자치도", "전북"],
  ["전라북도", "전북"],
  ["전라남도", "전남"],
  ["경상북도", "경북"],
  ["경상남도", "경남"],
  ["제주특별자치도", "제주"],
];

function fail(message: string): never {
  console.error(`X ${message}`);
  process.exit(1);
}

function main(): void {
  const path = process.argv[2];
  if (!path) fail("파일 경로를 주세요. 예: npm run gen:sigungu -- data/법정동코드_전체자료.txt");

  const raw = readFileSync(path, "utf8");
  const found = new Map<Sido, Set<string>>(SIDO_LIST.map((s) => [s, new Set<string>()]));

  for (const line of raw.replace(/\r\n/g, "\n").split("\n")) {
    const cols = line.split("\t").map((c) => c.trim());
    if (cols.length < 2) continue;

    const [code, name, state] = cols;
    if (!/^\d{10}$/.test(code)) continue;
    // 폐지된 행은 버린다. 열 이름이 바뀌어도 '폐지'라는 글자만 본다.
    if (state && state.includes("폐지")) continue;
    // 시군구 레벨: 앞 5자리가 지역을 정하고 뒤 5자리가 0 이다.
    if (!code.endsWith("00000")) continue;
    if (code.slice(2, 5) === "000") continue; // 시도 그 자체

    const entry = SIDO_OF.find(([prefix]) => name.startsWith(prefix));
    if (!entry) continue;
    const [prefix, sido] = entry;

    const rest = name.slice(prefix.length).trim();
    if (rest === "") {
      // 세종처럼 하위가 없는 곳. 시도 이름을 그대로 한 항목으로 둔다.
      found.get(sido)!.add(sido);
      continue;
    }
    // 일반구는 시로 묶는다. "수원시 장안구" → "수원시"
    const sigungu = rest.split(/\s+/)[0];
    if (!/(시|군|구)$/.test(sigungu)) continue;
    found.get(sido)!.add(sigungu);
  }

  // ── 검증 ──
  const problems: string[] = [];
  let total = 0;
  for (const sido of SIDO_LIST) {
    const list = [...found.get(sido)!];
    total += list.length;
    if (list.length !== EXPECTED[sido]) {
      problems.push(`${sido}: ${list.length}개 (기대 ${EXPECTED[sido]})`);
    }
  }
  const expectedTotal = Object.values(EXPECTED).reduce((a, b) => a + b, 0);
  if (total !== expectedTotal) problems.push(`합계 ${total}개 (기대 ${expectedTotal})`);

  if (problems.length > 0) {
    console.error("X 검증 실패. 파일을 쓰지 않았습니다.");
    for (const p of problems) console.error(`  - ${p}`);
    console.error(
      "\n파일이 다른 형식이거나 행정구역이 바뀐 것입니다. 사람이 확인하고," +
        "\n바뀐 것이 맞으면 scripts/gen-sigungu.ts 의 EXPECTED 를 먼저 고치세요.",
    );
    process.exit(1);
  }

  // ── 쓰기 ──
  const lines: string[] = [
    "/**",
    " * 전국 시·군·구. **이 파일은 생성된 것이다. 손으로 고치지 마라.**",
    " *",
    " *   npm run gen:sigungu -- <법정동코드 전체자료 파일>",
    " *",
    " * 출처: 행정표준코드관리시스템 법정동코드 전체자료.",
    ` * 생성: ${new Date().toISOString().slice(0, 10)} · ${total}개`,
    " *",
    " * 일반구가 있는 시(수원시 장안구 등)는 시로 묶었다. 세종은 하위가 없어 자기 자신이다.",
    " * 시도별 개수를 생성 시점에 검증했다(scripts/gen-sigungu.ts 의 EXPECTED).",
    " */",
    "",
    'import type { Sido } from "@/features/reports/regions";',
    "",
    "export const SIGUNGU_GENERATED: Record<Sido, readonly string[]> = {",
  ];
  for (const sido of SIDO_LIST) {
    const list = [...found.get(sido)!];
    lines.push(`  ${sido}: [${list.map((n) => `"${n}"`).join(", ")}],`);
  }
  lines.push("};", "");

  const out = "src/features/regions/sigungu.generated.ts";
  writeFileSync(out, lines.join("\n"), "utf8");
  console.log(`O ${out} (${total}개). sigungu.ts 가 이 표를 읽도록 바꾸세요.`);
}

main();
