import { describe, expect, it } from "vitest";
import { checkBeforeSend } from "./composeCheck";
import { stripPhoneNumbers } from "@/features/p0/pii";

describe("checkBeforeSend — 올리기 전에 두 가지만 묻는다", () => {
  it("★ 전화번호가 있으면 phone", () => {
    expect(checkBeforeSend("제 번호 010-1234-5678 로 연락 주세요")).toBe("phone");
    expect(checkBeforeSend("02 1234 5678 로 전화해 보세요")).toBe("phone");
  });

  it("★ 진단·치료 판단을 묻는 글은 diagnosis", () => {
    for (const body of [
      "아이 이마가 찢어졌는데 꿰매야 하나요?",
      "열이 39도인데 응급실 가야 할까요",
      "해열제 또 먹여도 되나요",
      "이거 무슨 병인가요",
      "화상인데 괜찮을까요?",
      "흉터 남을까요",
      "사진 보고 진단해 주실 분",
    ]) {
      expect(checkBeforeSend(body), body).toBe("diagnosis");
    }
  });

  it("★ 현장을 알리거나 문 연 곳을 묻는 글은 묻지 않는다", () => {
    for (const body of [
      "지금 문 연 소아과 있나요?",
      "방금 다녀왔어요. 대기 20분이었어요.",
      "응급실에서 꿰매고 왔어요. 1시간 걸렸습니다.",
      "토요일 오후에도 진료하는 곳 어디예요?",
      "",
    ]) {
      expect(checkBeforeSend(body), body).toBeNull();
    }
  });

  it("둘 다 있으면 전화번호를 먼저 묻는다 — 되돌릴 수 없는 쪽이다", () => {
    expect(checkBeforeSend("010-1234-5678 인데 꿰매야 하나요")).toBe("phone");
  });
});

describe("stripPhoneNumbers — 번호만 지우고 나머지는 그대로", () => {
  it("번호를 지우고 띄어쓰기를 하나로 줄인다", () => {
    expect(stripPhoneNumbers("연락은 010-1234-5678 로 주세요")).toBe("연락은 로 주세요");
  });
  it("여러 개도 지운다", () => {
    expect(stripPhoneNumbers("010 1234 5678 / 02-123-4567")).toBe("/");
  });
  it("번호가 없으면 그대로", () => {
    expect(stripPhoneNumbers("대기 20분")).toBe("대기 20분");
  });
});
