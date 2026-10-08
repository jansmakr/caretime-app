import { describe, expect, it } from "vitest";
import {
  CONFLICT_NOTICE,
  DEFAULT_VALID_FOR_MINUTES,
  MAX_CLOSED_VALID_MINUTES,
  MAX_OPEN_VALID_MINUTES,
  STATUS_TEXT,
  STATUS_TONE,
  VALID_FOR_CHOICES_MINUTES,
  canTransition,
  compareInGroup,
  deriveOfficialStatus,
  describeServiceStatus,
  detectConflict,
  isExpiredView,
  maxValidMinutesFor,
  showsReopenAt,
  sortGroupOf,
  validUntilFor,
  type ServiceStatus,
  type StoredStatus,
  type VerificationState,
} from "@/features/p0/status";

/**
 * 공식 상태 계약의 순수 로직. DB 를 타지 않는다.
 *
 * 여기서 고정하려는 것은 두 가지다.
 *  ① 만료된 값이 어떤 경로로도 '접수 가능'으로 나오지 않는다. (PRD §15 출시 보류 항목)
 *  ② LIMITED 가 AVAILABLE 과 섞이지 않는다 — usableNow 아님, 정렬 그룹 1, 재개 시각 없음.
 */

const NOW = new Date("2026-09-28T12:00:00Z");
const at = (mins: number) => new Date(NOW.getTime() + mins * 60_000).toISOString();

const stored = (over: Partial<StoredStatus> = {}): StoredStatus => ({
  status: "AVAILABLE",
  waitBucket: "LE30",
  validUntil: at(30),
  updatedAt: at(0),
  ...over,
});

const derive = (over: Partial<StoredStatus> = {}, verification: VerificationState = "APPROVED") =>
  deriveOfficialStatus({ verificationState: verification, stored: stored(over), now: NOW });

const ALL: ServiceStatus[] = ["AVAILABLE", "LIMITED", "CLOSED", "PAUSED", "UNKNOWN"];

describe("ServiceStatus 5값", () => {
  it("LIMITED 가 PAUSED 와 별개 값이다", () => {
    expect(ALL).toContain("LIMITED");
    expect(ALL).toContain("PAUSED");
    expect(new Set(ALL).size).toBe(5);
  });

  it("문구가 상태마다 다르다 — LIMITED 와 PAUSED 가 같은 말이 아니다", () => {
    expect(STATUS_TEXT.LIMITED).not.toBe(STATUS_TEXT.PAUSED);
    expect(STATUS_TEXT.LIMITED).toContain("일부 제한");
    expect(STATUS_TEXT.PAUSED).toContain("일시 중단");
    // 문구 6개가 모두 서로 달라야 한다(같은 말이면 구분이 사라진다).
    expect(new Set(Object.values(STATUS_TEXT)).size).toBe(Object.keys(STATUS_TEXT).length);
  });

  it("어느 문구도 '진료 가능'이라고 확정하지 않는다", () => {
    for (const text of Object.values(STATUS_TEXT)) {
      expect(text).not.toMatch(/^진료 가능$/);
      expect(text).not.toContain("확정");
      expect(text).not.toContain("보장");
    }
  });

  it("상태색은 4개 안에서만 쓴다", () => {
    const tones = new Set(Object.values(STATUS_TONE));
    for (const tone of tones) expect(["confirmed", "caution", "limited", "unverified"]).toContain(tone);
  });
});

describe("usableNow — AVAILABLE 만", () => {
  it("유효한 AVAILABLE 만 usableNow 다", () => {
    expect(derive({ status: "AVAILABLE" }).usableNow).toBe(true);
  });

  it.each(["LIMITED", "PAUSED", "CLOSED"] as const)("유효한 %s 는 usableNow 가 아니다", (status) => {
    const view = derive({ status, validUntil: at(30) });
    expect(view.reason).toBeNull(); // 만료가 아니라 '유효한' 상태임을 확인
    expect(view.usableNow).toBe(false);
  });
});

describe("정렬 그룹 — 행동 기준", () => {
  it("유효한 AVAILABLE 은 그룹 0", () => {
    expect(sortGroupOf(derive({ status: "AVAILABLE" }))).toBe(0);
  });

  it("LIMITED 는 그룹 1 이다 (AVAILABLE 과 분리)", () => {
    expect(sortGroupOf(derive({ status: "LIMITED" }))).toBe(1);
    expect(sortGroupOf(derive({ status: "LIMITED" }))).not.toBe(
      sortGroupOf(derive({ status: "AVAILABLE" })),
    );
  });

  it("LIMITED · PAUSED · 만료 · 미승인이 같은 그룹이다 — 취할 행동이 같다(전화 확인)", () => {
    const limited = sortGroupOf(derive({ status: "LIMITED" }));
    const paused = sortGroupOf(derive({ status: "PAUSED" }));
    const expired = sortGroupOf(derive({ validUntil: at(-1) }));
    const unverified = sortGroupOf(derive({}, "PENDING"));
    expect([paused, expired, unverified]).toEqual([limited, limited, limited]);
  });

  it("공식 마감은 그룹 2 — 숨기지 않고 맨 아래로만 보낸다", () => {
    expect(sortGroupOf(derive({ status: "CLOSED", validUntil: at(120) }))).toBe(2);
  });

  it("같은 그룹은 거리 → 이름 → id 로 안정 정렬한다", () => {
    const a = { distanceKm: 1, name: "가", id: "a" };
    const b = { distanceKm: 2, name: "나", id: "b" };
    expect(compareInGroup(a, b)).toBeLessThan(0);
    expect(compareInGroup({ ...a, distanceKm: null }, b)).toBeGreaterThan(0);
    expect(compareInGroup({ ...a, id: "a" }, { ...a, id: "b" })).toBeLessThan(0);
  });
});

describe("재개 예정 시각 — PAUSED 에만", () => {
  it("PAUSED 는 재개 시각을 붙인다", () => {
    expect(showsReopenAt("PAUSED")).toBe(true);
    const view = derive({ status: "PAUSED", reopenAt: at(20) });
    expect(describeServiceStatus(view).reopenAt).toBe(at(20));
  });

  it("LIMITED 는 reopen_at 에 값이 있어도 붙이지 않는다", () => {
    expect(showsReopenAt("LIMITED")).toBe(false);
    const view = derive({ status: "LIMITED", reopenAt: at(20) });
    expect(view.reopenAt).toBe(at(20)); // 저장값은 그대로 들고 있다
    expect(describeServiceStatus(view).reopenAt).toBeNull(); // 화면에는 내보내지 않는다
  });

  it.each(["AVAILABLE", "CLOSED", "UNKNOWN", "UNVERIFIED"] as const)(
    "%s 도 재개 시각을 붙이지 않는다",
    (status) => {
      expect(showsReopenAt(status)).toBe(false);
    },
  );

  it("재개 시각이 지나도 자동으로 AVAILABLE 이 되지 않는다", () => {
    const view = derive({ status: "PAUSED", reopenAt: at(-10), validUntil: at(30) });
    expect(view.status).toBe("PAUSED");
    expect(view.usableNow).toBe(false);
  });
});

describe("만료 판정 — 어떤 경로로도 '가능'이 되지 않는다", () => {
  it("now >= valid_until 이면 UNKNOWN(EXPIRED)", () => {
    const view = derive({ validUntil: at(-1) });
    expect(view.status).toBe("UNKNOWN");
    expect(view.reason).toBe("EXPIRED");
    expect(view.usableNow).toBe(false);
    expect(isExpiredView(view)).toBe(true);
  });

  it("경계(now === valid_until)도 만료다", () => {
    expect(derive({ validUntil: NOW.toISOString() }).reason).toBe("EXPIRED");
  });

  it("읽을 수 없는 시각도 만료로 본다", () => {
    expect(derive({ validUntil: "not-a-date" }).reason).toBe("EXPIRED");
  });

  it("만료면 valid_until 을 내보내지 않는다", () => {
    expect(derive({ validUntil: at(-1) }).validUntil).toBeNull();
  });

  it.each(ALL)("%s 상태여도 만료되면 usableNow 가 아니다", (status) => {
    expect(derive({ status, validUntil: at(-1) }).usableNow).toBe(false);
  });

  it("한 번도 게시되지 않았으면 NEVER_SET", () => {
    const view = deriveOfficialStatus({ verificationState: "APPROVED", stored: null, now: NOW });
    expect(view.reason).toBe("NEVER_SET");
    expect(view.usableNow).toBe(false);
  });

  it.each(["PENDING", "UNDER_REVIEW", "NEEDS_INFO", "REJECTED"] as const)(
    "심사 %s 면 UNVERIFIED — 저장값이 AVAILABLE 이어도 내보내지 않는다",
    (verification) => {
      const view = deriveOfficialStatus({
        verificationState: verification,
        stored: stored({ status: "AVAILABLE" }),
        now: NOW,
      });
      expect(view.status).toBe("UNVERIFIED");
      expect(view.usableNow).toBe(false);
    },
  );
});

describe("유효시간 정책", () => {
  it("기본 30분, 선택은 15/30/60", () => {
    expect(DEFAULT_VALID_FOR_MINUTES).toBe(30);
    expect([...VALID_FOR_CHOICES_MINUTES]).toEqual([15, 30, 60]);
  });

  it.each(["AVAILABLE", "LIMITED", "PAUSED"] as const)("%s 는 최대 60분", (status) => {
    expect(maxValidMinutesFor(status)).toBe(MAX_OPEN_VALID_MINUTES);
    expect(validUntilFor(status, 60, NOW).ok).toBe(true);
    expect(validUntilFor(status, 61, NOW).ok).toBe(false);
  });

  it("CLOSED 는 최대 12시간", () => {
    expect(maxValidMinutesFor("CLOSED")).toBe(MAX_CLOSED_VALID_MINUTES);
    expect(validUntilFor("CLOSED", 720, NOW).ok).toBe(true);
    expect(validUntilFor("CLOSED", 721, NOW).ok).toBe(false);
  });

  it("상한 초과를 조용히 자르지 않고 거절한다", () => {
    const result = validUntilFor("AVAILABLE", 999, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_VALID_FOR");
  });

  it("0·음수·NaN 을 거절한다", () => {
    for (const m of [0, -5, Number.NaN]) expect(validUntilFor("AVAILABLE", m, NOW).ok).toBe(false);
  });
});

describe("상태 머신", () => {
  it("UNKNOWN 에서는 AVAILABLE·LIMITED·CLOSED 로만 간다", () => {
    expect(canTransition("UNKNOWN", "AVAILABLE")).toBe(true);
    expect(canTransition("UNKNOWN", "LIMITED")).toBe(true);
    expect(canTransition("UNKNOWN", "CLOSED")).toBe(true);
    expect(canTransition("UNKNOWN", "PAUSED")).toBe(false);
  });

  it("CLOSED 에서 곧바로 PAUSED 로 가지 않는다", () => {
    expect(canTransition("CLOSED", "PAUSED")).toBe(false);
    expect(canTransition("CLOSED", "AVAILABLE")).toBe(true);
    expect(canTransition("CLOSED", "LIMITED")).toBe(true);
  });

  it("LIMITED 는 모든 열린 상태와 오갈 수 있다", () => {
    for (const to of ["AVAILABLE", "LIMITED", "PAUSED", "CLOSED"] as const) {
      expect(canTransition("LIMITED", to)).toBe(true);
    }
  });

  it.each(ALL)("%s → UNKNOWN 은 저장할 수 없다", (from) => {
    expect(canTransition(from, "UNKNOWN")).toBe(false);
  });

  it("같은 값으로의 연장은 허용한다", () => {
    for (const s of ["AVAILABLE", "LIMITED", "PAUSED", "CLOSED"] as const) {
      expect(canTransition(s, s)).toBe(true);
    }
  });
});

describe("공식·제보 충돌", () => {
  it("공식 가능 + 마감 제보 → 충돌", () => {
    expect(
      detectConflict({ official: derive({ status: "AVAILABLE" }), closedReports: 2, openReports: 0 }),
    ).toBe("OFFICIAL_OPEN_VS_REPORTED_CLOSED");
  });

  it("공식 마감 + 가능 제보 → 충돌", () => {
    expect(
      detectConflict({
        official: derive({ status: "CLOSED", validUntil: at(120) }),
        closedReports: 0,
        openReports: 1,
      }),
    ).toBe("OFFICIAL_CLOSED_VS_REPORTED_OPEN");
  });

  it("LIMITED 는 마감 제보와 충돌로 보지 않는다 — 이미 전화 확인을 말하고 있다", () => {
    expect(
      detectConflict({ official: derive({ status: "LIMITED" }), closedReports: 3, openReports: 0 }),
    ).toBeNull();
  });

  it("만료 상태는 충돌이 아니라 미확인이다", () => {
    expect(
      detectConflict({ official: derive({ validUntil: at(-1) }), closedReports: 5, openReports: 5 }),
    ).toBeNull();
  });

  it("문구는 PRD 문장 그대로다", () => {
    expect(CONFLICT_NOTICE).toBe("정보가 서로 달라요. 전화 확인이 필요합니다.");
  });
});
