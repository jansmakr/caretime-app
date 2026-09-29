import { describe, expect, it } from "vitest";
import { deriveStatusView } from "@/features/hospitals/statusView";
import type { HospitalView, HospitalLiveStatus } from "@/features/hospitals/types";

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
    const v = deriveStatusView(h, new Date("2000-01-01T00:30:00Z"));
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
