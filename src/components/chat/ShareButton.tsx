"use client";

import { useState } from "react";
import { buildShareUrl, shareOrCopy } from "@/features/chat/share";
import type { ChatScope } from "@/features/chat/types";

/**
 * 상황 공유하기.
 *
 * 모바일은 navigator.share(공유 시트 → 카카오톡 등), 미지원 환경은 URL 복사 + 토스트.
 * 어떤 경로였는지 눌린 사람이 알 수 있게 결과에 따라 다른 문구를 띄운다.
 */
export function ShareButton({
  text,
  scope,
  onResult,
  variant = "chip",
}: {
  text: string;
  scope: ChatScope;
  onResult: (message: string) => void;
  variant?: "chip" | "block";
}) {
  const [pending, setPending] = useState(false);

  async function handle() {
    setPending(true);
    // origin 은 브라우저에서만 읽는다. 서버 렌더 때는 이 함수가 불리지 않는다.
    const url = buildShareUrl(window.location.origin, scope);
    const result = await shareOrCopy({ text, url });
    setPending(false);
    if (result === "copied") onResult("링크가 복사되었습니다");
    else if (result === "failed") onResult("공유할 수 없습니다. 주소창의 링크를 복사해 주세요");
  }

  if (variant === "block") {
    return (
      <button
        type="button"
        onClick={() => void handle()}
        disabled={pending}
        className="flex h-11 w-full items-center justify-center gap-1.5 rounded-field bg-blue-soft
                   text-[14.5px] font-semibold text-blue-deep transition active:scale-[0.98] active:brightness-95"
      >
        상황 공유하기 <span aria-hidden>🔗</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void handle()}
      disabled={pending}
      className="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-pill bg-fill px-3
                 text-[12.5px] font-semibold text-ink-muted transition active:scale-[0.97] active:brightness-95"
    >
      공유 <span aria-hidden>🔗</span>
    </button>
  );
}
