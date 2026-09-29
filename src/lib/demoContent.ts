/**
 * 무엇을 화면에 낼 것인가 — **판정은 전부 이 파일에서 나간다.**
 *
 * 플래그는 둘이지만 판정점은 하나다. 다른 파일에서 process.env 를 직접 읽지 않는다.
 * 읽기 시작하면 "운영에서 이게 켜져 있나?"를 알아보려고 저장소를 뒤져야 한다.
 *
 * ── 플래그 둘이 각각 무엇을 켜고 끄는가 ──────────────────────
 *
 *   NEXT_PUBLIC_DEMO_CONTENT      **가짜 데이터**를 화면에 낼 수 있는가.
 *                                 가상 제보·가상 대화·공식 배지·데모 거리·이동시간.
 *                                 운영에서는 꺼져 있어야 한다.
 *
 *   NEXT_PUBLIC_FIELD_TALK_LIVE   **현장톡 쓰기**를 여는가.
 *                                 작성창과 홈 배너의 활성 문구.
 *                                 서버 저장·제한이 준비된 뒤에 켠다.
 *
 * 전에는 둘이 한 값이었다. 그래서 작성창을 열려면 가짜 데이터도 같이 켜야 했다 —
 * 1차 출시(현장톡 단독)의 첫 걸림돌이 그것이었다. 둘은 서로 다른 것을 묻는다.
 * 하나는 "보여 줄 것이 진짜인가", 다른 하나는 "쓸 수 있는가"다.
 *
 * NEXT_PUBLIC_ 접두사를 쓰는 이유: 이 판정을 서버 컴포넌트와 클라이언트 훅 양쪽에서
 * 같은 값으로 읽어야 한다. 값이 갈라지면 hydration 이 어긋난다.
 */

function isOn(value: string | undefined): boolean {
  if (value === undefined) return false;
  const v = value.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on";
}

const explicit = process.env.NEXT_PUBLIC_DEMO_CONTENT;

/** 가상 병원·가상 제보·가공된 반응 수를 화면에 낼 수 있는가. */
export const isDemoContentAllowed: boolean =
  explicit !== undefined && explicit.trim() !== ""
    ? isOn(explicit)
    : process.env.NODE_ENV !== "production";

/**
 * 가상 제보·가상 대화·가공된 반응 수·가상 상대시각.
 * 차단되면 목록은 실제 빈 상태가 된다. 0건으로 꾸미지 않는다.
 */
export const showDemoReports = isDemoContentAllowed;

/**
 * 공식 출처 배지(🟢 의료기관 직접확인 · 🟡 운영자 전화확인).
 *
 * 지금 스키마에는 기관 검증 상태 컬럼이 없다. 즉 어떤 병원이 실제로 참여·검증되었는지
 * 코드가 알 수 없으므로, 운영에서는 공식 배지를 만들지 않는다.
 * 검증 필드가 생기면 이 상수 대신 `verification_state === 'APPROVED'` 로 바꾼다.
 */
export const showOfficialSourceBadge = isDemoContentAllowed;

/**
 * 예상 이동 시간.
 *
 * 현재 거리는 고정 데모 출발점(`features/hospitals/location.ts` DEMO_ORIGIN)에서 계산한
 * 직선거리이고, 이동 시간은 그 거리에 상수를 곱한 추정이다. 사용자 위치가 아니다.
 * 근거가 없으므로 운영 화면에서는 숨긴다. 8단계 지도 어댑터에서 되살린다.
 */
export const showTravelEstimate = isDemoContentAllowed;

/** 고정 데모 출발점 기반 거리. '내 주변' 거리로 읽히면 안 되므로 같이 숨긴다. */
export const showDemoDistance = isDemoContentAllowed;

/**
 * 도착 예정 알리기.
 *
 * 후속 개발이며 현재 사용자 흐름에서 제외한다. 코드·타입·데이터는 지우지 않고
 * 화면 진입점만 닫는다. 되살릴 때 이 상수만 true 로 바꾼다.
 */
export const showArrivalIntent = false;

/**
 * 현장톡 쓰기가 열려 있는가.
 *
 * **가짜 데이터 플래그와 분리돼 있다.** 전에는 같은 값이었고, 그래서 작성창을 열려면
 * 가상 대화도 같이 켜야 했다. 둘은 서로 다른 것을 묻는다.
 *
 * 켤 수 있게 된 조건(전부 충족됨):
 *   · 글이 서버에 저장된다            (field_reports, migration 20260929)
 *   · 다른 사람에게 실시간으로 간다   (broadcast 트리거)
 *   · 화면을 거치지 않는 쓰기가 막힌다 (insert 정책 회수 + 서버 라우트, 20260930)
 *   · 연타·도배를 서버가 센다          (게스트 세션 + rate limit)
 *
 * 그래서 기본값이 **켜짐**이다. 끄고 싶으면 명시적으로 0 을 준다 — 장애가 났을 때
 * 재배포 없이 쓰기만 닫을 수 있어야 한다.
 *
 *   NEXT_PUBLIC_FIELD_TALK_LIVE=0   작성창을 닫고 '준비 중'으로 안내
 */
const fieldTalkFlag = process.env.NEXT_PUBLIC_FIELD_TALK_LIVE;

export const isFieldTalkSharingLive: boolean =
  fieldTalkFlag !== undefined && fieldTalkFlag.trim() !== "" ? isOn(fieldTalkFlag) : true;
