/**
 * data/manual-hospitals.json 이 가져올 준비가 됐는지 본다. **DB 를 건드리지 않는다.**
 *
 *   npm run check:manual-hospitals
 *
 * 실제로 넣는 것은 npm run import:manual-hospitals 다. 검사를 따로 두는 이유는
 * 비어 있는 칸을 채우는 동안 DB 를 건드리지 않고 확인하기 위해서다.
 *
 * 반드시 있어야 하는 것: 이름 · 주소 · 전화번호 · 진료시간 · 분류.
 * **전화번호가 가장 중요하다** — "출발 전 전화 확인"이 이 서비스의 핵심 행동이다.
 * 좌표는 선택이다(1차에 지도·거리 정렬이 없다).
 *
 * 주소·전화는 사람이 확인해서 넣는다 — 내가 찾아 넣으면 틀려도 아무도 모른다.
 */

import { readFileSync } from "node:fs";
import { buildRegistryKey, normalizePhone } from "../src/features/hospitals/registryKey";

interface Hours {
  open: string | null;
  close: string | null;
}

interface ManualHospital {
  name: string;
  sido: string | null;
  sigungu: string | null;
  address: string | null;
  addressHint: string | null;
  tel: string | null;
  lat: number | null;
  lng: number | null;
  classification: string;
  weekdayHours: Hours;
  saturdayHours: Hours;
  sundayHours: Hours;
  holidayHours: Hours;
  note: string | null;
}

/** 'HH:MM'. 자정을 넘기면 24 를 넘겨 적는다('25:30'). */
const CLOCK = /^([0-9]{1,2}):([0-5][0-9])$/;

const CLASSIFICATIONS = new Set(["moonlight", "child_safe_clinic", "child_safe_hospital", "emergency", "night", "weekend"]);

function parseClock(value: string | null): number | null {
  if (value === null) return null;
  const match = CLOCK.exec(value.trim());
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  // 다음날 정오까지만 허용한다. 그보다 길면 데이터 오류다.
  return minutes >= 1 && minutes <= 2160 ? minutes : null;
}

function checkHours(label: string, hours: Hours, problems: string[], warnings: string[]): void {
  const { open, close } = hours;
  if (open === null && close === null) {
    warnings.push(`${label}: 비어 있음 (휴진이면 그대로 두세요)`);
    return;
  }
  if (open === null || close === null) {
    problems.push(`${label}: 시작·종료 중 하나만 적혀 있습니다`);
    return;
  }
  const openMinutes = parseClock(open);
  const closeMinutes = parseClock(close);
  if (openMinutes === null) problems.push(`${label}: 시작 시각 '${open}' 을 읽을 수 없습니다`);
  if (closeMinutes === null) problems.push(`${label}: 종료 시각 '${close}' 을 읽을 수 없습니다`);
  if (openMinutes !== null && closeMinutes !== null && closeMinutes <= openMinutes) {
    problems.push(`${label}: 종료(${close})가 시작(${open})보다 빠릅니다. 자정을 넘기면 '25:30' 처럼 적으세요`);
  }
}

const raw = readFileSync(new URL("../data/manual-hospitals.json", import.meta.url), "utf8");
const hospitals = (JSON.parse(raw) as { hospitals: ManualHospital[] }).hospitals;

let ready = 0;
const keys = new Map<string, string>();

console.log(`수동 입력 병원 ${hospitals.length}곳\n`);

for (const hospital of hospitals) {
  const problems: string[] = [];
  const warnings: string[] = [];

  // 반드시 있어야 하는 것. 하나라도 없으면 가져올 수 없다.
  if (!hospital.name?.trim()) problems.push("name 이 없습니다");
  if (!hospital.sido?.trim()) problems.push("sido 가 없습니다");
  if (!hospital.sigungu?.trim()) problems.push("sigungu 가 없습니다 (중복 판정에 필요합니다)");
  if (!hospital.address?.trim()) {
    problems.push(
      hospital.addressHint
        ? `address 가 비어 있습니다 (힌트: ${hospital.addressHint})`
        : "address 가 비어 있습니다",
    );
  }
  /*
   * 좌표는 **선택이다.** 필요한 곳은 거리순 정렬과 지도인데 1차 현장톡에는 둘 다 없다.
   * 병원은 고르는 대상일 뿐이고 목록이 세 곳이라 거리를 잴 일이 없다.
   * 빼먹은 것이 아니라 미룬 것이다 — docs/OPEN-QUESTIONS.md 에 적혀 있다.
   */
  if (hospital.lat === null || hospital.lng === null) {
    warnings.push("lat/lng 없음 (1차에서는 선택. 지도·거리 정렬을 붙일 때 필요해집니다)");
  }
  if (normalizePhone(hospital.tel) === null) {
    problems.push("tel 이 없거나 너무 짧습니다 (동명 병원 구분에 씁니다)");
  }
  if (!CLASSIFICATIONS.has(hospital.classification)) {
    problems.push(`classification '${hospital.classification}' 을 모릅니다`);
  }

  checkHours("평일", hospital.weekdayHours, problems, warnings);
  checkHours("토요일", hospital.saturdayHours, problems, warnings);
  checkHours("일요일", hospital.sundayHours, problems, warnings);
  checkHours("공휴일", hospital.holidayHours, problems, warnings);

  // 같은 병원이 두 번 들어 있지 않은가. 가져오기 전에 잡아야 한다.
  const key = buildRegistryKey({ sigungu: hospital.sigungu, name: hospital.name });
  if (key !== null) {
    const already = keys.get(key);
    if (already) problems.push(`'${already}' 와 같은 병원으로 판정됩니다 (키: ${key})`);
    else keys.set(key, hospital.name);
  }

  const mark = problems.length === 0 ? "✓" : "✗";
  console.log(`${mark} ${hospital.name}${key ? `  [${key}]` : ""}`);
  for (const problem of problems) console.log(`    ✗ ${problem}`);
  for (const warning of warnings) console.log(`    · ${warning}`);
  if (problems.length === 0) ready += 1;
  console.log("");
}

console.log(`가져올 수 있는 병원: ${ready} / ${hospitals.length}`);
if (ready < hospitals.length) {
  console.log("\n비어 있는 칸을 채운 뒤 다시 돌려 주세요. DB 는 건드리지 않았습니다.");
}
