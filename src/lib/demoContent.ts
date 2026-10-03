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

/* ────────────────────────────────────────────────────────────
 * 1차 출시 범위 — 지역 현장톡 하나
 *
 * 아래 셋은 **코드를 지우지 않고 화면에서만 내린다.** 되살릴 때 이 상수를 true 로
 * 바꾼다. 왜 내리는지는 docs/LAUNCH-scope.md 에 적어 두었다.
 *
 * 공통 이유: 1차 지역(서울 강서구)의 참여 병원이 0곳이다. 병원이 입력하지 않는
 * 값을 자리로 남겨 두면 "정보가 없는 서비스"로 읽히고, 그 자리를 채우려고
 * 추측값을 넣게 된다. 없는 것은 자리도 두지 않는다. (UI 원칙 4)
 * ──────────────────────────────────────────────────────────── */

/**
 * 항목별 상태 표시 (찢어진 상처 · 화상 · 그 밖의 상처).
 *
 * 이 3분할은 "야간 소아 외상" 설계에서 나왔다. 그런데 1차 지역의 달빛어린이병원이
 * 실제로 보는 것은 발열·감기·구토·설사·중이염이다 — 항목과 병원이 어긋나 있다.
 * 어긋난 표를 병원별 상태로 보여 주면 보호자는 맞지 않는 칸을 읽고 판단한다.
 *
 * 접기 규칙(mergeConservative)과 판정 함수(deriveServiceBreakdown)는 그대로 둔다.
 * 지금 내리는 것은 **표시**뿐이고, 판정 규칙은 바꾸지 않았다.
 */
export const showServiceBreakdown = false;

/**
 * 오늘 진료시간 · 내원 마감.
 *
 * 참여 병원이 0곳이라 어느 병원도 시간을 등록하지 않았다. 수동 입력한 2곳도
 * 진료시간을 아직 확인하지 못했다(docs/DATA-INVENTORY.md). 그래서 이 칸은 지금
 * 언제나 "정보 없음"이고, 그 줄은 읽을 것이 없는데 자리를 차지한다.
 *
 * 확인된 진료시간이 들어오면 켠다. 마감 판정(lib/hours)은 그대로 둔다.
 */
export const showAdmissionHours = false;

/**
 * 병원용 화면(/partner) 진입.
 *
 * 1차에는 참여 병원이 없다. 로그인 화면을 열어 두면 아무도 들어갈 수 없는 문이
 * 보호자 화면 헤더에 붙어 있게 된다. 라우트까지 닫는다(not found) — 링크만 떼면
 * 주소를 아는 사람에게는 그대로 열려 있고, 그 화면은 지금 보여 줄 값이 없다.
 */
export const showPartnerEntry = false;

/**
 * 홈의 탐색 조건 폼 — 지역 · 진료 항목 · 방문 목적 세 묶음.
 *
 * 1차에서는 내린다. 그 세 질문은 "야간 소아 외상 병원 찾기" 흐름의 입구이고,
 * 답으로 나오는 것은 병원 2곳의 목록이다. 보호자가 밤에 묻는 것은
 * "마곡동인데 지금 어디 열었나요?" 이고, 1차의 답은 현장톡이다.
 *
 * 그래서 홈의 결정은 하나여야 한다 — 현장톡을 연다(UI 원칙 1).
 * 병원 전화번호·주소를 찾는 길은 작은 보조 링크로 남긴다. 전화번호는 1차에서도
 * 가장 쓸모 있는 값이다.
 *
 * /search 와 그 화면의 조건 바(ConditionBar)는 그대로 돈다. 입구만 좁혔다.
 */
export const showCareConditionForm = false;

/**
 * 의료기관 목록·상세.
 *
 * 1차에서 닫는다(2026-10-03). 글을 **병원이 아니라 구에 걸기로** 했기 때문이다 —
 * 병원 이름은 본문에 그냥 쓴다. 이름이 갈라져도 괜찮다. 그러면 목록에서 병원을
 * 고르는 자리가 필요 없고, 고르는 자리가 없으면 상세 화면도 갈 길이 없다.
 *
 * 라우트까지 닫는다(not found). 반쯤 살려 두면 어딘가 남은 링크가 깨진 화면을 연다.
 *
 * 남겨 둔 것: `field_reports.hospital_id`·`hospital_name` 컬럼, 수동 병원 데이터와
 * 투입 SQL, 공공데이터 스키마. 2차에 병원을 다시 붙일 때 쓴다.
 *
 * ⚠️ 2차에 병원 글에 배지를 붙일 때: **출처 표시이고 추천이 아니다.** 의료법 27조
 *    (환자 유인·알선) 때문에 정렬·노출 가중치에 쓰지 않는다. 배지가 순서를 바꾸는
 *    순간 그것은 광고가 된다. (features/hospitals/types 설계 규칙 ②와 같은 이유)
 */
export const showHospitalDirectory = false;

/**
 * 베타 운영 중인가.
 *
 * **`isDemoContentAllowed` 와 묶지 않는다.** 베타 표시는 데이터가 가짜라서 붙는 것이
 * 아니라 **서비스 단계가 베타라서** 붙는다. 한 스위치에 묶으면 공공데이터가 들어와
 * 데이터가 실제가 되는 날 베타 표시도 함께 사라진다 — 그날 등록된 의료기관은
 * 여전히 적을 수 있다.
 *
 * 2026년은 베타로 간다. 정식 출시 날짜를 두지 않는다 — 지금 상태가 실제로 베타다
 * (등록 의료기관 2곳, 참여 의료기관 0곳, 공공데이터 미연동). 이걸 정식 서비스라
 * 부르면 이용자가 더 많은 것을 기대한다.
 *
 * 끄는 조건: 등록된 의료기관이 "적다"고 적지 않아도 될 만큼 늘었을 때. 날짜가 아니다.
 */
export const isBeta = true;

/**
 * 검색엔진 색인을 여는가.
 *
 * **베타 플래그와도 따로 둔다.** 색인을 여는 시점은 사람이 따로 정한다 —
 * 베타를 끝내는 것과 "검색에서 찾을 수 있게 하는 것"은 다른 판단이다.
 * 묶어 두면 한쪽을 바꾸는 날 다른 쪽이 조용히 따라 바뀐다.
 *
 * 지금 닫는 이유: 아는 사람 몇 명에게 주소를 주며 시작한다. 검색으로 들어온 사람은
 * 등록된 의료기관이 2곳인 것을 모르고 온다.
 *
 * ⚠️ 전에는 루트 레이아웃이 `robots: { index: true }` 였다. 주석에는 "건강정보가
 * 담긴 화면은 색인시키지 않는다"고 적혀 있었는데 값은 반대였다 — 코드가 주석을
 * 따르지 않았다. 그래서 판정을 여기로 옮겼다.
 */
export const isSearchIndexingOpen = false;

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

/**
 * 서버가 쓰기를 받아 주는가. **화면과 따로 판정한다.**
 *
 * 위의 `isFieldTalkSharingLive` 는 `NEXT_PUBLIC_` 이라 빌드에 박힌다. 즉 그것만으로는
 * **화면만 닫는 것**이고, 주소와 요청 모양을 아는 사람은 그대로 쓸 수 있다.
 * 같은 실수를 anon 키에서 이미 했다(화면 쿨다운만 검증하면 아무것도 검증하지 않은 것).
 *
 * 그래서 서버 전용 변수를 둔다. `NEXT_PUBLIC_` 이 아니므로 번들에 들어가지 않고,
 * 서버가 **요청마다** 읽는다.
 *
 *   CARETIME_WRITES=closed   글·반응·요청·신고를 받지 않는다 (503)
 *   CARETIME_WRITES=open     받는다
 *   (미설정)                  화면 플래그를 따른다 — 기본은 열림
 *
 * 쓰는 자리: 출시 전 공개 기간이다. 방침 시행일 전에 글이 들어오면 그 수집은
 * 근거가 없고, 그때 만들어진 세션은 동의 기록 없이 남는다. 지울 수는 있지만
 * **애초에 만들지 않는 쪽**이 맞다.
 *
 * 닫아도 **자기 글 삭제는 막지 않는다.** 문을 닫는 것이 이미 들어온 글을 가두는
 * 일이 되면 안 된다.
 */
export function areWritesOpen(): boolean {
  const value = process.env.CARETIME_WRITES;
  if (value !== undefined && value.trim() !== "") {
    return value.trim().toLowerCase() !== "closed";
  }
  return isFieldTalkSharingLive;
}
