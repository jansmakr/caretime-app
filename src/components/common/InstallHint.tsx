"use client";

import { useEffect, useState } from "react";
import { rememberDismissed, useInstall, wasDismissed } from "@/features/pwa/install";

/**
 * 홈 화면에 추가 — **한 줄.**
 *
 * 글자는 14px 이다. 처음에 12.5px 로 만들었는데 원칙 2 의 하한 아래였다 — 내가
 * 만든 코드라 부채로 넘기지 않고 올렸다. 줄이 한 줄 늘어나는 것은 받아들인다.
 *
 * 배너로 만들지 않는다. 처음 온 사람이 하려는 일은 글을 읽는 것이고, 설치는 그
 * 사람이 다시 올 때를 위한 것이다. 화면을 먹으면 지금 할 일을 가린다(원칙 1).
 *
 * 두 자리에 같은 것을 둔다.
 *   · `variant="line"` — 홈 맨 아래 한 줄. **닫으면 다시 안 뜬다.**
 *   · `variant="row"`  — 더보기 메뉴의 한 항목. 닫는 버튼이 없고 늘 보인다.
 *     홈에서 닫은 사람이 나중에 마음을 바꿨을 때 찾아올 자리가 있어야 한다.
 *
 * 아무것도 그리지 않는 경우가 많다 — 이미 설치했거나, 데스크톱이거나, 크롬이
 * 아직 설치 가능으로 판단하지 않았을 때다. **빈 자리를 만들지 않는다.**
 */
export function InstallHint({ variant = "line" }: { variant?: "line" | "row" }) {
  const { way, install } = useInstall();
  /*
   * 닫힘은 마운트 뒤에 읽는다(localStorage). 서버에는 저장소가 없고, 여기서 값을
   * 만들면 서버와 화면이 달라진다. 그동안 `way` 도 "unknown" 이라 아무것도 그리지
   * 않으므로 깜빡이지 않는다.
   */
  const [closed, setClosed] = useState(true);
  useEffect(() => {
    setClosed(variant === "row" ? false : wasDismissed());
  }, [variant]);

  if (way === "unknown" || way === "none") return null;
  if (closed) return null;

  /*
   * "크롬 권장"을 붙인다. 일부 안드로이드 브라우저(삼성 인터넷 등)로 설치하면
   * 구글 **Play 프로텍트 경고**가 뜬다 — 설치하려던 사람이 그 화면에서 멈추고,
   * 그 경고는 우리가 없앨 수 없다. 미리 한 줄 적어 두는 쪽이 싸다.
   * iOS 에는 적지 않는다 — 사파리로만 설치되는 기기에 크롬을 권하면 길이 막힌다.
   */
  const text =
    way === "ios"
      ? "아이폰은 공유 버튼 → '홈 화면에 추가'"
      : "다음에 아이콘 하나로 바로 열 수 있습니다 · 크롬 권장";

  if (variant === "row") {
    return (
      <li className="flex items-center justify-between gap-3 px-5 py-4">
        <span className="break-keep text-[16px] font-medium">
          홈 화면에 추가
          <br />
          <span className="text-[14px] font-normal text-ink-faint">{text}</span>
        </span>
        {way === "button" && (
          <button
            type="button"
            onClick={() => void install()}
            className="min-h-[44px] shrink-0 rounded-field bg-blue-soft px-4 text-[14.5px] font-bold text-blue-deep"
          >
            추가
          </button>
        )}
      </li>
    );
  }

  return (
    <div className="mt-4 flex items-center gap-2 rounded-field bg-fill px-3.5 py-2">
      <p className="min-w-0 flex-1 break-keep text-[14px] leading-snug text-ink-muted">
        <span className="font-semibold text-ink">홈 화면에 추가</span> · {text}
      </p>

      {way === "button" && (
        <button
          type="button"
          onClick={() => void install()}
          className="min-h-[44px] shrink-0 rounded-field px-3 text-[13.5px] font-bold text-blue"
        >
          추가
        </button>
      )}

      {/*
        닫기. 한 번 닫으면 다시 뜨지 않는다 — 매번 묻는 안내가 가장 빨리 미움받는다.
        글자가 아니라 ×라서 무엇인지 모를 수 있으므로 aria-label 로 말한다.
      */}
      <button
        type="button"
        aria-label="홈 화면에 추가 안내 닫기"
        onClick={() => {
          rememberDismissed();
          setClosed(true);
        }}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-faint active:bg-line"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M6 6l12 12M18 6L6 18"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
