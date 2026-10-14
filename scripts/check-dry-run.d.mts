// check-dry-run.mjs 의 타입. tsconfig 가 allowJs:false 라 테스트가 import 하려면 필요하다.
export declare const DEFAULT_EXPECTED: string[];
export declare function extractMigrations(output: string): string[];
export declare function checkDryRun(
  output: string,
  expected?: string[],
): { code: 0 | 1; lines: string[] };
