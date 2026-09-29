/**
 * 기능 플래그 (PRD §11 말미).
 *
 * 네 개 모두 기본 OFF 다. PRD §16 도 "결제·제휴 커머스·내원 예정 공유는 플래그 OFF로 두어라"
 * 라고 지시한다. 그래서 기본값을 코드에 박고, 켜는 것은 환경값으로만 되게 한다 —
 * 실수로 배포에서 켜지는 방향이 아니라 명시적으로 켜는 방향이어야 한다.
 *
 * free_text_enabled 는 특히 운영 인력과 묶여 있다(§7.3):
 * 24시간 신고 대응을 확보하지 못하면 야간 자유메모는 OFF, 구조화 제보만 운영한다.
 */

/**
 * ⏳ 아직 어디서도 import 되지 않는다. 서버 API 라우트가 생기는 턴에 그 라우트가
 *    이 값을 읽어 기능을 켜고 끈다. 지금 화면은 lib/demoContent 의 판정만 쓴다.
 */

export interface FeatureFlags {
  /** 짧은 운영현황 자유메모(≤120자). 실시간 중재 인력이 없으면 OFF. (P0.1) */
  free_text_enabled: boolean;
  /** 관리용품 제휴 커머스. (P2) */
  commerce_enabled: boolean;
  /** 월 구독 결제. (P1) */
  billing_enabled: boolean;
  /** 내원 예정 공유. (P2) */
  arrival_share_enabled: boolean;
}

export const DEFAULT_FLAGS: FeatureFlags = {
  free_text_enabled: false,
  commerce_enabled: false,
  billing_enabled: false,
  arrival_share_enabled: false,
};

/** "1" · "true" · "on" 만 켜진 것으로 본다. 빈 값·오타는 OFF 다. */
function isOn(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on";
}

/**
 * 환경값에서 플래그를 읽는다. 서버에서만 부른다 —
 * NEXT_PUBLIC_ 이 아닌 이름을 쓰는 이유는 브라우저 번들에 플래그 상태를 싣지 않기 위해서다.
 * 화면에 필요한 값은 서버가 DTO 에 담아 내려보낸다.
 */
export function resolveFlags(env: Record<string, string | undefined> = process.env): FeatureFlags {
  return {
    free_text_enabled: isOn(env.FLAG_FREE_TEXT_ENABLED),
    commerce_enabled: isOn(env.FLAG_COMMERCE_ENABLED),
    billing_enabled: isOn(env.FLAG_BILLING_ENABLED),
    arrival_share_enabled: isOn(env.FLAG_ARRIVAL_SHARE_ENABLED),
  };
}

/**
 * 긴급 스위치 (PRD §11): 구조화 피드 쓰기를 멈추고 읽기는 유지한다.
 * 사고가 났을 때 서비스를 통째로 내리지 않고 쓰기만 닫기 위한 것이다.
 */
export function isWriteFrozen(env: Record<string, string | undefined> = process.env): boolean {
  return isOn(env.FLAG_FEED_WRITE_FROZEN);
}

/** 데모·시드 데이터를 화면에 낼 수 있는가. 운영에서는 내지 않는다. (PRD §2.2) */
export function allowDemoContent(env: Record<string, string | undefined> = process.env): boolean {
  // 명시적으로 켜거나 개발 환경일 때만. 운영 빌드의 기본값은 '내지 않는다'.
  if (isOn(env.FLAG_DEMO_CONTENT)) return true;
  return env.NODE_ENV !== "production";
}
