import { describe, expect, it } from "vitest";
import { findAbuse } from "./abuse";

/**
 * 거르는 것보다 **멀쩡한 글을 막지 않는 것**을 더 크게 본다.
 *
 * 이 서비스는 "가보니 어땠나요"를 묻는 곳이다. 후기가 막히면 쓸 글이 없어지고,
 * 한 번 막힌 사람은 다시 쓰지 않는다. 그래서 통과해야 하는 쪽 테스트를 먼저 둔다.
 */
describe("막지 않아야 하는 글", () => {
  it("★ 의료 글에 실제로 나오는 말이 막히지 않는다", () => {
    for (const ok of [
      "발병 신고를 어디에 하나요?",
      "새끼손가락을 다쳤는데 봐 주시나요",
      "새끼발가락 골절로 갔습니다",
      "시발점이 어디인가요",
      "병신고 절차가 궁금합니다",
      "아이가 밤새 열이 나서 응급실 갔어요",
      "접수 마감됐다고 안내받았습니다",
    ]) {
      expect(findAbuse(ok), ok).toBeNull();
    }
  });

  it("★ 비판은 욕이 아니다 — 불만을 적을 수 있어야 한다", () => {
    for (const ok of [
      "대기가 두 시간이었습니다. 다시는 안 갈 것 같아요",
      "설명이 너무 짧아서 아쉬웠어요",
      "접수 안내가 불친절했습니다",
      "최악이었어요. 세 시간 기다렸습니다",
    ]) {
      expect(findAbuse(ok), ok).toBeNull();
    }
  });
});

describe("막아야 하는 글", () => {
  it("★ 기본형", () => {
    for (const bad of ["씨발 뭐하는 거야", "이런 병신같은", "지랄하지 마", "개새끼들"]) {
      expect(findAbuse(bad), bad).not.toBeNull();
    }
  });

  it("★ 기호로 끼워 넣은 것도 잡는다 — 공백은 건드리지 않는다", () => {
    expect(findAbuse("시*발")).not.toBeNull();
    expect(findAbuse("시.발")).not.toBeNull();
    expect(findAbuse("ㅅㅂ 진짜")).not.toBeNull();
  });

  it("★ 기호를 길게 늘인 것도 잡는다", () => {
    // 끼운 기호가 셋 이상이면 정규화가 둘로 줄여서 GAP 안에 들어온다.
    expect(findAbuse("시!!!!발")).not.toBeNull();
    expect(findAbuse("씨~~~~발")).not.toBeNull();
  });

  it("★ 무엇이 걸렸는지 알려 준다 — 그래야 고친다", () => {
    const found = findAbuse("아니 병신아");
    expect(found).not.toBeNull();
    expect(found?.matched).toBe("병신");
    expect(found?.message).toContain("병신");
    expect(found?.message).toContain("다시 올려 주세요");
  });
});

describe("못 막는 것 — 알고 간다", () => {
  it("★ 문맥 비방은 통과한다. 이건 신고가 맡는다", () => {
    /*
     * 이 테스트는 "고쳐야 할 구멍"이 아니다. **의도한 한계를 고정한 것**이다.
     * 여기를 막으려고 규칙을 늘리면 위의 "막지 않아야 하는 글"이 깨진다.
     * 그래서 화면 문구에 "절대 막는다"고 쓰지 않는다 — 거짓이 되기 때문이다.
     */
    expect(findAbuse("○○병원 불친절해요. 다시는 가지 마세요")).toBeNull();
    expect(findAbuse("거기 의사 실력 없는 듯")).toBeNull();
  });

  it("공백을 넣어 쪼갠 것은 통과한다 — 공백을 지우면 멀쩡한 글이 막힌다", () => {
    expect(findAbuse("ㅅ ㅂ")).toBeNull();
  });

  it("글자를 끼워 늘린 것은 통과한다 — 글자를 지우면 멀쩡한 낱말이 부서진다", () => {
    /*
     * "씨이이이발". 끼운 것이 기호가 아니라 **글자**라 GAP 에 들어오지 않는다.
     * 잡으려면 모음을 지우고 봐야 하는데, 그러면 "시외버스"가 "시버스"가 되는 식으로
     * 멀쩡한 말이 부서지고 오탐이 는다. 여기까지가 첫 번째 체다.
     */
    expect(findAbuse("씨이이이발")).toBeNull();
  });
});
