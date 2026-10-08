/**
 * data/manual-hospitals.json 을 DB 에 넣는다.
 *
 *   npm run import:manual-hospitals
 *
 * 공공데이터에 아직 없는 병원을 손으로 넣는 경로다. 배치가 나중에 같은 병원을 가져와도
 * **새 행이 생기지 않는다** — registry_key(시군구+이름)로 같은 병원임을 알아보고 그 행을
 * 갱신한다. 행이 유지되므로 그 병원을 가리키던 현장톡 글도 그대로 남는다.
 *
 * ⚠️ 로컬 전용이다. SUPABASE_URL 이 127.0.0.1 이 아니면 아무 것도 하지 않고 중단한다.
 *    운영에 넣는 것은 사람이 결정한다.
 *
 * 검사만 하려면 npm run check:manual-hospitals — DB 를 건드리지 않는다.
 *
 * ── 운영에 넣을 SQL 을 뽑으려면 ────────────────────────────
 *   npm run sql:manual-hospitals -- --out manual.sql    (파일로. PowerShell 은 이쪽)
 *   npm run --silent sql:manual-hospitals               (화면으로)
 *
 * DB 에 붙지 않고 **INSERT 문만 찍는다.** 운영 콘솔에 그대로 붙여 넣는 용도다.
 * 로컬 투입과 **같은 매핑 코드**를 쓴다 — 두 벌로 두면 리허설에서 통과한 SQL 과
 * 운영에 붙여 넣는 SQL 이 달라질 수 있다. 그러면 리허설이 아무것도 보장하지 않는다.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { manualHospitalId } from "../src/features/hospitals/manualId";
import { buildRegistryKey, findRegistryMismatch } from "../src/features/hospitals/registryKey";

const LOCAL_HOST = /^(127\.0\.0\.1|localhost|\[::1\])$/;

function fail(message: string): never {
  console.error(`X ${message}`);
  process.exit(1);
}

function readEnvLocal(): Record<string, string> {
  try {
    const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    return Object.fromEntries(
      raw
        .split(/\r?\n/)
        .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
        .map((line) => {
          const i = line.indexOf("=");
          return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
        }),
    );
  } catch {
    fail(".env.local 을 읽을 수 없습니다.");
  }
}

interface Hours {
  open: string | null;
  close: string | null;
}

interface ManualHospital {
  name: string;
  sido: string | null;
  sigungu: string | null;
  address: string | null;
  tel: string | null;
  lat: number | null;
  lng: number | null;
  classification: string;
  dutyDiv: string | null;
  weekdayHours: Hours;
  saturdayHours: Hours;
  sundayHours: Hours;
  holidayHours: Hours;
}

const CLOCK = /^([0-9]{1,2}):([0-5][0-9])$/;

function minutesOf(value: string | null): number | null {
  if (value === null) return null;
  const match = CLOCK.exec(value.trim());
  if (!match) return null;
  const total = Number(match[1]) * 60 + Number(match[2]);
  return total >= 1 && total <= 2160 ? total : null;
}

interface WeeklyRow {
  hospital_id: string;
  day: number;
  open_minutes: number;
  close_minutes: number;
}

/** 1=월 … 5=금 은 평일 값을 그대로 쓴다. 6=토, 7=일, 8=공휴일. */
function weeklyRows(hospitalId: string, hospital: ManualHospital): WeeklyRow[] {
  const rows: WeeklyRow[] = [];

  const add = (day: number, hours: Hours): void => {
    const open = minutesOf(hours.open);
    const close = minutesOf(hours.close);
    /*
     * 둘 다 있어야 넣는다. 휴진인 날은 행을 만들지 않는다 —
     * 0 으로 채우면 "쉬는 날"과 "모름"이 구분되지 않는다.
     */
    if (open === null || close === null || close <= open) return;
    rows.push({ hospital_id: hospitalId, day, open_minutes: open, close_minutes: close });
  };

  for (const day of [1, 2, 3, 4, 5]) add(day, hospital.weekdayHours);
  add(6, hospital.saturdayHours);
  add(7, hospital.sundayHours);
  add(8, hospital.holidayHours);
  return rows;
}

/** 목록을 정렬·필터할 때 쓰는 계산값. 매번 8개 행을 훑지 않기 위해 둔다. */
function derivedFlags(rows: WeeklyRow[]): {
  night_until_minutes: number | null;
  weekend_open: boolean;
} {
  const weekdayCloses = rows.filter((row) => row.day <= 5).map((row) => row.close_minutes);
  return {
    night_until_minutes: weekdayCloses.length > 0 ? Math.max(...weekdayCloses) : null,
    weekend_open: rows.some((row) => row.day === 6 || row.day === 7),
  };
}

/** SQL 문자열 리터럴. 홑따옴표만 막으면 된다 — 값은 우리가 쓴 JSON 이다. */
function lit(value: string | number | boolean | null): string {
  if (value === null) return "null";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * 운영 콘솔에 붙여 넣을 SQL 을 찍는다. DB 에 붙지 않는다.
 *
 * upsert 로 쓴다. 배치가 나중에 같은 병원을 가져와도 새 행이 생기지 않아야 하고,
 * 두 번 붙여 넣어도 결과가 같아야 한다 — 콘솔 작업은 두 번 눌리는 일이 흔하다.
 */
function printSql(hospitals: ManualHospital[], outPath: string | null): void {
  const lines: string[] = [
    "-- data/manual-hospitals.json → 운영 투입용 SQL",
    "-- npm run sql:manual-hospitals 로 생성했다. 손으로 고치지 말고 JSON 을 고쳐 다시 뽑는다.",
    "-- 두 번 실행해도 결과가 같다(upsert + 진료시간 재삽입).",
    "begin;",
  ];
  let ready = 0;

  for (const hospital of hospitals) {
    const registryKey = buildRegistryKey({ sigungu: hospital.sigungu, name: hospital.name });
    if (!registryKey || !hospital.address || !hospital.tel) {
      lines.push(`-- 건너뜀: ${hospital.name} (이름·시군구·주소·전화가 모두 있어야 합니다)`);
      continue;
    }

    const id = manualHospitalId(registryKey);
    const rows = weeklyRows(id, hospital);
    const flags = derivedFlags(rows);
    ready += 1;

    lines.push(
      "",
      `-- ${hospital.name}`,
      "insert into public.hospitals (id, hpid, name, address, tel, lat, lng, sido, sigungu,",
      "  registry_key, source, duty_div, is_moonlight, has_emergency_room,",
      "  night_until_minutes, weekend_open, verification_state, synced_at)",
      "values (" +
        [
          lit(id),
          "null",
          lit(hospital.name),
          lit(hospital.address),
          lit(hospital.tel),
          lit(hospital.lat),
          lit(hospital.lng),
          lit(hospital.sido),
          lit(hospital.sigungu),
          lit(registryKey),
          lit("manual"),
          lit(hospital.dutyDiv),
          lit(hospital.classification === "moonlight"),
          lit(hospital.classification === "emergency"),
          lit(flags.night_until_minutes),
          lit(flags.weekend_open),
          lit("PENDING"),
          "now()",
        ].join(", ") +
        ")",
      "on conflict (id) do update set",
      "  name = excluded.name, address = excluded.address, tel = excluded.tel,",
      "  lat = excluded.lat, lng = excluded.lng, sido = excluded.sido, sigungu = excluded.sigungu,",
      "  registry_key = excluded.registry_key, duty_div = excluded.duty_div,",
      "  is_moonlight = excluded.is_moonlight, has_emergency_room = excluded.has_emergency_room,",
      "  night_until_minutes = excluded.night_until_minutes, weekend_open = excluded.weekend_open,",
      "  synced_at = now();",
      `delete from public.hospital_weekly_hours where hospital_id = ${lit(id)};`,
    );

    if (rows.length === 0) {
      lines.push("-- 진료시간 없음 — '지금 열었나'에 답할 수 없다. 확인되면 JSON 을 고쳐 다시 뽑는다.");
    } else {
      lines.push(
        "insert into public.hospital_weekly_hours (hospital_id, day, open_minutes, close_minutes) values",
        rows
          .map(
            (row, i) =>
              `  (${lit(row.hospital_id)}, ${row.day}, ${row.open_minutes}, ${row.close_minutes})` +
              (i === rows.length - 1 ? ";" : ","),
          )
          .join("\n"),
      );
    }
  }

  lines.push(
    "",
    "commit;",
    "",
    "-- 확인",
    "select id, name, tel, sigungu from public.hospitals where source = 'manual' order by name;",
    `-- → ${ready}행`,
  );
  const sql = lines.join("\n") + "\n";

  /*
   * 파일로 받을 때 셸을 거치지 않는다. PowerShell 의 `>` 는 Node 의 UTF-8 출력을
   * 다시 인코딩해서 한글 주석을 깨뜨린다 — SQL 문법은 멀쩡해서 실행은 되지만
   * 나중에 열면 못 읽는다. 실제로 겪었다.
   *
   * BOM 도 붙이지 않는다. psql 은 BOM 을 견디지만(확인했다), 콘솔 편집기에 붙여
   * 넣을 때 앞에 보이지 않는 글자가 끼는 것이 나을 이유가 없다.
   */
  if (outPath === null) {
    console.log(sql);
    return;
  }
  writeFileSync(outPath, sql, "utf8");
  console.log(`O ${outPath} 에 썼습니다 (UTF-8, BOM 없음). 운영 콘솔에 붙여 넣으세요.`);
}

/** `--out manual.sql` 에서 경로를 집는다. 없으면 null — 화면으로 찍는다. */
function outPathArg(): string | null {
  const i = process.argv.indexOf("--out");
  if (i < 0) return null;
  const next = process.argv[i + 1];
  if (!next || next.startsWith("--")) fail("--out 다음에 파일 경로를 적어 주세요.");
  return next;
}

async function main(): Promise<void> {
  const raw0 = readFileSync(new URL("../data/manual-hospitals.json", import.meta.url), "utf8");
  if (process.argv.includes("--sql")) {
    printSql((JSON.parse(raw0) as { hospitals: ManualHospital[] }).hospitals, outPathArg());
    return;
  }

  const env = readEnvLocal();
  const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? "";

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    fail("SUPABASE_URL 을 URL 로 읽을 수 없습니다.");
  }
  if (!LOCAL_HOST.test(host)) {
    fail(
      `로컬이 아닌 Supabase 입니다 (host=${host}). 이 스크립트는 127.0.0.1 전용입니다. ` +
        "운영에 넣는 것은 사람이 결정합니다.",
    );
  }

  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (serviceKey === "") fail("SUPABASE_SERVICE_ROLE_KEY 가 없습니다.");

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const raw = readFileSync(new URL("../data/manual-hospitals.json", import.meta.url), "utf8");
  const hospitals = (JSON.parse(raw) as { hospitals: ManualHospital[] }).hospitals;

  let inserted = 0;
  let skipped = 0;

  for (const hospital of hospitals) {
    const registryKey = buildRegistryKey({ sigungu: hospital.sigungu, name: hospital.name });
    if (!registryKey || !hospital.address || !hospital.tel) {
      console.log(`- ${hospital.name}: 건너뜀 (이름·시군구·주소·전화가 모두 있어야 합니다)`);
      skipped += 1;
      continue;
    }

    const { data: existingRows } = await admin
      .from("hospitals")
      .select("id,registry_key,tel,name")
      .eq("registry_key", registryKey)
      .limit(1);

    const existing = (existingRows ?? [])[0] as
      | { id: string; registry_key: string | null; tel: string | null; name: string }
      | undefined;

    if (existing) {
      const mismatch = findRegistryMismatch(
        { registryKey, tel: hospital.tel },
        { registryKey: existing.registry_key, tel: existing.tel },
      );
      if (mismatch) {
        console.log(
          `! ${hospital.name}: 이미 있는 ${existing.name} 와 같은 키인데 전화가 다릅니다 ` +
            `(${mismatch}). 자동으로 고치지 않습니다. 사람이 확인해 주세요.`,
        );
        skipped += 1;
        continue;
      }
    }

    /*
     * id 는 registry_key 에서 결정적으로 만든다(URL 안전한 불투명 값).
     * registry_key 를 그대로 쓰면 `|` 때문에 /hospital/<id> 가 404 가 난다 —
     * 실제로 겪었다. features/hospitals/manualId 주석 참고.
     *
     * hpid 가 없으므로 그것을 id 로 쓸 수 없고 가짜 hpid 를 만들지 않기로 했다.
     * 배치가 나중에 hpid 를 채워도 id 는 바꾸지 않는다 — 바꾸면 그 병원을 가리키던
     * 현장톡 글이 끊긴다.
     */
    const id = existing?.id ?? manualHospitalId(registryKey);
    const rows = weeklyRows(id, hospital);
    const flags = derivedFlags(rows);

    const { error } = await admin.from("hospitals").upsert(
      {
        id,
        hpid: null,
        name: hospital.name,
        address: hospital.address,
        tel: hospital.tel,
        lat: hospital.lat,
        lng: hospital.lng,
        sido: hospital.sido,
        sigungu: hospital.sigungu,
        registry_key: registryKey,
        source: "manual",
        duty_div: hospital.dutyDiv,
        is_moonlight: hospital.classification === "moonlight",
        has_emergency_room: hospital.classification === "emergency",
        night_until_minutes: flags.night_until_minutes,
        weekend_open: flags.weekend_open,
        verification_state: "PENDING",
        synced_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

    if (error) {
      console.log(`X ${hospital.name}: ${error.message}`);
      skipped += 1;
      continue;
    }

    // 진료시간은 지우고 다시 넣는다. 지난번에 넣은 요일이 남아 있으면 안 된다.
    await admin.from("hospital_weekly_hours").delete().eq("hospital_id", id);
    if (rows.length > 0) {
      const { error: hoursError } = await admin.from("hospital_weekly_hours").insert(rows);
      if (hoursError) {
        console.log(`! ${hospital.name}: 진료시간 저장 실패 — ${hoursError.message}`);
      }
    }

    const note = rows.length === 0 ? "  (진료시간 없음 — 지금 열었나에 답할 수 없습니다)" : "";
    console.log(`O ${hospital.name}${note}`);
    inserted += 1;
  }

  console.log("");
  console.log(`넣음 ${inserted}곳, 건너뜀 ${skipped}곳.`);
}

main().catch((e: unknown) => fail(e instanceof Error ? e.message : String(e)));
