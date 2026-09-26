"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 짧은 알림. "링크가 복사되었습니다" 한 줄을 띄우는 용도다.
 *
 * 하단 고정 메뉴(BottomNav) 위에 뜨도록 위치를 잡는다. 메뉴에 가리면 못 읽는다.
 * 스크린리더에는 role="status" 로 한 번 읽히고, 애니메이션은 줄임 설정을 따른다(globals.css).
 */
const VISIBLE_MS = 2200;

export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((text: string) => {
    setMessage(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), VISIBLE_MS);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { message, show };
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom))] z-50 flex justify-center px-6"
    >
      <p className="max-w-app rounded-pill bg-ink/92 px-4 py-2.5 text-center text-[14px] font-semibold text-white">
        {message}
      </p>
    </div>
  );
}
