import { describe, expect, it } from "vitest";
import {
  confirmSameAsYesterday,
  describeExceptions,
  foldPartnerStatuses,
  nextRecheckMinutes,
  serviceExceptions,
  setServiceStatus,
  setTodayMode,
} from "@/features/partner/service";
import type { PartnerState, PartnerServiceStatus } from "@/features/partner/types";
import type { LiveStatusCode } from "@/features/hospitals/types";

/**
 * 항목별 예외 입력.
 *
 * 이 화면의 전부는 **다음 날**에 있다. 예외를 만든 병원도 다음 날은 버튼 하나로
 * 끝나야 한다. 예외 비용이 처음 한 번이고 그 뒤로 1탭으로 돌아오는 것 — 그게 깨지면
 * 나머지가 아무리 좋아도 병원이 안 쓴다. 이 서비스는 병원이 눌러야 데이터가 생긴다.
 */

const NOW = new Date("2026-09-29T12:00:00Z");
const at = (mins: number) => new Date(NOW.getTime() + mins * 60_000).toISOString();

function service(
  category: "laceration" | "burn" | "other",
  status: LiveStatusCode = "normal",
  expiresAt: string | null = null,
): PartnerServiceStatus {
  return { serviceId: `svc-${category}`, category, status, expiresAt };
}

function state(over: Partial<PartnerState> = {}): PartnerState {
  return {
    hospitalId: "h_001",
    mode: null,
    liveStatus: {
      hospitalId: "h_001",
      capabilityId: null,
      status: "normal",
      reasonCode: null,
      customReason: null,
      detailText: null,
      startsAt: null,
      expectedResumeAt: null,
      recheckAt: null,
      verifiedBy: "hospital",
      verifiedAt: at(-600),
      expiresAt: at(-540),
    },
    hours: {
      hospitalId: "h_001",
      regularOpenAt: at(-300),
      regularCloseAt: at(300),
      todayCloseAt: null,
      lastAdmissionAt: null,
      admissionConfirmed: false,
      todayNote: null,
      verifiedBy: "hospital",
      verifiedAt: at(-600),
    },
    contact: { hospitalId: "h_001", status: "available", customNote: null, verifiedAt: at(-60) },
    waiting: { hospitalId: "h_001", level: "normal", headcount: 0, verifiedAt: at(-60) },
    services: [service("laceration"), service("burn"), service("other")],
    yesterday: {
      status: "normal",
      reasonCode: null,
      customReason: null,
      detailText: null,
      lastAdmissionClock: null,
      services: {},
    },
    ...over,
  };
}

describe("주 버튼 하나로 저장이 끝난다 (1탭)", () => {
  it("★ 접힌 상태에서 주 버튼만 눌러도 모든 항목에 값이 들어간다", () => {
    const next = setTodayMode(state(), "difficult", NOW);

    // 저장되는 실체는 항목값이다. 세 항목 모두 채워져야 저장이 끝난 것이다.
    expect(next.services).toHaveLength(3);
    expect(next.services.every((s) => s.status === "difficult")).toBe(true);
    expect(next.liveStatus.status).toBe("difficult");
  });

  it("★ 그때 예외가 없으므로 요약 줄이 나오지 않는다", () => {
    const next = setTodayMode(state(), "limited", NOW);
    expect(serviceExceptions(next)).toEqual([]);
    expect(describeExceptions(next)).toBeNull();
  });

  it("★ 항목별 화면을 열었을 때 기본값이 주 버튼에서 누른 값이다", () => {
    const next = setTodayMode(state(), "limited", NOW);
    for (const svc of next.services) {
      expect(svc.status).toBe("partial");
    }
  });
});

describe("예외 만들기", () => {
  it("★ 전체 어려움 + 봉합만 가능 — 허용한다", () => {
    /*
     * 실제로 있는 상황이다. 야간에 갈리는 것은 대개 항목별 인력·장비다 —
     * 화상 처치 장비가 고장났거나 담당 전문의가 없으면 화상만 막힌다.
     * 막으면 병원은 표현할 방법이 없어 전체 어려움으로만 적고 봉합 환자를 놓치거나,
     * 반대로 전체 가능으로 거짓 입력한다. 후자가 더 나쁘다.
     */
    const pressed = setTodayMode(state(), "difficult", NOW);
    const next = setServiceStatus(pressed, "svc-laceration", "normal", NOW);

    expect(next.services.find((s) => s.category === "laceration")?.status).toBe("normal");
    // 대표는 여전히 어려움이다. 보수적 접기는 그대로다.
    expect(next.liveStatus.status).toBe("difficult");
    expect(next.mode).toBe("difficult");
  });

  it("요약 줄이 예외를 읽어 준다 — 병원 말로", () => {
    const pressed = setTodayMode(state(), "difficult", NOW);
    const next = setServiceStatus(pressed, "svc-burn", "normal", NOW);
    // 병원 화면이므로 "열상"이 맞다. 보호자 화면은 다른 표를 쓴다.
    expect(describeExceptions(next)).toBe("화상만 진료 가능");
  });

  it("예외가 여럿이고 상태가 서로 다르면 항목 이름만 알린다", () => {
    const pressed = setTodayMode(state(), "difficult", NOW);
    const one = setServiceStatus(pressed, "svc-burn", "normal", NOW);
    const two = setServiceStatus(one, "svc-other", "partial", NOW);
    expect(describeExceptions(two)).toBe("화상 · 기타 따로 설정됨");
  });

  it("접기 규칙은 보호자 쪽과 같은 순서를 쓴다", () => {
    expect(foldPartnerStatuses(["normal", "difficult"])).toBe("difficult");
    expect(foldPartnerStatuses(["normal", "paused"])).toBe("paused");
    expect(foldPartnerStatuses(["normal", "partial"])).toBe("partial");
    expect(foldPartnerStatuses(["difficult", "paused"])).toBe("difficult");
    expect(foldPartnerStatuses(["normal", "normal"])).toBe("normal");
  });
});

describe("다음 날 — 여기가 전부다", () => {
  it("★ 예외를 만든 다음 날 '어제와 동일'을 누르면 예외가 그대로 재현된다", () => {
    const yesterday = {
      status: "difficult" as LiveStatusCode,
      reasonCode: null,
      customReason: null,
      detailText: null,
      lastAdmissionClock: null,
      // 어제: 전체 어려움 + 봉합만 가능
      services: {
        "svc-laceration": "normal" as LiveStatusCode,
        "svc-burn": "difficult" as LiveStatusCode,
        "svc-other": "difficult" as LiveStatusCode,
      },
    };
    const today = state({ yesterday, services: [service("laceration"), service("burn"), service("other")] });

    const next = confirmSameAsYesterday(today, NOW);

    expect(next.services.find((s) => s.category === "laceration")?.status).toBe("normal");
    expect(next.services.find((s) => s.category === "burn")?.status).toBe("difficult");
    expect(next.services.find((s) => s.category === "other")?.status).toBe("difficult");
    // 예외가 살아 있으므로 요약 줄도 어제처럼 나온다.
    expect(describeExceptions(next)).toBe("열상만 진료 가능");
    // 버튼 한 번이면 끝이다.
    expect(next.mode).toBe("same_as_yesterday");
  });

  it("어제 기록이 없는 항목은 어제의 병원 전체 값을 쓴다", () => {
    const yesterday = {
      status: "partial" as LiveStatusCode,
      reasonCode: null,
      customReason: null,
      detailText: null,
      lastAdmissionClock: null,
      services: { "svc-burn": "difficult" as LiveStatusCode },
    };
    const next = confirmSameAsYesterday(state({ yesterday }), NOW);

    expect(next.services.find((s) => s.category === "burn")?.status).toBe("difficult");
    expect(next.services.find((s) => s.category === "laceration")?.status).toBe("partial");
  });

  it("어제 예외가 없었으면 오늘도 예외가 없다", () => {
    const yesterday = {
      status: "normal" as LiveStatusCode,
      reasonCode: null,
      customReason: null,
      detailText: null,
      lastAdmissionClock: null,
      services: {},
    };
    const next = confirmSameAsYesterday(state({ yesterday }), NOW);
    expect(describeExceptions(next)).toBeNull();
    expect(next.services.every((s) => s.status === "normal")).toBe(true);
  });
});

describe("다시 눌러야 하는 시각 — 가장 이른 것 하나", () => {
  it("★ 만료가 여럿이면 가장 이른 것만 알린다", () => {
    const next = state({
      services: [
        service("laceration", "normal", at(45)),
        service("burn", "difficult", at(12)),
        service("other", "normal", at(30)),
      ],
    });
    expect(nextRecheckMinutes(next, NOW)).toBe(12);
  });

  it("아직 누르지 않은 항목뿐이면 알릴 것이 없다", () => {
    expect(nextRecheckMinutes(state(), NOW)).toBeNull();
  });

  it("이미 지난 만료는 세지 않는다 — 그건 '다시 눌러주세요'가 아니라 이미 지난 일이다", () => {
    const next = state({
      services: [service("laceration", "normal", at(-5)), service("burn", "normal", at(20))],
    });
    expect(nextRecheckMinutes(next, NOW)).toBe(20);
  });

  it("전부 지났으면 null 이다", () => {
    const next = state({ services: [service("laceration", "normal", at(-5))] });
    expect(nextRecheckMinutes(next, NOW)).toBeNull();
  });
});
