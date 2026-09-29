import { describe, expect, it } from "vitest";
import {
  FOLD_PRIORITY,
  effectiveStatusOf,
  foldRepresentative,
  mergeConservative,
  representativeLiveStatus,
  toLegacyLiveStatus,
} from "@/features/hospitals/serviceStatus";
import { describeStatus } from "@/lib/freshness";
import type { HospitalLiveStatus, HospitalServiceStatus } from "@/features/hospitals/types";

/**
 * 접기 규칙. 이건 코드가 아니라 안전 판단이라 테스트로 못박는다.
 *
 *   CLOSED > PAUSED > LIMITED > UNKNOWN > AVAILABLE
 *
 * 좋은 쪽으로 접으면 봉합=가능 / 화상=마감 인 병원이 "지금 접수 가능"으로 보이고,
 * 화상 환자 보호자가 그걸 보고 야간에 출발한다. 그 헛걸음을 만들지 않는 것이 목적이다.
 */

const NOW = new Date("2026-09-28T12:00:00Z");
const at = (mins: number) => new Date(NOW.getTime() + mins * 60_000).toISOString();

let seq = 0;
function svc(over: Partial<HospitalServiceStatus> = {}): HospitalServiceStatus {
  seq += 1;
  return {
    serviceId: `svc-${seq}`,
    category: "laceration",
    serviceCode: "laceration",
    status: "AVAILABLE",
    waitBucket: "UNKNOWN",
    validUntil: at(30),
    updatedAt: at(-5),
    reopenAt: null,
    version: 1,
    ...over,
  };
}

describe("접기 우선순위", () => {
  it("순서가 CLOSED > PAUSED > LIMITED > UNKNOWN > AVAILABLE 이다", () => {
    expect(FOLD_PRIORITY).toEqual(["CLOSED", "PAUSED", "LIMITED", "UNKNOWN", "AVAILABLE"]);
  });

  it("3항목 중 하나가 CLOSED → 대표 CLOSED", () => {
    const rep = foldRepresentative(
      [
        svc({ category: "laceration", status: "AVAILABLE" }),
        svc({ category: "burn", status: "CLOSED" }),
        svc({ category: "other", status: "AVAILABLE" }),
      ],
      NOW,
    );
    expect(rep.status).toBe("CLOSED");
    expect(rep.source?.category).toBe("burn");
  });

  it("3항목 중 하나가 LIMITED, 나머지 AVAILABLE → 대표 LIMITED", () => {
    const rep = foldRepresentative(
      [
        svc({ status: "AVAILABLE" }),
        svc({ category: "burn", status: "LIMITED" }),
        svc({ category: "other", status: "AVAILABLE" }),
      ],
      NOW,
    );
    expect(rep.status).toBe("LIMITED");
    expect(rep.source?.category).toBe("burn");
  });

  it("전부 AVAILABLE → 대표 AVAILABLE", () => {
    const rep = foldRepresentative(
      [svc({ status: "AVAILABLE" }), svc({ status: "AVAILABLE" }), svc({ status: "AVAILABLE" })],
      NOW,
    );
    expect(rep.status).toBe("AVAILABLE");
  });

  it("전부 미설정 → 대표 UNKNOWN", () => {
    const rep = foldRepresentative(
      [
        svc({ status: null, validUntil: null, updatedAt: null }),
        svc({ status: null, validUntil: null, updatedAt: null }),
      ],
      NOW,
    );
    expect(rep.status).toBe("UNKNOWN");
  });

  it("★ 빈 목록(hospital_services 행 자체가 없음) → UNKNOWN. AVAILABLE 로 떨어지지 않는다", () => {
    const rep = foldRepresentative([], NOW);
    expect(rep.status).toBe("UNKNOWN");
    expect(rep.status).not.toBe("AVAILABLE");
    expect(rep.source).toBeNull();
  });

  it("★ AVAILABLE 하나 + 미설정 하나 → 대표 UNKNOWN (모르는 항목이 있으면 가능이라 말하지 않는다)", () => {
    const rep = foldRepresentative(
      [svc({ status: "AVAILABLE" }), svc({ category: "burn", status: null, validUntil: null })],
      NOW,
    );
    expect(rep.status).toBe("UNKNOWN");
  });

  it("PAUSED 가 LIMITED 를 이긴다", () => {
    expect(
      foldRepresentative([svc({ status: "LIMITED" }), svc({ status: "PAUSED" })], NOW).status,
    ).toBe("PAUSED");
  });

  it("CLOSED 가 PAUSED 를 이긴다", () => {
    expect(
      foldRepresentative([svc({ status: "PAUSED" }), svc({ status: "CLOSED" })], NOW).status,
    ).toBe("CLOSED");
  });

  it("항목 순서가 결과를 바꾸지 않는다", () => {
    const items = [svc({ status: "AVAILABLE" }), svc({ status: "CLOSED" }), svc({ status: "LIMITED" })];
    const a = foldRepresentative(items, NOW).status;
    const b = foldRepresentative([...items].reverse(), NOW).status;
    expect(a).toBe(b);
    expect(a).toBe("CLOSED");
  });

  it("항목이 하나뿐이면 그 상태가 대표다", () => {
    for (const s of ["AVAILABLE", "LIMITED", "CLOSED", "PAUSED"] as const) {
      expect(foldRepresentative([svc({ status: s })], NOW).status).toBe(s);
    }
  });
});

describe("만료는 읽는 시점에 판정한다", () => {
  it("만료된 항목은 저장값이 무엇이든 UNKNOWN 이다", () => {
    for (const s of ["AVAILABLE", "LIMITED", "CLOSED", "PAUSED"] as const) {
      expect(effectiveStatusOf(svc({ status: s, validUntil: at(-1) }), NOW)).toBe("UNKNOWN");
    }
  });

  it("경계(now === valid_until)도 만료다", () => {
    expect(effectiveStatusOf(svc({ validUntil: NOW.toISOString() }), NOW)).toBe("UNKNOWN");
  });

  it("★ 만료된 AVAILABLE 이 하나라도 있으면 대표가 AVAILABLE 이 아니다", () => {
    const rep = foldRepresentative(
      [svc({ status: "AVAILABLE" }), svc({ status: "AVAILABLE", validUntil: at(-1) })],
      NOW,
    );
    expect(rep.status).toBe("UNKNOWN");
  });

  it("만료된 CLOSED 는 CLOSED 로 남지 않는다 — 모름이다", () => {
    const rep = foldRepresentative([svc({ status: "CLOSED", validUntil: at(-1) })], NOW);
    expect(rep.status).toBe("UNKNOWN");
  });

  it("시간이 지나면 같은 목록의 대표가 바뀐다 (클라이언트 타이머를 믿지 않는다)", () => {
    const items = [svc({ status: "AVAILABLE", validUntil: at(10) })];
    expect(foldRepresentative(items, NOW).status).toBe("AVAILABLE");
    expect(foldRepresentative(items, new Date(NOW.getTime() + 11 * 60_000)).status).toBe("UNKNOWN");
  });
});

describe("기존 화면으로 가는 다리", () => {
  it("5값 → 옛 4값 매핑", () => {
    const map = { AVAILABLE: "normal", LIMITED: "partial", PAUSED: "paused", CLOSED: "difficult" } as const;
    for (const [neu, old] of Object.entries(map)) {
      const legacy = representativeLiveStatus(
        "h_001",
        [svc({ status: neu as "AVAILABLE" })],
        NOW,
      );
      expect(legacy?.status).toBe(old);
    }
  });

  it("UNKNOWN 은 null 로 내린다 — 화면은 '현재 상태 확인 필요'를 그린다", () => {
    const legacy = representativeLiveStatus("h_001", [], NOW);
    expect(legacy).toBeNull();
    expect(describeStatus(legacy, NOW).text).toBe("현재 상태 확인 필요");
  });

  it("★ 접힌 대표가 화면 문구로 이어진다 — 봉합 가능 + 화상 마감이 '진료 가능'으로 보이지 않는다", () => {
    const legacy = representativeLiveStatus(
      "h_001",
      [
        svc({ category: "laceration", status: "AVAILABLE" }),
        svc({ category: "burn", status: "CLOSED" }),
      ],
      NOW,
    );
    const shown = describeStatus(legacy, NOW);
    expect(shown.text).not.toContain("진료 가능");
    expect(shown.tone).not.toBe("confirmed");
  });

  it("재개 예정 시각은 PAUSED 에서만 넘어간다", () => {
    const paused = representativeLiveStatus("h_001", [svc({ status: "PAUSED", reopenAt: at(20) })], NOW);
    expect(paused?.expectedResumeAt).toBe(at(20));
    const limited = representativeLiveStatus("h_001", [svc({ status: "LIMITED", reopenAt: at(20) })], NOW);
    expect(limited?.expectedResumeAt).toBeNull();
  });

  it("확인시각·만료시각은 대표를 결정한 항목에서 가져온다", () => {
    const source = svc({ category: "burn", status: "CLOSED", updatedAt: at(-9), validUntil: at(40) });
    const legacy = representativeLiveStatus("h_001", [svc({ status: "AVAILABLE" }), source], NOW);
    expect(legacy?.verifiedAt).toBe(at(-9));
    expect(legacy?.expiresAt).toBe(at(40));
  });

  it("파생물이라 capabilityId 를 억지로 매핑하지 않는다", () => {
    const legacy = representativeLiveStatus("h_001", [svc({ status: "AVAILABLE" })], NOW);
    expect(legacy?.capabilityId).toBeNull();
    expect(legacy?.verifiedBy).toBe("hospital");
  });

  it("source 가 없으면 null 이다 (빈 목록)", () => {
    expect(toLegacyLiveStatus("h_001", { status: "AVAILABLE", source: null })).toBeNull();
  });
});

describe("이행 기간 병합 — 새 출처 + 옛 출처", () => {
  const legacy = (status: "normal" | "partial" | "paused" | "difficult"): HospitalLiveStatus => ({
    hospitalId: "h_001",
    capabilityId: null,
    status,
    reasonCode: null,
    customReason: null,
    detailText: null,
    startsAt: null,
    expectedResumeAt: null,
    recheckAt: null,
    verifiedBy: "hospital",
    verifiedAt: at(-5),
    expiresAt: at(30),
  });

  const rep = (s: "AVAILABLE" | "LIMITED" | "CLOSED" | "PAUSED") =>
    representativeLiveStatus("h_001", [svc({ status: s })], NOW);

  it("둘 다 없으면 없음", () => {
    expect(mergeConservative(null, null)).toBeNull();
  });

  it("한쪽만 있으면 그쪽", () => {
    expect(mergeConservative(rep("AVAILABLE"), null)?.status).toBe("normal");
    expect(mergeConservative(null, legacy("difficult"))?.status).toBe("difficult");
  });

  it("★ 새 출처가 마감이면 옛 정상을 이긴다", () => {
    expect(mergeConservative(rep("CLOSED"), legacy("normal"))?.status).toBe("difficult");
  });

  it("★ 옛 출처가 마감이면 새 가능을 이긴다", () => {
    expect(mergeConservative(rep("AVAILABLE"), legacy("difficult"))?.status).toBe("difficult");
  });

  it("★ 어느 조합에서도 두 입력보다 낙관적인 답이 나오지 않는다", () => {
    const rank = { difficult: 0, paused: 1, partial: 2, normal: 3 } as const;
    const news = ["AVAILABLE", "LIMITED", "PAUSED", "CLOSED"] as const;
    const olds = ["normal", "partial", "paused", "difficult"] as const;
    for (const n of news) {
      for (const o of olds) {
        const merged = mergeConservative(rep(n), legacy(o));
        const worst = Math.max(rank[rep(n)!.status], rank[o]);
        expect(rank[merged!.status]).toBeGreaterThanOrEqual(0);
        expect(rank[merged!.status]).toBeLessThanOrEqual(worst);
      }
    }
  });

  it("같은 등급이면 새 출처를 쓴다 (이행 방향)", () => {
    const merged = mergeConservative(rep("AVAILABLE"), legacy("normal"));
    expect(merged?.capabilityId).toBeNull();
    expect(merged?.expiresAt).toBe(at(30));
  });

  it("미게시(UNKNOWN)는 병원이 직접 누른 옛 값을 덮지 않는다 — 의도된 예외", () => {
    // 항목이 있지만 아무도 안 눌렀다 → rep 은 null. 옛 값이 그대로 보인다.
    const unposted = representativeLiveStatus(
      "h_001",
      [svc({ status: null, validUntil: null, updatedAt: null })],
      NOW,
    );
    expect(unposted).toBeNull();
    expect(mergeConservative(unposted, legacy("normal"))?.status).toBe("normal");
  });
});
