import { describeStatus, describeTimePlan, formatAgo, getFreshness, isExpired } from "@/lib/freshness";
import type { HospitalView } from "./types";

/**
 * 시간에 따라 달라지는 표시값을 **한 번에, 하나의 now 로** 뽑는다.
 *
 * 왜 함수로 묶는가: 카드(목록)와 상세가 각자 isExpired·describeStatus·getFreshness 를
 * 따로 불렀고, 카드는 now 를 아예 넘기지 않아 호출마다 new Date() 가 새로 생겼다.
 * 그러면 한 카드 안에서도 만료 판정과 "N분 전"이 서로 다른 시각으로 계산되고,
 * 같은 병원이 목록에서 "12분 전", 상세에서 "13분 전"이 된다.
 * 서버 렌더와 하이드레이션 사이에 분이 넘어가면 문구가 어긋나기도 한다.
 *
 * 규칙은 HospitalDetail 이 이미 지키던 것을 그대로 옮긴 것이다 —
 * "모든 시간 판정(만료·마감·N분 전)은 같은 now 하나로 한다."
 *
 * now 는 인자다. 기본값을 주지 않는다. 기본값이 있으면 호출하는 쪽이 넘기지 않아도
 * 조용히 동작해서, 지금 고치는 결함이 그대로 되돌아온다.
 */

/**
 * 확인 후 얼마나 지났는지에 따라 화면이 행동을 얼마나 세게 밀어야 하는가.
 *
 * 왜 필요한가: 지연이 남아 있다. 항목별 상태는 anon 에게 Realtime 이 오지 않고,
 * 화면 복귀 재조회에도 지연 상한이 없다. 그러면 "10분 전 확인"과 "55분 전 확인"이
 * 화면에서 똑같이 생겨서는 안 된다. 원칙 6 은 문구를 늘리지 말고 버튼의 위치와
 * 색으로 행동을 바꾸라고 한다.
 *
 *   ~10분     normal     지금 그대로
 *   10~30분   callFirst  전화를 주 버튼으로 승격
 *   30분~     callOnly   상태를 "확인 필요"로 내리고 전화가 유일한 주 행동
 *
 * 30분에서 상태를 내리는 것은 **표시 계층에서만** 한다. 저장된 값도, 병원이 입력한
 * 값도 고치지 않는다. 그 둘이 달라지면 병원은 자기가 누른 것과 다른 화면을 보게 된다.
 */
export type UrgencyLevel = "normal" | "callFirst" | "callOnly";

export interface DisplayUrgency {
  level: UrgencyLevel;
  /**
   * 병원이 "전화문의 어려움"을 켰다. level 이 무엇이든 전화를 주 버튼으로 올리지 않는다.
   * 기존 규칙이다 — 받지 못하는 번호로 급한 사람을 보내면 시간만 잃는다.
   */
  callDiscouraged: boolean;
}

/** 경계값. 테스트가 이 값을 직접 읽는다. */
export const URGENCY_MINUTES = { callFirst: 10, callOnly: 30 } as const;

/**
 * 목록과 상세가 **같은 함수를 쓴다.** 두 화면의 판정이 갈리면 목록에선 전화가
 * 주 버튼인데 상세에선 아닌 상황이 생긴다.
 */
export function deriveDisplayUrgency(hospital: HospitalView, now: Date): DisplayUrgency {
  const callDiscouraged = hospital.contactStatus?.status === "difficult";
  const live = hospital.liveStatus;

  // 상태가 없거나 만료면 가장 센 단계다. 만료는 30분 규칙보다 앞선다.
  if (!live || isExpired(live, now)) return { level: "callOnly", callDiscouraged };

  const minutesAgo = getFreshness(live.verifiedAt, now).minutesAgo;
  if (minutesAgo >= URGENCY_MINUTES.callOnly) return { level: "callOnly", callDiscouraged };
  if (minutesAgo >= URGENCY_MINUTES.callFirst) return { level: "callFirst", callDiscouraged };
  return { level: "normal", callDiscouraged };
}

export interface StatusView {
  /** 저장된 상태가 읽는 시점에 만료됐는가. 상태가 아예 없으면 true 로 본다. */
  expired: boolean;
  status: ReturnType<typeof describeStatus>;
  /** "21:00 이후 재개 예정" 같은 예정 문구. 만료됐으면 쓰지 않는다. */
  timePlan: string | null;
  /**
   * 병원이 마지막으로 확인한 뒤 지난 시간(분). 상태가 아예 없으면 null.
   * 만료됐어도 값은 준다 — 만료된 확인시각을 보여줄지 말지는 화면이 정한다.
   * (지금 상세는 감추고 카드는 보여준다. 이 차이는 이번 커밋에서 건드리지 않는다.)
   */
  verifiedMinutesAgo: number | null;
  /** 위 값의 표시 문구("12분 전"). null 조건도 같다. */
  verifiedAgo: string | null;
  /** 공공데이터 동기화 시각 문구. 병원 직접확인 정보가 없을 때 쓴다. */
  publicSyncedAgo: string;
  urgency: DisplayUrgency;
  /**
   * 만료되지는 않았지만 30분 규칙으로 표시만 "확인 필요"로 내린 경우.
   * 화면이 "왜 확인 필요인가"를 구분해야 할 때 본다(만료인가, 오래됐는가).
   */
  downgraded: boolean;
  /**
   * 믿을 상태도 없고(callOnly) 전화도 어렵다(callDiscouraged).
   *
   * 이 경우 화면은 **주 버튼을 만들지 않는다.** 억지로 하나를 크게 만들면 그게 거짓이다 —
   * 우리가 권할 수 있는 행동이 실제로 없다. "목록으로"는 사용자를 밀어내기만 하고
   * 답을 주지 않는다. 돌아가도 같은 문제의 병원이 또 있다.
   *
   * 이건 문구 문제가 아니라 정보가 없다는 사실이다. 그래서 그대로 말하고,
   * 무게가 같은 선택지 둘을 준다. [그래도 전화] — 병원이 어렵다고 했을 뿐
   * 불가능한 것은 아니다. [다른 곳 보기].
   *
   * 응급 여부는 우리가 판단하지 않는다. 119 안내는 이미 있는 것을 그대로 둔다.
   */
  noGuidance: boolean;
}

export function deriveStatusView(hospital: HospitalView, now: Date): StatusView {
  const live = hospital.liveStatus;
  const expired = live ? isExpired(live, now) : true;

  const verifiedMinutesAgo = live ? getFreshness(live.verifiedAt, now).minutesAgo : null;
  const urgency = deriveDisplayUrgency(hospital, now);

  // 만료는 아니지만 너무 오래된 경우. 저장값은 그대로 두고 표시만 내린다.
  const downgraded = !expired && urgency.level === "callOnly";

  // 믿을 상태도 없고 전화도 어렵다. 권할 행동이 없는 상태다.
  const noGuidance = urgency.level === "callOnly" && urgency.callDiscouraged;

  // 재개·재확인 예정 문구도 같이 내린다. "확인 필요" 옆의 "21:00 이후 재개 예정"은
  // 서로 어긋나 읽히고, 급한 사람에게 읽을 줄을 하나 더 만든다(원칙 4).
  // 권할 행동이 없을 때는 "확인 필요"(사용자가 할 일이 있다는 뜻)가 아니라
  // "확인된 정보가 없습니다"(사실)로 적는다. 할 수 없는 일을 시키지 않는다.
  const status = noGuidance
    ? ({ tone: "unverified", text: "확인된 정보가 없습니다" } as const)
    : downgraded
      ? ({ tone: "unverified", text: "현재 상태 확인 필요" } as const)
      : describeStatus(live, now);

  return {
    expired,
    status,
    timePlan: expired || downgraded ? null : describeTimePlan(live),
    verifiedMinutesAgo,
    verifiedAgo: verifiedMinutesAgo === null ? null : formatAgo(verifiedMinutesAgo),
    publicSyncedAgo: formatAgo(getFreshness(hospital.publicData.syncedAt, now).minutesAgo),
    urgency,
    downgraded,
    noGuidance,
  };
}
