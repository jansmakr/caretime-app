"use client";

import { useEffect, useRef, useState } from "react";
import {
  describeSpeechError,
  speechRecognitionCtor,
  type SpeechRecognitionLike,
} from "@/features/chat/voice";

/**
 * 화면의 🎤 버튼. 누르면 듣고, 말이 끝나면 글자를 넘긴다.
 *
 * 마이크 권한은 **누른 뒤에만** 브라우저가 묻는다. 화면을 열 때 묻지 않는다.
 * 지원하지 않는 브라우저에서는 `fallback` 을 그린다(키보드 🎤 안내).
 *
 * 받아 적은 글은 바로 올라가지 않는다. 입력칸에 붙고, 사용자가 읽고 고친 뒤
 * "올리기"를 눌러야 올라간다 — 잘못 알아들은 말이 그대로 남는 일을 막는다.
 */
export function VoiceInputButton({
  onTranscript,
  fallback,
}: {
  onTranscript: (text: string) => void;
  fallback: React.ReactNode;
}) {
  // 서버 렌더와 첫 그림을 맞추려고 마운트 뒤에 지원 여부를 정한다.
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    setSupported(speechRecognitionCtor() !== null);
    return () => recognition.current?.abort();
  }, []);

  if (supported === false) return <>{fallback}</>;

  function toggle() {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const Ctor = speechRecognitionCtor();
    if (!Ctor) return;

    const r = new Ctor();
    r.lang = "ko-KR";
    r.interimResults = false;
    r.continuous = false;
    r.maxAlternatives = 1;
    r.onresult = (event) => {
      let text = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) text += result[0].transcript;
      }
      if (text.trim() !== "") onTranscript(text);
    };
    r.onerror = (event) => {
      const message = describeSpeechError(event.error);
      setNotice(message === "" ? null : message);
    };
    r.onend = () => setListening(false);

    recognition.current = r;
    setNotice(null);
    try {
      r.start();
      setListening(true);
    } catch {
      setListening(false);
      setNotice(describeSpeechError("unknown"));
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        disabled={supported === null}
        aria-pressed={listening}
        className={`flex min-h-[48px] w-full items-center justify-center gap-2 rounded-field px-4 text-[17px] font-semibold transition ${
          listening ? "bg-blue text-white" : "bg-blue-soft text-blue-deep"
        }`}
      >
        <span aria-hidden>🎤</span>
        {listening ? "듣고 있어요 · 다 말했으면 누르세요" : "눌러서 말로 입력하기"}
      </button>
      {notice && (
        <p role="alert" className="mt-1.5 break-keep text-[16px] leading-relaxed text-limited-ink">
          {notice}
        </p>
      )}
      <p className="mt-1.5 break-keep text-[16px] leading-relaxed text-ink-muted">
        말한 내용은 휴대폰 브라우저가 글자로 바꿉니다. 소리는 저장하지 않습니다.
      </p>
    </div>
  );
}
