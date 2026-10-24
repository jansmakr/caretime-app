import { describe, expect, it } from "vitest";
import { appendTranscript, describeSpeechError, punctuateSpeech } from "./voice";

describe("appendTranscript — 말한 것을 본문 뒤에 붙인다", () => {
  it("빈 본문이면 그대로 넣는다", () => {
    expect(appendTranscript("", " 지금 문 연 소아과 있나요 ", 10_000)).toEqual({
      body: "지금 문 연 소아과 있나요?",
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
    expect(appendTranscript("12345", "67890", 20)).toEqual({ body: "12345 67890", truncated: false });
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

describe("punctuateSpeech — 분명히 묻는 말에만 물음표, 마침표는 붙이지 않는다", () => {
  it("★ 분명히 묻는 끝맺음에는 물음표", () => {
    expect(punctuateSpeech("지금 문 연 소아과 있나요")).toBe("지금 문 연 소아과 있나요?");
    expect(punctuateSpeech("응급실 가야 할까요")).toBe("응급실 가야 할까요?");
    expect(punctuateSpeech("거기 아직 하는지요")).toBe("거기 아직 하는지요?");
    expect(punctuateSpeech("토요일에도 진료하는 곳인가요")).toBe("토요일에도 진료하는 곳인가요?");
  });

  it("★ 마침표는 자동으로 붙이지 않는다", () => {
    expect(punctuateSpeech("열이 나요")).toBe("열이 나요");
    expect(punctuateSpeech("방금 다녀왔는데 대기 없었어요")).toBe("방금 다녀왔는데 대기 없었어요");
  });

  it("★ 묻는지 알리는지 갈리지 않으면 아무것도 붙이지 않는다", () => {
    expect(punctuateSpeech("지금 병원 가요")).toBe("지금 병원 가요"); // 간다
    expect(punctuateSpeech("어디 다녀왔어요")).toBe("어디 다녀왔어요"); // 물음말 + ~요
    expect(punctuateSpeech("대기 몇 분 걸려요")).toBe("대기 몇 분 걸려요");
    expect(punctuateSpeech("그렇죠")).toBe("그렇죠");
  });

  it("말로 부른 부호를 바꾼다", () => {
    expect(punctuateSpeech("강서구예요 쉼표 지금 문 연 곳 있나요 물음표")).toBe("강서구예요, 지금 문 연 곳 있나요?");
    expect(punctuateSpeech("다녀왔어요 마침표")).toBe("다녀왔어요.");
  });

  it("문장 속에 쓴 부호 이름은 그대로 둔다", () => {
    expect(punctuateSpeech("물음표를 넣고 싶어요")).toBe("물음표를 넣고 싶어요");
  });

  it("이미 부호가 있으면 더 붙이지 않는다", () => {
    expect(punctuateSpeech("열이 나요!")).toBe("열이 나요!");
    expect(punctuateSpeech("있나요?")).toBe("있나요?");
  });

  it("빈 말은 빈 문자열", () => {
    expect(punctuateSpeech("   ")).toBe("");
  });
});
