/**
 * 거리·이동시간 (임시).
 *
 * 8단계 지도 어댑터 전까지는 사용자 위치를 받지 않는다. 위치정보 동의 UI 가 없기 때문이다.
 * 그동안은 데모 출발점(서울 강서구 가상 위치) 기준 직선거리와 대략의 이동시간만 계산한다.
 * 정렬은 여전히 거리 단일축이다. (Release Blocker 8)
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export const DEMO_ORIGIN: LatLng = { lat: 37.558, lng: 126.855 };

export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 도심 차량 기준 대략값. 짧게 잡으면 "지금 출발하면 마감 전 도착"을 잘못 말하게 되므로 넉넉히 둔다. */
export function estimateTravelMinutes(km: number): number {
  return Math.max(5, Math.round(8 + km * 3.7));
}
