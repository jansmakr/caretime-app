/**
 * 로컬 테스트 계정 + 소속 시드.
 *
 * `supabase db reset` 을 하면 auth.users 가 비어 파트너 로그인 검증을 못 한다.
 * 그때마다 손으로 만들지 않도록 한 줄로 다시 돌릴 수 있게 둔다.
 *
 *   npm run seed:localuser
 *
 * 만드는 것:
 *   1) .env.local 의 E2E_PARTNER_EMAIL / E2E_PARTNER_PASSWORD 로 auth 사용자 (이메일 확인 처리)
 *   2) hospital_members 행 2개 — h_001(owner) · h_002(staff)
 *      두 곳으로 만드는 이유: PartnerProvider 의 choose_hospital 분기를 실제로 태우기 위해서다.
 *      한 곳이면 그 분기를 지나치므로 검증되지 않는다.
 *
 * ⚠️ 로컬 전용이다. 이것을 코드로 강제한다 —
 *    SUPABASE_URL 이 127.0.0.1/localhost 가 아니면 아무 것도 하지 않고 즉시 중단한다.
 *    운영 프로젝트에 계정을 만드는 사고는 문구로 막을 수 없다.
 *
 * 비밀값은 출력하지 않는다. 이메일·비밀번호·키 어느 것도 찍지 않는다.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// ─── 1. 환경 읽기 (.env.local) ──────────────────────────────

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

function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

// ─── 2. 로컬 강제 (구조적 차단) ─────────────────────────────

const LOCAL_HOST = /^(127\.0\.0\.1|localhost|\[::1\])$/;

function requireLocal(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    fail("SUPABASE_URL 을 URL 로 읽을 수 없습니다.");
  }
  if (!LOCAL_HOST.test(host)) {
    // 값 전체(프로젝트 ref 포함)를 찍지 않고 호스트만 알린다.
    fail(
      `로컬이 아닌 Supabase 입니다 (host=${host}). 이 스크립트는 127.0.0.1 전용입니다.\n` +
        "  운영 프로젝트에 테스트 계정을 만들지 않기 위해 여기서 중단합니다.",
    );
  }
  return url;
}

// ─── 3. 실행 ────────────────────────────────────────────────

const MEMBERSHIPS = [
  { hospitalId: "h_001", role: "owner" as const },
  { hospitalId: "h_002", role: "staff" as const },
];

async function main(): Promise<void> {
  const env = readEnvLocal();
  const url = requireLocal(env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const email = env.E2E_PARTNER_EMAIL ?? "";
  const password = env.E2E_PARTNER_PASSWORD ?? "";

  if (serviceKey === "") fail("SUPABASE_SERVICE_ROLE_KEY 가 비어 있습니다. supabase start 출력의 로컬 키를 넣어 주세요.");
  if (email === "" || password === "") fail("E2E_PARTNER_EMAIL / E2E_PARTNER_PASSWORD 가 필요합니다.");

  // service_role 은 RLS 를 우회한다. 로컬 전용이라는 위 판정을 통과한 뒤에만 만든다.
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // ── 사용자 ──
  // 이미 있으면 다시 만들지 않는다. db reset 직후가 아니어도 한 줄로 돌릴 수 있게.
  const existing = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (existing.error) fail(`사용자 목록 조회 실패: ${existing.error.message}`);

  let userId = existing.data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;

  if (userId) {
    console.log("• 테스트 계정이 이미 있습니다. 그대로 씁니다.");
  } else {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      // 로컬이라 메일이 나가지 않는다. 확인 단계를 건너뛰어야 바로 로그인된다.
      email_confirm: true,
    });
    if (created.error) fail(`계정 생성 실패: ${created.error.message}`);
    userId = created.data.user?.id;
    if (!userId) fail("계정을 만들었지만 id 를 받지 못했습니다.");
    console.log("• 테스트 계정을 만들었습니다.");
  }

  // ── 소속 ──
  // hospital_members 에는 insert 정책이 없다(의도). 소속을 스스로 만들 수 있으면
  // 아무나 아무 병원 직원이 된다. 그래서 운영자 권한(service_role)으로만 넣는다.
  const rows = MEMBERSHIPS.map((m) => ({ hospital_id: m.hospitalId, user_id: userId, role: m.role }));
  const upserted = await admin
    .from("hospital_members")
    .upsert(rows, { onConflict: "hospital_id,user_id" })
    .select("hospital_id, role");
  if (upserted.error) fail(`소속 생성 실패: ${upserted.error.message}`);

  for (const row of upserted.data ?? []) {
    console.log(`• 소속: ${row.hospital_id} (${row.role})`);
  }

  console.log("");
  console.log(`완료 — 소속 ${upserted.data?.length ?? 0}곳.`);
  console.log("소속이 2곳이면 /partner 로그인 후 '어느 의료기관으로 들어갈까요?' 화면이 나와야 합니다.");
}

main().catch((e: unknown) => fail(e instanceof Error ? e.message : String(e)));
