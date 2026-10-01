import { describe, expect, it } from "vitest";
import {
  buildRegistryKey,
  findRegistryMismatch,
  normalizeHospitalName,
  normalizePhone,
} from "@/features/hospitals/registryKey";

/**
 * 같은 병원을 두 번 만들지 않기 위한 키.
 *
 * 여기서 두 방향의 실패가 모두 사고다.
 *   너무 느슨하면 — 다른 병원이 합쳐진다. 되돌리기 어렵다.
 *   너무 빡빡하면 — 같은 병원이 둘이 되고, 목록에 두 번 보이고 글이 갈린다.
 */

describe("이름 정규화 — 표기 차이만 지운다", () => {
  it("★ 공백·기호 차이는 같은 병원으로 본다", () => {
    expect(normalizeHospitalName("마곡 로뎀소아청소년과")).toBe(
      normalizeHospitalName("마곡로뎀소아청소년과"),
    );
    expect(normalizeHospitalName("강서푸른꿈성모어린이병원")).toBe(
      normalizeHospitalName("강서 푸른꿈 성모어린이병원"),
    );
    expect(normalizeHospitalName("연세(강서)의원")).toBe(normalizeHospitalName("연세 강서 의원"));
  });

  it("★ 숫자는 지우지 않는다 — '연세의원'과 '연세365의원'은 다른 병원이다", () => {
    expect(normalizeHospitalName("연세의원")).not.toBe(normalizeHospitalName("연세365의원"));
    expect(normalizeHospitalName("제1의원")).not.toBe(normalizeHospitalName("제2의원"));
  });

  it("영문은 대소문자만 맞춘다", () => {
    expect(normalizeHospitalName("Seoul Clinic")).toBe(normalizeHospitalName("seoulclinic"));
  });
});

describe("키 만들기", () => {
  it("시군구와 이름을 묶는다", () => {
    expect(buildRegistryKey({ sigungu: "강서구", name: "강서푸른꿈성모어린이병원" })).toBe(
      "강서구|강서푸른꿈성모어린이병원",
    );
  });

  it("★ 시군구가 없으면 키를 만들지 않는다 — 이름만으로 합치는 것이 가장 흔한 사고다", () => {
    expect(buildRegistryKey({ sigungu: null, name: "연세의원" })).toBeNull();
    expect(buildRegistryKey({ sigungu: "", name: "연세의원" })).toBeNull();
  });

  it("★ 다른 시군구의 동명 병원은 다른 키다", () => {
    const a = buildRegistryKey({ sigungu: "강서구", name: "연세의원" });
    const b = buildRegistryKey({ sigungu: "양천구", name: "연세의원" });
    expect(a).not.toBe(b);
  });

  it("이름이 없으면 키가 없다", () => {
    expect(buildRegistryKey({ sigungu: "강서구", name: null })).toBeNull();
    expect(buildRegistryKey({ sigungu: "강서구", name: "   " })).toBeNull();
  });

  it("표기가 달라도 같은 키가 나온다 — 수동 입력과 배치가 만나는 지점", () => {
    const manual = buildRegistryKey({ sigungu: "강서구", name: "마곡 로뎀소아청소년과" });
    const fromApi = buildRegistryKey({ sigungu: "강서구", name: "마곡로뎀소아청소년과" });
    expect(manual).toBe(fromApi);
  });
});

describe("전화번호 정규화", () => {
  it("표기가 달라도 같게 본다", () => {
    expect(normalizePhone("02-3665-0823")).toBe(normalizePhone("0236650823"));
    expect(normalizePhone("02)2601-3433")).toBe(normalizePhone("02 2601 3433"));
  });

  it("너무 짧은 값은 비교에 쓰지 않는다", () => {
    expect(normalizePhone("1234")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
});

describe("사람이 봐야 하는 경우 — 자동으로 합치지 않는다", () => {
  it("★ 전화는 같은데 키가 다르면 보고한다 (개명·이전일 수 있다)", () => {
    expect(
      findRegistryMismatch(
        { registryKey: "강서구|새이름의원", tel: "02-3665-0823" },
        { registryKey: "강서구|옛이름의원", tel: "0236650823" },
      ),
    ).toBe("same_phone_different_key");
  });

  it("★ 키는 같은데 전화가 다르면 보고한다 (동명 병원일 수 있다)", () => {
    expect(
      findRegistryMismatch(
        { registryKey: "강서구|연세의원", tel: "02-1111-1111" },
        { registryKey: "강서구|연세의원", tel: "02-2222-2222" },
      ),
    ).toBe("same_key_different_phone");
  });

  it("키와 전화가 모두 같으면 그냥 갱신한다", () => {
    expect(
      findRegistryMismatch(
        { registryKey: "강서구|연세의원", tel: "02-2601-3433" },
        { registryKey: "강서구|연세의원", tel: "0226013433" },
      ),
    ).toBeNull();
  });

  it("관계없는 병원은 보고 대상이 아니다", () => {
    expect(
      findRegistryMismatch(
        { registryKey: "강서구|가의원", tel: "02-1111-1111" },
        { registryKey: "양천구|나의원", tel: "02-2222-2222" },
      ),
    ).toBeNull();
  });

  it("전화를 모르면 키 불일치를 보고하지 않는다 — 근거가 없다", () => {
    expect(
      findRegistryMismatch(
        { registryKey: "강서구|가의원", tel: null },
        { registryKey: "강서구|나의원", tel: null },
      ),
    ).toBeNull();
  });
});
