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
 * 최대 길이를 넘으면 잘라서 붙이고, 잘렸는지를 함께 돌려준다(잘린 줄 모르고
 * 올리는 것을 막는다).
 */
export function appendTranscript(
  body: string,
  transcript: string,
  max: number,
): { body: string; truncated: boolean } {
  const said = transcript.replace(/\s+/g, " ").trim();
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
