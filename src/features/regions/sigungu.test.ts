import { describe, expect, it } from "vitest";
import { hasSigunguList, isKnownRegion, isRegionComplete, regionLabel } from "./sigungu";

/**
 * "덜 고른 지역"을 고른 것으로 보지 않는다.
 *
 * 실제로 겪은 일: 홈에 **"내 지역 서울"** 이 떴다. 시/도만 고른 값이 그대로
 * 저장돼서다. 고른 것처럼 보이는데 "내 지역 보기"를 누르면 서울 전체가 된다 —
 * 설계는 구 단위다. 화면만 고치면 저장된 값이 남아 다시 떠오른다. 그래서 판정을
 * 여기 한 곳에 두고 읽는 쪽(myRegion.readMyRegion)이 그것을 쓴다.
 */
describe("고르기가 끝났는가", () => {
  it("★ 시/도만 고른 서울은 끝난 것이 아니다 — 구 목록이 있다", () => {
    expect(hasSigunguList("서울")).toBe(true);
    expect(isRegionComplete({ sido: "서울", sigungu: null })).toBe(false);
    expect(isRegionComplete({ sido: "서울", sigungu: "강서구" })).toBe(true);
  });

  it("★ 구 목록이 없는 시도는 시/도가 끝난 상태다 — 없는 구를 고르라고 할 수 없다", () => {
    expect(hasSigunguList("부산")).toBe(false);
    expect(isRegionComplete({ sido: "부산", sigungu: null })).toBe(true);
  });

  it("안 고른 것(null)은 당연히 끝나지 않았다", () => {
    expect(isRegionComplete(null)).toBe(false);
  });

  it("목록에 없는 구는 아예 유효하지 않다 — 저장소를 고쳐 넣어도 걸린다", () => {
    expect(isKnownRegion({ sido: "서울", sigungu: "없는구" })).toBe(false);
    // 서울에도 있고 부산에도 있는 이름. 그래서 저장은 늘 시도+시군구 쌍이다.
    expect(isKnownRegion({ sido: "서울", sigungu: "강서구" })).toBe(true);
    expect(isKnownRegion({ sido: "부산", sigungu: "강서구" })).toBe(false);
  });

  it("화면에 적는 이름", () => {
    expect(regionLabel({ sido: "서울", sigungu: "강서구" })).toBe("서울 강서구");
    expect(regionLabel({ sido: "부산", sigungu: null })).toBe("부산");
  });
});
