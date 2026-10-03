import { describe, expect, it } from "vitest";
import { SIDO_LIST } from "@/features/reports/regions";
import {
  SIGUNGU_BY_SIDO,
  hasSigunguList,
  isKnownRegion,
  regionLabel,
  sigunguChoices,
} from "./sigungu";

/**
 * 지역 목록이 글에 붙는 값을 정한다. 틀린 이름이 들어가면 그 글은 **어느 필터에도
 * 걸리지 않는다** — 쓴 사람은 올렸다고 생각하고, 그 지역 사람은 못 본다.
 * 그래서 목록 자체를 테스트가 붙든다.
 */

describe("목록", () => {
  it("모든 시/도에 칸이 있다 — 빠진 시도가 있으면 그 지역 사람이 고를 수 없다", () => {
    for (const sido of SIDO_LIST) {
      expect(SIGUNGU_BY_SIDO[sido], sido).toBeDefined();
    }
    expect(Object.keys(SIGUNGU_BY_SIDO).length).toBe(SIDO_LIST.length);
  });

  it("★ 서울은 25개 구다", () => {
    // 행정구역이라 숫자가 정해져 있다. 빠지거나 겹치면 여기서 걸린다.
    expect(SIGUNGU_BY_SIDO.서울).toHaveLength(25);
  });

  it("★ 같은 구 이름이 한 시도 안에서 겹치지 않는다", () => {
    for (const sido of SIDO_LIST) {
      const list = SIGUNGU_BY_SIDO[sido];
      expect(new Set(list).size, sido).toBe(list.length);
    }
  });

  it("이름이 구·시·군으로 끝난다 — 오타를 걸러낸다", () => {
    for (const sido of SIDO_LIST) {
      for (const name of SIGUNGU_BY_SIDO[sido]) {
        expect(name, `${sido} ${name}`).toMatch(/(구|시|군)$/);
      }
    }
  });

  it("아직 채우지 않은 시도는 시/도까지만 고른다", () => {
    expect(hasSigunguList("서울")).toBe(true);
    expect(hasSigunguList("부산")).toBe(false);
    expect(sigunguChoices("부산")).toEqual([]);
    expect(sigunguChoices(null)).toEqual([]);
  });
});

describe("고른 값을 믿지 않는다", () => {
  it("★ 목록에 없는 구는 받지 않는다 — 저장소·URL 은 사용자가 고칠 수 있다", () => {
    expect(isKnownRegion({ sido: "서울", sigungu: "강서구" })).toBe(true);
    expect(isKnownRegion({ sido: "서울", sigungu: "없는구" })).toBe(false);
    expect(isKnownRegion({ sido: "없는시도", sigungu: null })).toBe(false);
  });

  it("시도만 고른 것은 유효하다", () => {
    expect(isKnownRegion({ sido: "부산", sigungu: null })).toBe(true);
  });

  it("구 목록이 없는 시도에 구를 붙이면 받지 않는다", () => {
    expect(isKnownRegion({ sido: "부산", sigungu: "해운대구" })).toBe(false);
  });
});

describe("화면에 적는 이름", () => {
  it("구가 있으면 둘을, 없으면 시도만", () => {
    expect(regionLabel({ sido: "서울", sigungu: "강서구" })).toBe("서울 강서구");
    expect(regionLabel({ sido: "부산", sigungu: null })).toBe("부산");
  });
});
