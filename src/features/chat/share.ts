import type { ChatMessage, ChatScope } from "./types";

/**
 * 상황 공유 (카카오톡 · 맘카페 등).
 *
 * 공유 텍스트에 "지금 진료 가능"처럼 확정적인 말을 넣지 않는다.
 * 링크는 몇 시간 뒤에도 열리는데 그때 상황은 이미 다르다. 그래서 문구는 늘
 * "최신 현황 확인하기"로 끝난다 — 지금 값을 복사해 나르지 않고, 보러 오게 한다.
 */

export type ShareResult = "shared" | "copied" | "failed";

/** 병원명이 있으면 병원명, 없으면 지역. 둘 다 없으면 서비스 범위를 쓴다. */
export function sharePlace(scope: ChatScope): string {
  return (
    scope.hospitalName ??
    [scope.sido, scope.sigungu].filter(Boolean).join(" ") ??
    ""
  ) || "우리 지역";
}

/*
 * 문구에서 진료과목을 뺐다(2026-10-06). 전에는 "열상·화상"과 분류 라벨이 붙었다 —
 * 서비스를 전 과목·전 연령으로 열었으므로 공유받은 사람에게 **대상을 좁혀 보이면**
 * 안 된다. 분류는 화면에서 고르지도 않는다.
 */
export function buildShareText(scope: ChatScope, _category?: ChatMessage["category"]): string {
  return `[케어타임 실시간 현장] ${sharePlace(scope)} 최신 현황 확인하기`;
}

export function buildRoomShareText(): string {
  return "[케어타임 실시간 현장] 우리 동네 진료 현황 확인하기";
}

/**
 * 공유할 주소. 항상 톡방이다.
 *
 * 전에는 병원이 특정된 글을 그 병원 상세로 보냈다. 1차에는 그 화면이 닫혀 있어서
 * (404) 공유 링크가 깨진 화면을 열게 된다. 2차에 병원을 다시 켤 때 되살린다.
 */
export function buildShareUrl(origin: string, _scope: ChatScope): string {
  return `${origin}/chat`;
}

/**
 * Web Share API → 클립보드 → 임시 textarea 순으로 시도한다.
 * 어느 환경에서도 "아무 일도 일어나지 않는" 결과가 나오지 않게 단계를 둔다.
 * 사용자가 공유 시트를 닫은 것(AbortError)은 실패로 보지 않는다.
 */
export async function shareOrCopy(payload: { text: string; url: string }): Promise<ShareResult> {
  const { text, url } = payload;

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: "CareTime 실시간 현장", text, url });
      return "shared";
    } catch (e) {
      // 사용자가 시트를 닫았으면 복사까지 하지 않는다. 취소는 취소다.
      if (e instanceof DOMException && e.name === "AbortError") return "shared";
      // 그 밖의 실패는 복사로 내려간다.
    }
  }

  const payloadText = `${text}\n${url}`;

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(payloadText);
      return "copied";
    } catch {
      // 권한이 없거나 보안 컨텍스트가 아니면 아래로 내려간다.
    }
  }

  return legacyCopy(payloadText) ? "copied" : "failed";
}

/** clipboard API 를 못 쓰는 환경(구형 브라우저·비보안 컨텍스트)용 마지막 수단. */
function legacyCopy(value: string): boolean {
  if (typeof document === "undefined") return false;
  const area = document.createElement("textarea");
  area.value = value;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  try {
    area.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(area);
  }
}
