import { describe, expect, it } from "vitest";
import { findPii, findPiiExcludingKnown } from "@/features/p0/pii";

/**
 * 개인정보 필터.
 *
 * 놓치는 것이 있다는 전제로 만든 첫 번째 체다. 여기서 중요한 것은 두 가지다 —
 * 적을 이유가 없는 값을 잡는가, 그리고 **멀쩡한 글을 막지 않는가**.
 * 후자가 더 위험하다. 계속 막히면 사람은 쓰기를 그만둔다.
 */

describe("막는 것", () => {
  it("★ 휴대전화번호", () => {
    for (const text of [
      "제 번호 010-1234-5678로 연락 주세요",
      "01012345678 입니다",
      "010 1234 5678",
      "010.1234.5678",
      "+82 10 1234 5678",
    ]) {
      expect(findPii(text)?.kind, text).toBe("phone");
    }
  });

  it("★ 주민등록번호 모양", () => {
    expect(findPii("900101-1234567")?.kind).toBe("rrn");
    expect(findPii("9001011234567")?.kind).toBe("rrn");
  });

  it("★ 이메일", () => {
    expect(findPii("aaa@bbb.com 으로 보내주세요")?.kind).toBe("email");
  });

  it("★ 카드·계좌번호 길이의 숫자", () => {
    expect(findPii("1234 5678 9012 3456")?.kind).toBe("long_digits");
  });

  it("안내 문구가 무엇이 걸렸는지 알려 준다", () => {
    expect(findPii("010-1234-5678")?.message).toContain("전화번호");
    expect(findPii("aaa@bbb.com")?.message).toContain("이메일");
  });
});

describe("막지 않는 것 — 이쪽이 더 위험하다", () => {
  it("★ 평범한 현장 글", () => {
    for (const text of [
      "방금 접수했는데 앞에 3명 대기라고 해요",
      "지금 봉합 가능한지 물어보신 분 계신가요?",
      "화상 처치는 오늘 어렵다고 안내받았어요",
      "22시 30분까지 접수 받는대요",
      "대기 2시간이라고 합니다",
      "3살 아이인데 소아도 본다고 하네요",
    ]) {
      expect(findPii(text), text).toBeNull();
    }
  });

  it("시각·인원 같은 짧은 숫자는 통과한다", () => {
    expect(findPii("21:30 마감, 대기 5명")).toBeNull();
    expect(findPii("2026년 9월 29일")).toBeNull();
  });

  it("★ 이름처럼 보이는 말은 잡지 않는다 — 일반 낱말과 구분되지 않는다", () => {
    expect(findPii("김선생님이 계세요")).toBeNull();
    expect(findPii("이정도면 괜찮은 것 같아요")).toBeNull();
  });
});

describe("병원 대표번호는 통과시킨다", () => {
  const known = ["02-1234-5678", "031-987-6543"];

  it("★ 아는 병원 번호는 막지 않는다 — 도움이 되는 정보다", () => {
    expect(findPiiExcludingKnown("여기 02-1234-5678로 전화해 보세요", known)).toBeNull();
    expect(findPiiExcludingKnown("0212345678 로 확인했어요", known)).toBeNull();
  });

  it("★ 모르는 번호는 그대로 막는다 — '병원 번호처럼 보이면 통과'가 아니다", () => {
    expect(findPiiExcludingKnown("02-9999-8888 로 연락주세요", known)?.kind).toBe("phone");
    expect(findPiiExcludingKnown("010-1234-5678", known)?.kind).toBe("phone");
  });

  it("아는 번호가 없어도 동작한다", () => {
    expect(findPiiExcludingKnown("평범한 글입니다", [])).toBeNull();
    expect(findPiiExcludingKnown("010-1234-5678", [])?.kind).toBe("phone");
  });
});
