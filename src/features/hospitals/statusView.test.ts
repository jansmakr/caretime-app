import { describe, expect, it } from "vitest";
import {
  URGENCY_MINUTES,
  deriveDisplayUrgency,
  deriveStatusView,
} from "@/features/hospitals/statusView";
import type {
  HospitalLiveStatus,
  HospitalServiceStatus,
  HospitalView,
} from "@/features/hospitals/types";

/**
 * 시간 판정의 기준 시각을 못박는다.
 *
 * 고치기 전 결함: HospitalCard 가 isExpired·describeStatus·getFreshness 를 now 없이
 * 불렀다. 호출마다 new Date() 가 새로 생겨서
 *   - 한 카드 안에서 만료 판정과 "N분 전"이 다른 시각으로 계산되고
 *   - 같은 병원이 목록에선 "12분 전", 상세에선 "13분 전"이 되고
 *   - 서버 렌더와 하이드레이션 사이에 분이 넘어가면 문구가 어긋났다.
 *
 * 그래서 두 화면이 같은 함수를 쓰게 만들었고, now 는 인자다(기본값 없음).
 * 아래 테스트는 "같은 입력 → 같은 출력"과 "now 하나가 전부를 지배한다"를 고정한다.
 */

const NOW = new Date("2026-09-29T12:00:00Z");
const at = (mins: number) => new Date(NOW.getTime() + mins * 60_000).toISOString();

function liveStatus(over: Partial<HospitalLiveStatus> = {}): HospitalLiveStatus {
  return {
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
    verifiedAt: at(-12),
    expiresAt: at(30),
    ...over,
  };
}

function hospital(over: Partial<HospitalView> = {}): HospitalView {
  return {
    id: "h_001",
    publicData: {
      hpid: "A0001",
      name: "가상병원",
      address: "서울",
      tel: "02-0000-0000",
      lat: 37.5,
      lng: 127,
      syncedAt: at(-60 * 24),
    },
    distanceKm: 1,
    travelMinutes: 5,
    capabilities: [],
    hours: null,
    liveStatus: liveStatus(),
    services: [],
    contactStatus: null,
    waiting: null,
    incoming: null,
    isParticipating: true,
    ...over,
  };
}

describe("now 는 인자이고, 하나뿐이다", () => {
  it("같은 병원·같은 now 면 결과가 완전히 같다 (목록 = 상세)", () => {
    const h = hospital();
    // 두 화면은 각자 자기 now 를 만들지만, 같은 값이면 같은 문구가 나와야 한다.
    expect(deriveStatusView(h, NOW)).toEqual(deriveStatusView(h, new Date(NOW)));
  });

  it("★ now 를 1분 뒤로 옮기면 '확인 후 경과'가 정확히 1분 늘어난다", () => {
    const h = hospital();
    const a = deriveStatusView(h, NOW);
    const b = deriveStatusView(h, new Date(NOW.getTime() + 60_000));
    expect(a.verifiedMinutesAgo).toBe(12);
    expect(b.verifiedMinutesAgo).toBe(13);
  });

  it("★ 만료 판정과 '분 전'이 같은 now 를 쓴다 — 경계에서 갈라지지 않는다", () => {
    // 만료 직전/직후 1밀리초 차이로 두 값이 동시에 넘어가는지 본다.
    const h = hospital({ liveStatus: liveStatus({ verifiedAt: at(-30), expiresAt: at(0) }) });
    const justBefore = deriveStatusView(h, new Date(NOW.getTime() - 1));
    const justAfter = deriveStatusView(h, NOW);

    expect(justBefore.expired).toBe(false);
    expect(justBefore.verifiedMinutesAgo).toBe(29);
    expect(justAfter.expired).toBe(true);
    expect(justAfter.verifiedMinutesAgo).toBe(30);
  });

  it("호출 시각이 아니라 넘긴 now 로만 판정한다 (실시간 시계를 보지 않는다)", () => {
    // 2000년을 넘기면 실제 현재 시각을 봤다면 만료로 나온다. 인자를 쓰면 만료가 아니다.
    const h = hospital({
      liveStatus: liveStatus({ verifiedAt: "2000-01-01T00:00:00Z", expiresAt: "2000-01-01T01:00:00Z" }),
    });
    // 5분만 지난 시점을 넘긴다. 30분을 넘기면 강도 변화 규칙이 표시를 내려서
    // 이 테스트가 보려는 것(인자를 쓰는가)과 섞인다.
    const v = deriveStatusView(h, new Date("2000-01-01T00:05:00Z"));
    expect(v.expired).toBe(false);
    expect(v.status.text).toBe("확인 당시 진료 가능");
  });
});

describe("만료되면 예정 문구를 쓰지 않는다", () => {
  it("만료 전에는 재개 예정 문구가 나온다", () => {
    const h = hospital({ liveStatus: liveStatus({ status: "paused", expectedResumeAt: at(20) }) });
    expect(deriveStatusView(h, NOW).timePlan).toContain("재개 예정");
  });

  it("만료 후에는 timePlan 이 null 이다", () => {
    const h = hospital({
      liveStatus: liveStatus({ status: "paused", expectedResumeAt: at(20), expiresAt: at(-1) }),
    });
    const v = deriveStatusView(h, NOW);
    expect(v.expired).toBe(true);
    expect(v.timePlan).toBeNull();
    expect(v.status.text).toBe("현재 상태 확인 필요");
  });
});

describe("상태가 없는 병원", () => {
  it("liveStatus 가 없으면 만료로 보고 확인시각도 없다", () => {
    const v = deriveStatusView(hospital({ liveStatus: null }), NOW);
    expect(v.expired).toBe(true);
    expect(v.verifiedMinutesAgo).toBeNull();
    expect(v.verifiedAgo).toBeNull();
    expect(v.status.text).toBe("현재 상태 확인 필요");
  });

  it("공공데이터 동기화 시각은 상태와 무관하게 항상 나온다", () => {
    const v = deriveStatusView(hospital({ liveStatus: null }), NOW);
    expect(v.publicSyncedAgo).toBe("1일 전");
  });
});

/**
 * 강도 변화. 확인 후 경과에 따라 화면이 행동을 얼마나 세게 미는가.
 *
 *   ~10분     normal     지금 그대로
 *   10~30분   callFirst  전화를 주 버튼으로 승격
 *   30분~     callOnly   상태를 "확인 필요"로 내리고 전화가 유일한 주 행동
 *
 * 경계를 테스트로 고정하는 이유: 10분과 30분은 임의의 값이 아니라 "지연이 남아 있는
 * 동안 사람을 보호하는 장치"다. 부등호 하나가 뒤집히면 35분 전 값이 '진료 가능'으로
 * 남는다.
 */
describe("deriveDisplayUrgency — 경계값", () => {
  const withVerifiedAgo = (mins: number) =>
    hospital({ liveStatus: liveStatus({ verifiedAt: at(-mins), expiresAt: at(30) }) });

  it("경계 상수가 10분·30분이다", () => {
    expect(URGENCY_MINUTES.callFirst).toBe(10);
    expect(URGENCY_MINUTES.callOnly).toBe(30);
  });

  it("9분 → normal", () => {
    expect(deriveDisplayUrgency(withVerifiedAgo(9), NOW).level).toBe("normal");
  });

  it("★ 10분 → callFirst (경계는 포함이다)", () => {
    expect(deriveDisplayUrgency(withVerifiedAgo(10), NOW).level).toBe("callFirst");
  });

  it("29분 → callFirst", () => {
    expect(deriveDisplayUrgency(withVerifiedAgo(29), NOW).level).toBe("callFirst");
  });

  it("★ 30분 → callOnly (경계는 포함이다)", () => {
    expect(deriveDisplayUrgency(withVerifiedAgo(30), NOW).level).toBe("callOnly");
  });

  it("31분 → callOnly", () => {
    expect(deriveDisplayUrgency(withVerifiedAgo(31), NOW).level).toBe("callOnly");
  });

  it("★ 만료 → callOnly (경과 분이 적어도 만료가 먼저다)", () => {
    // 1분 전에 확인했지만 만료 시각이 이미 지난 경우.
    const h = hospital({ liveStatus: liveStatus({ verifiedAt: at(-1), expiresAt: at(-1) }) });
    expect(deriveDisplayUrgency(h, NOW).level).toBe("callOnly");
  });

  it("상태가 아예 없으면 callOnly", () => {
    expect(deriveDisplayUrgency(hospital({ liveStatus: null }), NOW).level).toBe("callOnly");
  });
});

describe("전화문의 어려움 — 전화를 주 버튼으로 올리지 않는다", () => {
  const contact = (status: "available" | "busy" | "difficult") => ({
    hospitalId: "h_001",
    status,
    customNote: null,
    verifiedAt: at(-5),
  });

  it("difficult 이면 callDiscouraged 가 켜진다", () => {
    const h = hospital({ contactStatus: contact("difficult") });
    expect(deriveDisplayUrgency(h, NOW).callDiscouraged).toBe(true);
  });

  it("★ 강도가 가장 셀 때도 callDiscouraged 는 따로 남는다 — 화면이 둘을 같이 본다", () => {
    const h = hospital({
      liveStatus: liveStatus({ verifiedAt: at(-90), expiresAt: at(-1) }),
      contactStatus: contact("difficult"),
    });
    const u = deriveDisplayUrgency(h, NOW);
    expect(u.level).toBe("callOnly");
    expect(u.callDiscouraged).toBe(true);
  });

  it("통화량 많음·전화문의 가능은 막지 않는다", () => {
    expect(deriveDisplayUrgency(hospital({ contactStatus: contact("busy") }), NOW).callDiscouraged).toBe(
      false,
    );
    expect(
      deriveDisplayUrgency(hospital({ contactStatus: contact("available") }), NOW).callDiscouraged,
    ).toBe(false);
  });

  it("상태 정보가 없으면 막지 않는다 (없음을 어려움으로 읽지 않는다)", () => {
    expect(deriveDisplayUrgency(hospital({ contactStatus: null }), NOW).callDiscouraged).toBe(false);
  });
});

describe("30분 규칙은 표시 계층에서만 내린다", () => {
  it("★ 저장된 상태는 그대로다. 내리는 것은 status 문구뿐이다", () => {
    const stored = liveStatus({ status: "normal", verifiedAt: at(-35), expiresAt: at(20) });
    const h = hospital({ liveStatus: stored });
    const v = deriveStatusView(h, NOW);

    expect(v.status.text).toBe("현재 상태 확인 필요");
    expect(v.downgraded).toBe(true);
    expect(v.expired).toBe(false); // 실제로 만료된 것은 아니다

    // 원본은 건드리지 않았다. 병원이 누른 값과 저장된 값이 달라지지 않는다.
    expect(h.liveStatus?.status).toBe("normal");
    expect(h.liveStatus).toBe(stored);
    expect(stored.expiresAt).toBe(at(20));
  });

  it("29분에는 내리지 않는다 — 원래 문구가 그대로 나온다", () => {
    const h = hospital({ liveStatus: liveStatus({ verifiedAt: at(-29), expiresAt: at(20) }) });
    const v = deriveStatusView(h, NOW);
    expect(v.downgraded).toBe(false);
    expect(v.status.text).toBe("확인 당시 진료 가능");
  });

  it("내릴 때 예정 문구도 같이 내린다", () => {
    const h = hospital({
      liveStatus: liveStatus({
        status: "paused",
        expectedResumeAt: at(20),
        verifiedAt: at(-35),
        expiresAt: at(20),
      }),
    });
    const v = deriveStatusView(h, NOW);
    expect(v.timePlan).toBeNull();
  });

  it("확인시각은 계속 보여줄 수 있다 — 왜 확인 필요인지 설명하는 값이다", () => {
    const h = hospital({ liveStatus: liveStatus({ verifiedAt: at(-35), expiresAt: at(20) }) });
    const v = deriveStatusView(h, NOW);
    expect(v.verifiedAgo).toBe("35분 전");
  });

  it("만료는 downgraded 가 아니다 — 두 이유를 구분한다", () => {
    const h = hospital({ liveStatus: liveStatus({ verifiedAt: at(-35), expiresAt: at(-1) }) });
    const v = deriveStatusView(h, NOW);
    expect(v.expired).toBe(true);
    expect(v.downgraded).toBe(false);
  });
});

/**
 * 권할 행동이 없는 상태.
 *
 * 믿을 상태도 없고(callOnly) 전화도 어렵다(callDiscouraged). 이때 주 버튼을 억지로
 * 만들면 그게 거짓이다 — "목록으로"는 사용자를 밀어내기만 하고 답을 주지 않는다.
 * 그래서 상태 자리에 사실을 적고, 무게가 같은 선택지 둘을 둔다.
 */
describe("noGuidance — 권할 행동이 없을 때", () => {
  const hardToCall = {
    hospitalId: "h_001",
    status: "difficult" as const,
    customNote: null,
    verifiedAt: at(-5),
  };

  it("★ 상태가 오래됐고 전화도 어려우면 noGuidance 다", () => {
    const h = hospital({
      liveStatus: liveStatus({ verifiedAt: at(-35), expiresAt: at(20) }),
      contactStatus: hardToCall,
    });
    expect(deriveStatusView(h, NOW).noGuidance).toBe(true);
  });

  it("★ 그때 상태 문구는 '확인 필요'가 아니라 '확인된 정보가 없습니다'다", () => {
    const h = hospital({
      liveStatus: liveStatus({ verifiedAt: at(-35), expiresAt: at(20) }),
      contactStatus: hardToCall,
    });
    // "확인 필요"는 사용자가 할 일이 있다는 뜻이다. 전화가 어려우면 할 일이 없다.
    expect(deriveStatusView(h, NOW).status.text).toBe("확인된 정보가 없습니다");
  });

  it("상태가 아직 싱싱하면 noGuidance 가 아니다 — 전화는 안 권하지만 답은 있다", () => {
    const h = hospital({
      liveStatus: liveStatus({ verifiedAt: at(-5), expiresAt: at(20) }),
      contactStatus: hardToCall,
    });
    const v = deriveStatusView(h, NOW);
    expect(v.noGuidance).toBe(false);
    expect(v.status.text).toBe("확인 당시 진료 가능");
    expect(v.urgency.callDiscouraged).toBe(true);
  });

  it("전화가 가능하면 오래돼도 noGuidance 가 아니다 — 시킬 일이 있다", () => {
    const h = hospital({
      liveStatus: liveStatus({ verifiedAt: at(-35), expiresAt: at(20) }),
      contactStatus: { ...hardToCall, status: "busy" as const },
    });
    const v = deriveStatusView(h, NOW);
    expect(v.noGuidance).toBe(false);
    expect(v.status.text).toBe("현재 상태 확인 필요");
  });

  it("만료 + 전화 어려움도 noGuidance 다", () => {
    const h = hospital({
      liveStatus: liveStatus({ verifiedAt: at(-90), expiresAt: at(-1) }),
      contactStatus: hardToCall,
    });
    expect(deriveStatusView(h, NOW).noGuidance).toBe(true);
  });

  it("여기서도 저장값은 그대로다", () => {
    const stored = liveStatus({ status: "normal", verifiedAt: at(-35), expiresAt: at(20) });
    const h = hospital({ liveStatus: stored, contactStatus: hardToCall });
    deriveStatusView(h, NOW);
    expect(h.liveStatus).toBe(stored);
    expect(stored.status).toBe("normal");
  });
});

/**
 * 항목별 표시.
 *
 * 접기 규칙이 보수적인 것은 맞다(화상 마감 → 병원 대표 마감). 그런데 그것만 보여 주면
 * 보호자에게 "여기는 안 된다"로만 읽혀 **갈 수 있는 병원을 놓친다.** 봉합은 되는데
 * 화상만 안 되는 병원이 야간의 일상이다. 그래서 카드에 한 줄이 필요하다.
 */
function svc(
  category: "laceration" | "burn" | "other",
  status: "AVAILABLE" | "LIMITED" | "PAUSED" | "CLOSED" | null,
  over: Partial<HospitalServiceStatus> = {},
): HospitalServiceStatus {
  return {
    serviceId: `svc-${category}`,
    category,
    serviceCode: category,
    status,
    waitBucket: "UNKNOWN",
    validUntil: status === null ? null : at(30),
    updatedAt: status === null ? null : at(-5),
    reopenAt: null,
    version: null,
    ...over,
  };
}

describe("카드 한 줄 — 일부 항목만 가능", () => {
  it("★ 대표가 마감이어도 가능한 항목이 있으면 알린다", () => {
    const h = hospital({
      liveStatus: null,
      services: [svc("laceration", "AVAILABLE"), svc("burn", "CLOSED")],
    });
    const v = deriveStatusView(h, NOW);
    expect(v.breakdown.partiallyOpen).toBe(true);
  });

  it("★ 대표가 일부 제한이어도 가능한 항목이 있으면 알린다", () => {
    const h = hospital({
      liveStatus: null,
      services: [svc("laceration", "AVAILABLE"), svc("burn", "LIMITED")],
    });
    expect(deriveStatusView(h, NOW).breakdown.partiallyOpen).toBe(true);
  });

  it("대표가 잠시 중단이어도 마찬가지다 — 막혀 보이는 것은 같다", () => {
    const h = hospital({
      liveStatus: null,
      services: [svc("laceration", "AVAILABLE"), svc("burn", "PAUSED")],
    });
    expect(deriveStatusView(h, NOW).breakdown.partiallyOpen).toBe(true);
  });

  it("전부 가능이면 알릴 것이 없다 — 대표가 이미 가능이다", () => {
    const h = hospital({
      liveStatus: null,
      services: [svc("laceration", "AVAILABLE"), svc("burn", "AVAILABLE")],
    });
    expect(deriveStatusView(h, NOW).breakdown.partiallyOpen).toBe(false);
  });

  it("전부 마감이면 알릴 것이 없다", () => {
    const h = hospital({
      liveStatus: null,
      services: [svc("laceration", "CLOSED"), svc("burn", "CLOSED")],
    });
    expect(deriveStatusView(h, NOW).breakdown.partiallyOpen).toBe(false);
  });

  it("★ 대표가 '모름'일 때는 알리지 않는다 — 나머지를 아는 척하게 된다", () => {
    // 미게시 항목이 있으면 접기 결과가 UNKNOWN 이다.
    const h = hospital({
      liveStatus: null,
      services: [svc("laceration", "AVAILABLE"), svc("burn", null)],
    });
    const v = deriveStatusView(h, NOW);
    expect(v.status.text).toBe("현재 상태 확인 필요");
    expect(v.breakdown.partiallyOpen).toBe(false);
  });

  it("만료된 '가능'은 가능으로 세지 않는다", () => {
    const h = hospital({
      liveStatus: null,
      services: [
        svc("laceration", "AVAILABLE", { validUntil: at(-1) }),
        svc("burn", "CLOSED"),
      ],
    });
    expect(deriveStatusView(h, NOW).breakdown.partiallyOpen).toBe(false);
  });
});

describe("상세 항목 목록 — 그릴 값이 있을 때만", () => {
  it("★ 전부 같은 상태면 목록을 그리지 않는다", () => {
    const h = hospital({
      services: [svc("laceration", "AVAILABLE"), svc("burn", "AVAILABLE")],
    });
    expect(deriveStatusView(h, NOW).breakdown.lines).toEqual([]);
  });

  it("★ 항목이 하나뿐이면 목록을 그리지 않는다", () => {
    const h = hospital({ services: [svc("laceration", "CLOSED")] });
    expect(deriveStatusView(h, NOW).breakdown.lines).toEqual([]);
  });

  it("항목이 없으면 목록을 그리지 않는다", () => {
    expect(deriveStatusView(hospital({ services: [] }), NOW).breakdown.lines).toEqual([]);
  });

  it("★ 상태가 갈리면 항목별로 그린다", () => {
    const h = hospital({
      services: [svc("laceration", "AVAILABLE"), svc("burn", "CLOSED"), svc("other", null)],
    });
    const lines = deriveStatusView(h, NOW).breakdown.lines;
    expect(lines).toHaveLength(3);
    expect(lines.map((l) => `${l.label} ${l.statusText}`)).toEqual([
      "찢어진 상처 가능",
      "화상 마감",
      "그 밖의 상황 확인 필요",
    ]);
  });

  it("만료된 항목은 '확인 필요'로 그린다", () => {
    const h = hospital({
      services: [svc("laceration", "AVAILABLE"), svc("burn", "CLOSED", { validUntil: at(-1) })],
    });
    const lines = deriveStatusView(h, NOW).breakdown.lines;
    expect(lines.find((l) => l.category === "burn")?.statusText).toBe("확인 필요");
  });
});
