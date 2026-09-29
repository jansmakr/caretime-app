import { describe, expect, it } from "vitest";
import { REVISIT_MIN_GAP_MS, shouldRefetchOnRevisit } from "@/lib/useRevisitRefetch";

/**
 * 화면 복귀 재조회의 판정만 고정한다. 이벤트 등록은 브라우저 일이고 이 저장소는
 * jsdom 을 들이지 않으므로(vitest.config 주석), 판정을 순수 함수로 떼어 그것을 본다.
 *
 * 막는 것 두 가지:
 *   1) 보이지 않는 화면을 갱신해 요청만 쓰는 일
 *   2) focus 와 visibilitychange 가 같이 와서 같은 복귀로 두 번 읽는 일
 */

describe("shouldRefetchOnRevisit", () => {
  it("보이지 않으면 읽지 않는다", () => {
    expect(shouldRefetchOnRevisit(0, 10_000_000, true)).toBe(false);
  });

  it("처음 복귀는 읽는다", () => {
    expect(shouldRefetchOnRevisit(0, REVISIT_MIN_GAP_MS, false)).toBe(true);
  });

  it("★ 같은 복귀로 두 사건이 같이 오면 한 번만 읽는다", () => {
    const t = 1_000_000;
    expect(shouldRefetchOnRevisit(0, t, false)).toBe(true);
    // 첫 호출이 lastAt 을 t 로 갱신한 뒤, 몇 밀리초 뒤 두 번째 사건이 온 상황
    expect(shouldRefetchOnRevisit(t, t + 3, false)).toBe(false);
  });

  it("최소 간격 경계", () => {
    const t = 1_000_000;
    expect(shouldRefetchOnRevisit(t, t + REVISIT_MIN_GAP_MS - 1, false)).toBe(false);
    expect(shouldRefetchOnRevisit(t, t + REVISIT_MIN_GAP_MS, false)).toBe(true);
  });

  it("간격이 지나면 다시 읽는다", () => {
    const t = 1_000_000;
    expect(shouldRefetchOnRevisit(t, t + 60_000, false)).toBe(true);
  });

  it("숨은 동안에는 간격이 아무리 지나도 읽지 않는다", () => {
    expect(shouldRefetchOnRevisit(0, 60 * 60_000, true)).toBe(false);
  });
});
