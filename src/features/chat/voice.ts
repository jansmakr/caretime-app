/**
 * 화면의 🎤 버튼 — 말한 것을 글자로 바꿔 입력칸에 붙인다.
 *
 * ── 소리는 우리 서버에 오지 않는다 ──────────────────────────
 * 브라우저에 들어 있는 음성 인식(Web Speech API)을 쓴다. 소리를 글자로 바꾸는 일은
 * **브라우저 제조사**가 한다 — 크롬은 구글 서버, 사파리는 애플(기기 또는 애플 서버).
 * 우리가 받는 것은 사용자가 확인하고 "올리기"를 누른 글자뿐이다. 녹음 파일을 만들지
 * 않고, 소리를 저장하거나 보내지 않는다(방침 1-7).
 *
 * 지원하지 않는 브라우저(파이어폭스·일부 앱 안 브라우저)에서는 버튼을 그리지 않고
 * 전처럼 "키보드의 🎤" 안내 한 줄을 둔다.
 */

/** 브라우저 음성 인식의 최소 모양. 표준 타입이 아직 lib.dom 에 없다. */
export interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

export interface SpeechResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

type SpeechCtor = new () => SpeechRecognitionLike;

export function speechRecognitionCtor(): SpeechCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * 받아 적은 말을 본문 뒤에 붙인다. **순수 함수다.**
 *
 * 쓰던 글을 지우지 않는다 — 말로 이어 붙이는 것이다. 사이에 띄어쓰기 하나를 둔다.
 * 붙이기 전에 문장부호를 채운다(punctuateSpeech).
 * 최대 길이를 넘으면 잘라서 붙이고, 잘렸는지를 함께 돌려준다(잘린 줄 모르고
 * 올리는 것을 막는다).
 */
export function appendTranscript(
  body: string,
  transcript: string,
  max: number,
): { body: string; truncated: boolean } {
  const said = punctuateSpeech(transcript);
  if (said === "") return { body, truncated: false };
  const joiner = body === "" || /\s$/.test(body) ? "" : " ";
  const next = body + joiner + said;
  if (next.length <= max) return { body: next, truncated: false };
  return { body: next.slice(0, max), truncated: true };
}

/** 인식 오류 → 한 줄 안내. 원문을 그대로 그리지 않는다. */
export function describeSpeechError(error: string): string {
  if (error === "not-allowed" || error === "service-not-allowed")
    return "마이크 권한이 꺼져 있습니다. 키보드의 🎤를 써 주세요.";
  if (error === "no-speech") return "말소리가 들리지 않았습니다. 다시 눌러 말해 주세요.";
  if (error === "network") return "인터넷 연결이 불안정합니다. 키보드의 🎤를 써 주세요.";
  if (error === "aborted") return "";
  return "음성 입력을 쓸 수 없습니다. 키보드의 🎤를 써 주세요.";
}

/* ────────────────────────────────────────────────────────────
 * 구두점 보정
 * ──────────────────────────────────────────────────────────── */

/**
 * 말로 부른 문장부호. "물음표"라고 말하면 "?"가 들어간다.
 * 낱말 하나로 따로 떨어져 있을 때만 바꾼다 — "쉼표를"처럼 문장 속에 쓴 말은 그대로 둔다.
 */
const SPOKEN_MARKS: [RegExp, string][] = [
  [/(^|\s)(물음표)(?=\s|$)/g, "?"],
  [/(^|\s)(느낌표)(?=\s|$)/g, "!"],
  [/(^|\s)(마침표|온점)(?=\s|$)/g, "."],
  [/(^|\s)(쉼표|반점)(?=\s|$)/g, ","],
];

/**
 * **분명히** 묻는 끝맺음. 이것으로 끝날 때만 "?"를 붙인다.
 *
 * 넣지 않은 것: "~가요"("병원 가요" = 간다), "~요"+물음말("어디 다녀왔어요"는 알리는
 * 말일 수 있다), "~래요"·"~죠"(묻기도 하고 알리기도 한다). 틀린 "?"는 알리는 글을
 * 묻는 글로 바꿔 읽게 한다 — 모르면 붙이지 않는다.
 * "나요"는 낱말 하나일 때 "열이 나요"(난다)라서 앞에 글자가 붙은 것만 본다(있나요·되나요).
 */
const QUESTION_END = /(까요|.까|.나요|던가요|는가요|은가요|인가요|는지요|냐)$/;

/** 이미 문장부호로 끝났는가. */
const ENDS_WITH_MARK = /[.?!,…~]$/;

/**
 * 받아 적은 말에 문장부호를 채운다. **순수 함수다.**
 *
 * 브라우저 음성 인식은 한국어에 부호를 거의 붙이지 않는다. 묻는 글에 "?"가 없으면
 * 읽는 사람이 알림으로 읽고 지나간다.
 *
 * 하는 일은 셋뿐이다.
 *   ① "물음표"·"마침표"·"쉼표"·"느낌표"라고 말한 것을 부호로 바꾼다
 *   ② 끝맺음이 **분명히 묻는 말일 때만** "?"를 붙인다
 *   ③ 부호 앞의 띄어쓰기를 지운다
 *
 * **"."는 자동으로 붙이지 않는다**(2026-10-18). 말이 끝났는지 이어지는지 알 수 없고,
 * 이어서 말하면 문장 가운데에 "."가 박힌다. 마침표가 필요하면 "마침표"라고 말하면 된다.
 * 문장 가운데도 끊지 않는다 — 인식기가 문장 경계를 주지 않는다.
 */
export function punctuateSpeech(transcript: string): string {
  let text = transcript.replace(/\s+/g, " ").trim();
  if (text === "") return "";

  for (const [pattern, mark] of SPOKEN_MARKS) text = text.replace(pattern, (_m, lead) => `${lead}${mark}`);
  // "있나요 ?" → "있나요?"
  text = text.replace(/\s+([.?!,])/g, "$1").replace(/^[.,]\s*/, "").trim();
  if (text === "" || ENDS_WITH_MARK.test(text)) return text;

  const lastWord = text.split(" ").pop() ?? text;
  return QUESTION_END.test(lastWord) ? `${text}?` : text;
}
