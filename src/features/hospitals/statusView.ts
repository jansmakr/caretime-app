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
}

export function deriveStatusView(hospital: HospitalView, now: Date): StatusView {
  const live = hospital.liveStatus;
  const expired = live ? isExpired(live, now) : true;

  const verifiedMinutesAgo = live ? getFreshness(live.verifiedAt, now).minutesAgo : null;

  return {
    expired,
    status: describeStatus(live, now),
    timePlan: expired ? null : describeTimePlan(live),
    verifiedMinutesAgo,
    verifiedAgo: verifiedMinutesAgo === null ? null : formatAgo(verifiedMinutesAgo),
    publicSyncedAgo: formatAgo(getFreshness(hospital.publicData.syncedAt, now).minutesAgo),
  };
}
