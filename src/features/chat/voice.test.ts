import { describe, expect, it } from "vitest";
import { appendTranscript, describeSpeechError } from "./voice";

describe("appendTranscript — 말한 것을 본문 뒤에 붙인다", () => {
  it("빈 본문이면 그대로 넣는다", () => {
    expect(appendTranscript("", " 지금 문 연 소아과 있나요 ", 10_000)).toEqual({
      body: "지금 문 연 소아과 있나요",
      truncated: false,
    });
  });

  it("쓰던 글을 지우지 않고 띄어쓰기 하나를 두고 붙인다", () => {
    expect(appendTranscript("마곡동인데", "열이 나요", 100).body).toBe("마곡동인데 열이 나요");
    expect(appendTranscript("마곡동인데 ", "열이 나요", 100).body).toBe("마곡동인데 열이 나요");
  });

  it("빈 말은 아무것도 바꾸지 않는다", () => {
    expect(appendTranscript("그대로", "   ", 100)).toEqual({ body: "그대로", truncated: false });
  });

  it("최대 길이를 넘으면 자르고 잘렸다고 알린다", () => {
    expect(appendTranscript("12345", "67890", 8)).toEqual({ body: "12345 67", truncated: true });
  });
});

describe("describeSpeechError — 원문을 그리지 않는다", () => {
  it("권한 거부는 키보드 마이크로 안내한다", () => {
    expect(describeSpeechError("not-allowed")).toContain("키보드의 🎤");
  });
  it("사용자가 멈춘 것은 안내하지 않는다", () => {
    expect(describeSpeechError("aborted")).toBe("");
  });
  it("모르는 오류도 한 줄 안내로 바뀐다", () => {
    expect(describeSpeechError("weird-internal-code")).not.toContain("weird");
  });
});
