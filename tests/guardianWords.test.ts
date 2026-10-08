import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CATEGORY_LABEL_GUARDIAN,
  CATEGORY_LABEL_PARTNER,
  CATEGORY_STATUS_GUARDIAN,
  type CareCategory,
} from "@/features/hospitals/labels";
import { deriveServiceBreakdown } from "@/features/hospitals/statusView";
import type { HospitalServiceStatus, HospitalView } from "@/features/hospitals/types";

/**
 * 보호자 화면의 말을 감시한다. (docs/UI-PRINCIPLES.md 원칙 7)
 *
 * 항목 이름을 두 벌로 둔 이유가 여기 있다 — 병원 화면은 "열상"이 정확하고, 보호자
 * 화면에 그 말이 새면 원칙 7 위반이다. 표를 두 벌 두는 것만으로는 막히지 않는다.
 * 누가 보호자 화면에서 PARTNER 표를 import 하면 끝이므로, 그것을 테스트가 본다.
 *
 * 이 테스트가 덮는 범위를 분명히 해 둔다.
 *   ① 라벨 표와 파생 문구  — 값으로 검사한다. 확실하다.
 *   ② 보호자 화면 소스      — "열상"·PARTNER 표 import 를 문자열로 찾는다.
 *      "capability"·"service" 는 식별자로 정당하게 쓰이므로(deriveStatusView,
 *      hospital.services) 소스 스캔으로는 의미가 없다. 대신 **한글 문자열 안에**
 *      섞여 있는 경우만 찾는다 — 그게 화면에 나가는 형태다.
 */

/** 보호자가 보는 화면. 파트너(/partner)와 그 컴포넌트는 제외한다. */
const GUARDIAN_DIRS = [
  "src/app/(consumer)",
  "src/components/search",
  "src/components/hospital",
  "src/components/home",
  "src/components/common",
  "src/components/chat",
  "src/components/layout",
];

const BANNED_IN_GUARDIAN = ["열상"];

/** 병원 화면. 여기는 의료 용어를 쓰고, 보호자용 표를 읽으면 안 된다. */
const PARTNER_DIRS = ["src/app/partner", "src/components/partner"];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const guardianFiles = GUARDIAN_DIRS.flatMap((d) => walk(d));
const partnerFiles = PARTNER_DIRS.flatMap((d) => walk(d));

/**
 * 주석을 지운다. 규칙을 코드에 설명해 두는 것을 막을 이유가 없다 —
 * 실제로 이 파일들의 주석이 "보호자 화면에 '열상'을 쓰지 않는다"를 적고 있고,
 * 주석까지 세면 그 설명 자체가 위반으로 잡힌다.
 *
 * 완벽한 파서가 아니다. 문자열 안의 // 를 지울 수 있다 — 하지만 그건 URL 같은 것이고
 * 한글 문구가 아니어서 이 검사의 대상이 아니다.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

/** 한글이 섞인 문자열 리터럴만 모은다. 화면에 나가는 말은 대체로 이 모양이다. */
function koreanLiterals(raw: string): string[] {
  const source = stripComments(raw);
  const found: string[] = [];
  for (const match of source.matchAll(/"([^"\n]*[가-힣][^"\n]*)"|'([^'\n]*[가-힣][^'\n]*)'/g)) {
    found.push(match[1] ?? match[2] ?? "");
  }
  // JSX 텍스트 노드도 본다(따옴표 없이 쓰인 한글).
  for (const match of source.matchAll(/>([^<>{}\n]*[가-힣][^<>{}\n]*)</g)) {
    found.push(match[1]);
  }
  return found;
}

describe("항목 이름 표가 두 벌로 갈려 있다", () => {
  const categories: CareCategory[] = ["laceration", "burn", "other"];

  it("보호자 표에는 한자어 '열상'이 없다", () => {
    for (const c of categories) {
      expect(CATEGORY_LABEL_GUARDIAN[c]).not.toContain("열상");
    }
    expect(CATEGORY_LABEL_GUARDIAN.laceration).toBe("찢어진 상처");
  });

  it("병원 표는 의료 용어를 쓴다 — 두 표가 실제로 다르다", () => {
    expect(CATEGORY_LABEL_PARTNER.laceration).toBe("열상");
    expect(CATEGORY_LABEL_PARTNER.laceration).not.toBe(CATEGORY_LABEL_GUARDIAN.laceration);
  });

  it("두 표가 같은 항목을 모두 덮는다 — 한쪽에만 있는 항목이 없다", () => {
    expect(Object.keys(CATEGORY_LABEL_GUARDIAN).sort()).toEqual(
      Object.keys(CATEGORY_LABEL_PARTNER).sort(),
    );
  });

  it("상태말에 영어가 섞이지 않는다", () => {
    for (const text of Object.values(CATEGORY_STATUS_GUARDIAN)) {
      expect(text).toMatch(/^[가-힣 ·]+$/);
    }
  });
});

describe("파생 문구에 내부 용어가 없다", () => {
  function view(services: HospitalServiceStatus[]): HospitalView {
    return {
      id: "h_001",
      publicData: {
        hpid: "A0001",
        name: "가상병원",
        address: "서울",
        tel: "02-0000-0000",
        lat: 37.5,
        lng: 127,
        syncedAt: new Date().toISOString(),
      },
      distanceKm: 1,
      travelMinutes: 5,
      capabilities: [],
      hours: null,
      liveStatus: null,
      services,
      contactStatus: null,
      waiting: null,
      incoming: null,
      isParticipating: true,
    };
  }

  function service(
    category: CareCategory,
    status: "AVAILABLE" | "CLOSED" | null,
  ): HospitalServiceStatus {
    const now = Date.now();
    return {
      serviceId: `svc-${category}`,
      category,
      serviceCode: category,
      status,
      waitBucket: "UNKNOWN",
      validUntil: status === null ? null : new Date(now + 600_000).toISOString(),
      updatedAt: status === null ? null : new Date(now - 60_000).toISOString(),
      reopenAt: null,
      version: null,
    };
  }

  it("★ 항목 줄에 '열상'·capability·service 가 없다", () => {
    const lines = deriveServiceBreakdown(
      view([service("laceration", "AVAILABLE"), service("burn", "CLOSED"), service("other", null)]),
      new Date(),
    ).lines;

    expect(lines).toHaveLength(3);
    for (const line of lines) {
      const text = `${line.label} ${line.statusText}`;
      expect(text).not.toContain("열상");
      expect(text.toLowerCase()).not.toContain("capability");
      expect(text.toLowerCase()).not.toContain("service");
      // 항목 줄은 한글과 가운뎃점만으로 읽혀야 한다.
      expect(text).toMatch(/^[가-힣 ·]+$/);
    }
  });
});

describe("보호자 화면 소스", () => {
  it("파일을 실제로 찾았다 — 경로가 바뀌면 이 테스트가 먼저 알려준다", () => {
    expect(guardianFiles.length).toBeGreaterThan(10);
  });

  it("★ 화면에 나가는 말에 '열상'이 없다", () => {
    /*
     * 주석은 보지 않는다. 규칙을 코드에 설명해 두는 것을 막을 이유가 없고,
     * 실제로 이 파일들의 주석이 "보호자 화면에 '열상'을 쓰지 않는다"를 적고 있다.
     * 검사 대상은 화면에 나가는 문자열 리터럴과 JSX 텍스트다.
     */
    const offenders: string[] = [];
    for (const file of guardianFiles) {
      for (const literal of koreanLiterals(readFileSync(file, "utf8"))) {
        if (BANNED_IN_GUARDIAN.some((word) => literal.includes(word))) {
          offenders.push(`${file}: ${literal.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("★ 병원 화면용 라벨 표를 import 하지 않는다", () => {
    const offenders = guardianFiles.filter((f) =>
      readFileSync(f, "utf8").includes("CATEGORY_LABEL_PARTNER"),
    );
    expect(offenders).toEqual([]);
  });

  it("★ 화면에 나가는 한글 문구에 내부 용어가 섞이지 않는다", () => {
    const offenders: string[] = [];
    for (const file of guardianFiles) {
      for (const literal of koreanLiterals(readFileSync(file, "utf8"))) {
        if (/capability|service|liveStatus|hospital_/i.test(literal)) {
          offenders.push(`${file}: ${literal.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("병원 화면 소스", () => {
  it("파일을 실제로 찾았다", () => {
    expect(partnerFiles.length).toBeGreaterThan(5);
  });

  it("★ 보호자용 라벨 표를 import 하지 않는다", () => {
    /*
     * 반대 방향도 막는다. 병원 화면에 "찢어진 상처"가 뜨면 야간 당직자가 한 번 더
     * 읽어야 한다. 표가 두 벌인 이유는 읽는 사람이 다르기 때문이고, 그 구분은
     * 양쪽에서 지켜져야 뜻이 있다.
     */
    const offenders = partnerFiles.filter((f) =>
      readFileSync(f, "utf8").includes("CATEGORY_LABEL_GUARDIAN"),
    );
    expect(offenders).toEqual([]);
  });

  it("병원 화면은 '열상'을 쓴다 — 표가 실제로 갈려 있다", () => {
    const usesPartnerTable = partnerFiles.some((f) =>
      readFileSync(f, "utf8").includes("CATEGORY_LABEL_PARTNER"),
    );
    expect(usesPartnerTable).toBe(true);
  });
});
