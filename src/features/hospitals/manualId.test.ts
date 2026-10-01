import { describe, expect, it } from "vitest";
import { buildRegistryKey } from "@/features/hospitals/registryKey";
import { isUrlSafeId, manualHospitalId } from "@/features/hospitals/manualId";

/**
 * 손으로 넣은 병원의 id.
 *
 * registry_key 를 그대로 id 로 썼다가 /hospital/<id> 가 404 가 났다 —
 * '강서구|강서푸른꿈성모어린이병원' 의 `|`·`:` 가 URL 경로를 왕복하지 못한다.
 * 목록에만 있고 들어갈 수 없는 병원이 되면 고를 이유가 없다.
 */

describe("URL 안전", () => {
  it("★ 한글 이름에서 만든 id 도 URL 에 그대로 넣을 수 있다", () => {
    const key = buildRegistryKey({ sigungu: "강서구", name: "강서푸른꿈성모어린이병원" });
    const id = manualHospitalId(key!);
    expect(isUrlSafeId(id)).toBe(true);
    expect(encodeURIComponent(id)).toBe(id);
  });

  it("registry_key 자체는 URL 안전하지 않다 — 그래서 id 로 쓰지 않는다", () => {
    const key = buildRegistryKey({ sigungu: "강서구", name: "연세의원" })!;
    expect(isUrlSafeId(key)).toBe(false);
  });

  it("공공데이터 id 와 구분된다", () => {
    expect(manualHospitalId("강서구|연세의원").startsWith("m")).toBe(true);
  });
});

describe("같은 병원은 같은 id", () => {
  it("★ 다시 넣어도 같은 id — 아니면 upsert 가 새 행을 만든다", () => {
    const key = "강서구|연세의원";
    expect(manualHospitalId(key)).toBe(manualHospitalId(key));
  });

  it("★ 표기가 달라도 같은 id — registry_key 가 먼저 정규화한다", () => {
    const a = buildRegistryKey({ sigungu: "강서구", name: "마곡 로뎀소아청소년과" })!;
    const b = buildRegistryKey({ sigungu: "강서구", name: "마곡로뎀소아청소년과" })!;
    expect(manualHospitalId(a)).toBe(manualHospitalId(b));
  });

  it("다른 병원은 다른 id", () => {
    expect(manualHospitalId("강서구|연세의원")).not.toBe(manualHospitalId("양천구|연세의원"));
    expect(manualHospitalId("강서구|연세의원")).not.toBe(manualHospitalId("강서구|연세365의원"));
  });
});
