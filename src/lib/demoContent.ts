/**
 * 가상 정보 노출 차단 — 보수적 기본값.
 *
 * 이 저장소의 의료기관·제보 데이터는 전부 가상이다(README 「Mock 정책」).
 * 데모/운영 구분이 코드에 없었기 때문에, **운영에서는 기본 차단**으로 둔다.
 * 켜는 방향만 명시적으로 열어 둔다 — 실수로 운영에서 켜지는 경로를 만들지 않는다.
 *
 * 설정:
 *   NEXT_PUBLIC_DEMO_CONTENT=1   데모 데이터 노출 허용(로컬·데모 배포)
 *   설정하지 않으면 개발에서는 허용, 운영 빌드에서는 차단
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
 * 현장톡 쓰기가 실제로 공유되는가.
 *
 * 지금 글·반응은 브라우저 메모리에만 있다(서버 저장·실시간 수신 없음).
 * 그래서 운영에서는 작성창을 열어 두지 않고 '준비 중'으로 안내한다 —
 * 저장되지 않는 입력을 공유처럼 보이게 하면 안 된다.
 * 서버 저장이 붙으면 이 상수를 그 조건으로 바꾼다.
 */
export const isFieldTalkSharingLive = isDemoContentAllowed;
