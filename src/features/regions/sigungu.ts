import { SIDO_LIST, type Sido } from "@/features/reports/regions";

/**
 * 시·군·구 목록. **글쓴이가 자기 지역을 고르는 데 쓴다.**
 *
 * 전에는 병원 목록의 주소에서 역산했다(`sigunguOptions`). 그러면 등록된 병원이 2곳일
 * 때 선택지가 "강서구" 하나이고, 병원 목록을 내리면 **0개가 된다.** 전국 하나의 방에
 * 글쓴이의 구를 붙이려면 병원과 무관한 목록이 있어야 한다.
 *
 * ── 지금 서울만 채워져 있다. 빠뜨린 것이 아니다 ──────────────
 * 전국 시군구는 약 229개다. 그 이름을 기억으로 적으면 **틀린 이름이 섞인다** —
 * 틀리면 그 구를 고른 사람의 글이 엉뚱한 지역에 붙고, 나중에 고치려면 이미 쌓인
 * 글의 지역을 손으로 옮겨야 한다. 되돌리기 어려운 쪽이다.
 *
 * 그래서 1차 지역(서울)만 확실한 값으로 넣었다. 나머지 시도는 **시/도만** 고를 수
 * 있다(`sigungu = null`). 부산 사람은 "부산"으로 글을 쓰고 전국 방에서 보인다.
 *
 * 전국을 채우는 방법 — **손으로 적지 않는다.**
 *
 *   1. 행정표준코드관리시스템(www.code.go.kr) → 법정동코드 → 전체자료 내려받기
 *   2. `npm run gen:sigungu -- <그 파일>`
 *   3. 아래 SIGUNGU_BY_SIDO 를 `SIGUNGU_GENERATED` 로 바꾼다 (import 한 줄)
 *
 * 생성기가 시도별 개수(합 229)를 검증하고, 어긋나면 **파일을 쓰지 않고 멈춘다** —
 * 틀린 목록이 조용히 들어가는 것이 가장 나쁘다. "강서구"는 서울과 부산에 둘 다
 * 있어서 이름만으로는 구분되지 않는다. 그래서 저장은 늘 시도+시군구 쌍이다.
 *
 * 묶는 기준: **시군구 레벨**. 특별시·광역시는 그 안의 구, 도는 시·군 단위다.
 * 수원시 장안구처럼 시 안의 일반구는 **시로 묶는다** — "내 지역"으로 시 단위가
 * 충분하고, 일반구까지 내려가면 목록이 커지면서 틀릴 자리도 늘어난다.
 */

/**
 * 시/도별 시·군·구.
 *
 * 빈 배열 = 그 시도의 구 목록을 아직 갖고 있지 않다. 화면은 시/도만 고르게 한다.
 * **없는 구를 고르게 만들지 않는다** — 고른 지역에 글이 안 붙는 것보다 못한 것이 없다.
 */
export const SIGUNGU_BY_SIDO: Record<Sido, readonly string[]> = {
  서울: [
    "종로구",
    "중구",
    "용산구",
    "성동구",
    "광진구",
    "동대문구",
    "중랑구",
    "성북구",
    "강북구",
    "도봉구",
    "노원구",
    "은평구",
    "서대문구",
    "마포구",
    "양천구",
    "강서구",
    "구로구",
    "금천구",
    "영등포구",
    "동작구",
    "관악구",
    "서초구",
    "강남구",
    "송파구",
    "강동구",
  ],
  부산: [],
  대구: [],
  인천: [],
  광주: [],
  대전: [],
  울산: [],
  세종: [],
  경기: [],
  강원: [],
  충북: [],
  충남: [],
  전북: [],
  전남: [],
  경북: [],
  경남: [],
  제주: [],
};

/** 그 시도의 구를 고를 수 있는가. 빈 목록이면 시/도까지만 고른다. */
export function hasSigunguList(sido: Sido): boolean {
  return SIGUNGU_BY_SIDO[sido].length > 0;
}

export function sigunguChoices(sido: Sido | null): readonly string[] {
  return sido === null ? [] : SIGUNGU_BY_SIDO[sido];
}

/** 내 지역. 시도만 고른 상태도 유효하다. */
export interface MyRegion {
  sido: Sido;
  sigungu: string | null;
}

/**
 * 고른 값이 목록에 있는 값인가.
 *
 * localStorage 와 URL 은 사용자가 고칠 수 있다. 목록에 없는 구가 들어오면 그 값으로
 * 글이 저장되고, 그 글은 아무 필터에도 걸리지 않는다. 그래서 읽을 때 한 번 본다.
 */
export function isKnownRegion(region: { sido: string; sigungu: string | null }): boolean {
  const sido = SIDO_LIST.find((s) => s === region.sido);
  if (!sido) return false;
  if (region.sigungu === null) return true;
  return SIGUNGU_BY_SIDO[sido].includes(region.sigungu);
}

/**
 * 고르기가 **끝났는가.**
 *
 * 구 목록이 있는 시도(지금 서울)는 구까지 골라야 끝난 것이다. 시/도만 고른 상태는
 * 고르는 중이고, 그걸 저장하면 "내 지역 서울"이 되어 **이미 고른 것처럼 보인다** —
 * 그러면 "내 지역 보기"가 서울 전체가 되고, 설계는 구 단위다.
 *
 * 구 목록이 없는 시도(부산 등, 아직 목록을 안 넣었다)는 시/도가 끝난 상태다.
 * 그 사람에게 없는 구를 고르라고 할 수 없다.
 */
export function isRegionComplete(region: MyRegion | null): boolean {
  if (region === null) return false;
  if (!hasSigunguList(region.sido)) return true;
  return region.sigungu !== null;
}

/** 화면에 한 줄로 적을 이름. "서울 강서구" · "부산". */
export function regionLabel(region: MyRegion): string {
  return region.sigungu === null ? region.sido : `${region.sido} ${region.sigungu}`;
}
