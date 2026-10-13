#!/usr/bin/env node
/**
 * `supabase db push --dry-run` 출력이 기대한 migration 만 담고 있는지 본다.
 *
 *     npx supabase db push --dry-run 2>&1 | node scripts/check-dry-run.mjs
 *     npx supabase db push --dry-run 2>&1 | node scripts/check-dry-run.mjs a.sql b.sql
 *
 * 인자가 없으면 20261011120000_partner_inquiries.sql 한 건을 기대한다.
 *
 * ── 왜 사람 눈으로 보지 않나 ────────────────────────────────
 * dry-run 은 "올라갈 파일"을 줄줄이 찍고, 운영 DB 에 무엇이 이미 있느냐에 따라
 * 목록이 달라진다. 한 건을 기대했는데 로컬에서만 만든 파일이 하나 더 섞여 있으면
 * 눈은 기대한 이름을 찾고 멈춘다. 그래서 **빠진 것과 섞인 것을 둘 다** 기계가 센다.
 *
 * ── 읽기만 한다 ─────────────────────────────────────────────
 * supabase 명령을 실행하지 않는다. stdin 으로 받은 글자만 본다.
 * 운영 DB 에 닿는 일은 사람이 친 명령에서만 일어난다.
 *
 * 종료 코드: 0 = 기대와 정확히 같음 / 1 = 다르거나 파일명이 하나도 없음.
 */

import { pathToFileURL } from "node:url";

export const DEFAULT_EXPECTED = ["20261011120000_partner_inquiries.sql"];

const MIGRATION_FILE = /\d{14}_[\w-]+\.sql/g;

/** 출력에서 migration 파일명을 중복 없이, 처음 나온 순서대로 모은다. */
export function extractMigrations(output) {
  return [...new Set(output.match(MIGRATION_FILE) ?? [])];
}

/**
 * 판정. 출력은 하지 않는다 — 테스트가 문구와 종료 코드를 그대로 확인하게 한다.
 * @returns {{ code: 0 | 1, lines: string[] }}
 */
export function checkDryRun(output, expected = DEFAULT_EXPECTED) {
  const found = extractMigrations(output);
  if (found.length === 0) {
    return { code: 1, lines: ["적용할 마이그레이션 없음 또는 출력 형식 확인 필요"] };
  }

  const want = new Set(expected);
  const extra = found.filter((name) => !want.has(name));
  const missing = [...want].filter((name) => !found.includes(name));

  if (extra.length === 0 && missing.length === 0) {
    return { code: 0, lines: ["OK: 기대한 마이그레이션만 있음", ...found.map((n) => `  - ${n}`)] };
  }

  return {
    code: 1,
    lines: [
      ...(extra.length ? ["추가로 섞인 파일:", ...extra.map((n) => `  + ${n}`)] : []),
      ...(missing.length ? ["빠진 파일:", ...missing.map((n) => `  - ${n}`)] : []),
      "경고: db push 하지 마세요",
    ],
  };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

// 테스트가 import 할 때는 stdin 을 기다리지 않는다.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const { code, lines } = checkDryRun(await readStdin(), args.length ? args : DEFAULT_EXPECTED);
  (code === 0 ? console.log : console.error)(lines.join("\n"));
  process.exit(code);
}
