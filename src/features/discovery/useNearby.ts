"use client";

import { useCallback, useState } from "react";
import { useDiscovery } from "./DiscoveryProvider";

/**
 * [내 주변] — 위치 권한.
 *
 * 규칙:
 *  - **누를 때만** 요청한다. 화면 진입만으로 권한 창을 띄우지 않는다.
 *  - `maximumAge: 0` — 캐시된 이전 위치를 현재 위치로 재사용하지 않는다.
 *  - 거부·시간 초과·오류 어느 쪽이든 지역 검색으로 계속 갈 수 있게 상태만 알려준다.
 *    실패를 막다른 화면으로 만들지 않는다.
 *  - 좌표는 Provider 메모리로만 넘긴다. 저장소·URL·로그에 쓰지 않는다.
 */

export type NearbyStatus =
  | "idle"
  | "requesting"
  | "granted"
  | "denied"
  | "timeout"
  | "unavailable"
  | "unsupported";

/** 너무 길면 급한 사람이 기다리다 나간다. 8초에서 끊고 지역 검색을 권한다. */
const TIMEOUT_MS = 8_000;

export const NEARBY_MESSAGE: Record<NearbyStatus, string | null> = {
  idle: null,
  requesting: "현재 위치를 확인하고 있어요…",
  granted: null,
  denied: "위치 권한이 꺼져 있어요. 지역을 직접 선택해 주세요.",
  timeout: "현재 위치를 확인하지 못했어요. 지역을 직접 선택해 주세요.",
  unavailable: "현재 위치를 확인할 수 없어요. 지역을 직접 선택해 주세요.",
  unsupported: "이 브라우저에서는 현재 위치를 쓸 수 없어요. 지역을 직접 선택해 주세요.",
};

export function useNearby() {
  const { useDeviceOrigin } = useDiscovery();
  const [status, setStatus] = useState<NearbyStatus>("idle");

  const request = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unsupported");
      return;
    }
    setStatus("requesting");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        useDeviceOrigin({ lat: position.coords.latitude, lng: position.coords.longitude });
        setStatus("granted");
      },
      (error) => {
        // 코드별로 다른 문구를 준다. 전부 "오류"로 묶으면 무엇을 해야 할지 알 수 없다.
        if (error.code === error.PERMISSION_DENIED) setStatus("denied");
        else if (error.code === error.TIMEOUT) setStatus("timeout");
        else setStatus("unavailable");
      },
      { enableHighAccuracy: false, timeout: TIMEOUT_MS, maximumAge: 0 },
    );
  }, [useDeviceOrigin]);

  const clear = useCallback(() => setStatus("idle"), []);

  return { status, request, clear, message: NEARBY_MESSAGE[status] };
}
