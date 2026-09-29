import { describe, expect, it } from "vitest";
import { chatHref } from "@/features/chat/urlFilter";
import { isFilterActive } from "@/features/chat/service";
import { EMPTY_FILTER, type ChatFilter } from "@/features/chat/types";

/**
 * 빈 방과 검색 출구의 판정.
 *
 * 출시 직후에는 반드시 0건이다. 그때 화면이 무엇을 보여 주는지가 이 기능의 전부다 —
 * 아무도 없는 방에 처음 들어온 사람이 글을 쓰게 만드는 것.
 *
 * 화면 자체는 jsdom 을 들이지 않아 여기서 그리지 않는다(vitest.config 주석).
 * 대신 "언제 빈 방으로 보는가"와 "조건이 그대로 넘어가는가"를 고정한다.
 * 실제 그려진 결과는 docs/screens/ 에 운영 빌드에서 뽑아 적는다.
 */

/**
 * ChatRoom 의 판정을 그대로 옮긴 것.
 * 화면에서 이 식이 바뀌면 이 테스트도 같이 바뀌어야 한다 — 두 곳이 갈라지면
 * 테스트가 없는 것을 지키게 된다.
 */
function isEmptyRoom(input: {
  filter: ChatFilter;
  totalCount: number;
  initialLoadFailed: boolean;
}): boolean {
  return !isFilterActive(input.filter) && input.totalCount === 0 && !input.initialLoadFailed;
}

describe("언제 빈 방 화면을 보여 주는가", () => {
  it("★ 조건 없이 0건이면 빈 방이다 — 출시 직후의 상태", () => {
    expect(isEmptyRoom({ filter: EMPTY_FILTER, totalCount: 0, initialLoadFailed: false })).toBe(true);
  });

  it("글이 하나라도 있으면 평소 화면이다", () => {
    expect(isEmptyRoom({ filter: EMPTY_FILTER, totalCount: 1, initialLoadFailed: false })).toBe(false);
  });

  it("★ 조건을 걸어서 0건인 것은 빈 방이 아니다 — 조건을 넓히면 글이 있다", () => {
    /*
     * 여기서 필터를 감추면 조건을 되돌릴 길이 사라진다. "글이 없다"와
     * "이 조건에 없다"는 사용자가 할 일이 다르다.
     */
    const filtered: ChatFilter = { sido: "서울", sigungu: "강서구", hospitalId: null };
    expect(isEmptyRoom({ filter: filtered, totalCount: 0, initialLoadFailed: false })).toBe(false);
  });

  it("★ 조회에 실패한 것은 빈 방이 아니다 — 글이 없다는 뜻이 아니다", () => {
    expect(isEmptyRoom({ filter: EMPTY_FILTER, totalCount: 0, initialLoadFailed: true })).toBe(false);
  });
});

describe("검색 조건이 현장톡으로 넘어간다", () => {
  it("★ 지역을 고른 사람은 그 지역 방으로 간다", () => {
    expect(chatHref({ sido: "서울", sigungu: "강서구" })).toBe("/chat?sido=%EC%84%9C%EC%9A%B8&sigungu=%EA%B0%95%EC%84%9C%EA%B5%AC");
  });

  it("지역을 안 골랐으면 전체 방이다 — 임의 지역을 만들지 않는다", () => {
    expect(chatHref({ sido: null, sigungu: null })).toBe("/chat");
  });

  it("★ 시도 없이 시군구만 있으면 지역을 싣지 않는다", () => {
    // 어디인지 알 수 없는 조건으로 방을 좁히면 "내 동네에 글이 없다"로 잘못 읽힌다.
    expect(chatHref({ sido: null, sigungu: "강서구" })).toBe("/chat");
  });

  it("병원 상세에서는 그 병원 방으로 간다", () => {
    expect(chatHref({ hospitalId: "h_001" })).toBe("/chat?hospital=h_001");
  });

  it("★ 나이·진료 상황 같은 건강 조건은 넘어갈 키 자체가 없다", () => {
    const href = chatHref({
      sido: "서울",
      // @ts-expect-error 받는 키가 아니다. 넘겨도 무시된다는 것을 고정한다.
      age: 3,
      purpose: "suture",
    });
    expect(href).not.toContain("age");
    expect(href).not.toContain("purpose");
  });
});
