"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * 홈 화면에 추가 — 설치 가능 여부와 설치 실행.
 *
 * ── 왜 모듈 단위로 이벤트를 붙잡는가 ────────────────────────
 * 크롬은 `beforeinstallprompt` 를 **페이지 로드당 한 번** 던진다. 컴포넌트 안에서만
 * 받으면, 그 컴포넌트가 사라진 뒤(홈 → 더보기 이동) 다시 받을 길이 없어 더보기의
 * 버튼이 영영 안 뜬다. 그래서 모듈에 한 번 받아 두고 어느 화면에서든 쓴다.
 *
 * ── iOS 는 버튼을 만들 수 없다 ──────────────────────────────
 * 사파리에 `beforeinstallprompt` 가 없다. 설치는 **사용자가 공유 메뉴에서 직접**
 * 해야 한다. 그래서 iOS 에는 버튼 대신 한 줄 안내만 둔다 — 버튼을 만들어 두고
 * 눌러도 아무 일이 없게 하는 것이 가장 나쁘다.
 */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** 크롬이 던진 이벤트. 받아 두지 않으면 사라진다. */
let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function announce(): void {
  for (const fn of listeners) fn();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // 크롬 자체 안내 띠를 막고 우리가 고른 자리에서 권한다.
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    announce();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    announce();
  });
}

const DISMISS_KEY = "caretime_install_dismissed";

/** 이미 바로가기로 열려 있는가. 그렇다면 설치를 권할 이유가 없다. */
export function isStandalone(): boolean {
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
    // iOS 사파리는 display-mode 를 늦게 지원했다. 비표준 속성도 본다.
    return (window.navigator as { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

/** iOS 인가. 아이패드는 데스크톱 UA 로 오므로 터치 지원까지 함께 본다. */
export function isIos(): boolean {
  try {
    const ua = window.navigator.userAgent;
    if (/iPhone|iPod/.test(ua)) return true;
    return /iPad/.test(ua) || (/Macintosh/.test(ua) && window.navigator.maxTouchPoints > 1);
  } catch {
    return false;
  }
}

export function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    // 저장소가 막혔으면 "안 닫았다"로 본다. 닫은 기억을 못 하는 쪽이 덜 나쁘다.
    return false;
  }
}

export function rememberDismissed(): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // 못 적어도 이번 화면에서는 상태로 사라진다.
  }
}

export type InstallWay =
  /** 아직 모른다(마운트 전). 아무것도 그리지 않는다. */
  | "unknown"
  /** 안드로이드·크롬. 버튼을 눌러 설치한다. */
  | "button"
  /** iOS 사파리. 공유 메뉴 안내만 할 수 있다. */
  | "ios"
  /** 설치돼 있거나, 이 브라우저에서는 길이 없다. */
  | "none";

/**
 * 어떻게 권할 수 있는가.
 *
 * 처음에는 늘 `unknown` 이다 — 서버 렌더에는 브라우저가 없고, 여기서 값을 만들면
 * 서버와 화면이 달라진다(hydration). 마운트 뒤에 정해진다.
 */
export function useInstall(): { way: InstallWay; install: () => Promise<void> } {
  const [way, setWay] = useState<InstallWay>("unknown");

  useEffect(() => {
    const decide = () => {
      if (isStandalone()) return setWay("none");
      if (deferred) return setWay("button");
      if (isIos()) return setWay("ios");
      setWay("none");
    };
    decide();
    listeners.add(decide);
    return () => {
      listeners.delete(decide);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    const event = deferred;
    /*
     * 한 번 쓴 이벤트는 다시 쓸 수 없다. 먼저 비워 두지 않으면 두 번째 누름이
     * 조용히 실패한다.
     */
    deferred = null;
    await event.prompt();
    await event.userChoice;
    announce();
  }, []);

  return { way, install };
}
