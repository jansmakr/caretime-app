/**
 * 공식 상태 계약 (PRD §6.2 상태 머신 · §9.2 상태 파생 규칙).
 *
 * 이 파일이 P0 에서 가장 중요한 단일 지점이다. PRD §15 가 "만료 상태의 진료 가능 표기"를
 * 공개 출시 보류 사유로 못박았기 때문이다.
 *
 * 규칙: 만료 판정은 **읽는 순간마다** 여기서 한다. 만료 배치(job)가 늦어도,
 * 브라우저 시계가 틀려도 결과가 바뀌지 않아야 한다. 그래서 모든 함수가 now 를 인자로 받고
 * 내부에서 Date.now() 를 읽지 않는다. 서버는 서버 시각을, 화면은 server_time 을 넣는다.
 *
 * 기존 코드와의 관계: `lib/freshness.ts` 가 같은 역할을 하고 있었다(README 2항).
 * 그 규칙은 그대로 맞고, PRD 계약(UNVERIFIED · wait_bucket · 충돌)만 여기서 더한다.
 */

/**
 * DB 에 저장되는 상태. (PRD §6.2)
 *
 * LIMITED 를 PAUSED 와 합치지 않는다. 둘은 병원이 말하는 내용이 다르다.
 *  - LIMITED : 열려 있지만 일부 처치가 안 된다. 재개 시각 개념이 없다.
 *  - PAUSED  : 지금 멈췄고 언제 재개할지 알릴 수 있다.
 */
export type ServiceStatus = "AVAILABLE" | "LIMITED" | "CLOSED" | "PAUSED" | "UNKNOWN";

/**
 * 화면에 내보내는 상태. 저장값에 없는 두 가지가 파생으로만 생긴다.
 *  - UNVERIFIED: 기관 심사가 끝나지 않았다. 승인 전에는 공식 상태를 내보내지 않는다.
 *  - UNKNOWN(reason=EXPIRED): 유효시간이 지났다. EXPIRED 는 DB 값이 아니다.
 */
export type DerivedStatus = ServiceStatus | "UNVERIFIED";

export type StatusReason = "EXPIRED" | "NEVER_SET" | "NOT_APPROVED";

/** 대기 시간. 임의의 정확한 분으로 바꾸지 않는다. (PRD §6.1 · §13 WaitBucketPicker) */
export type WaitBucket = "UNKNOWN" | "LE30" | "FROM30TO60" | "GE60";

export const WAIT_BUCKETS: WaitBucket[] = ["UNKNOWN", "LE30", "FROM30TO60", "GE60"];

export const WAIT_BUCKET_TEXT: Record<WaitBucket, string> = {
  UNKNOWN: "미확인",
  LE30: "30분 이내",
  FROM30TO60: "30~60분",
  GE60: "60분 이상",
};

/** 기관 심사 상태. (PRD §9.1 hospitals.verification_state) */
export type VerificationState = "PENDING" | "UNDER_REVIEW" | "NEEDS_INFO" | "APPROVED" | "REJECTED";

// ─── 유효시간 정책 (PRD §6.2) ──────────────────────────────

/** 직원이 고를 수 있는 유효시간. 기본 30분. */
export const VALID_FOR_CHOICES_MINUTES = [15, 30, 60] as const;
export const DEFAULT_VALID_FOR_MINUTES = 30;

/** AVAILABLE·LIMITED·PAUSED 최대 60분. 그 이상은 "지금 되는지"를 보장할 수 없다. */
export const MAX_OPEN_VALID_MINUTES = 60;
/** CLOSED 는 근무 종료까지 유지될 수 있으나 12시간을 넘기지 않는다. */
export const MAX_CLOSED_VALID_MINUTES = 12 * 60;

export function maxValidMinutesFor(status: ServiceStatus): number {
  return status === "CLOSED" ? MAX_CLOSED_VALID_MINUTES : MAX_OPEN_VALID_MINUTES;
}

/**
 * 저장할 valid_until 계산. 상한을 넘기면 자르지 않고 거절한다 —
 * 직원이 60분을 눌렀는데 조용히 30분으로 저장되면 화면과 실제가 어긋난다.
 */
export function validUntilFor(
  status: ServiceStatus,
  minutes: number,
  now: Date,
): { ok: true; validUntil: Date } | { ok: false; code: "INVALID_VALID_FOR"; max: number } {
  const max = maxValidMinutesFor(status);
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > max) {
    return { ok: false, code: "INVALID_VALID_FOR", max };
  }
  return { ok: true, validUntil: new Date(now.getTime() + minutes * 60_000) };
}

// ─── 상태 머신 (PRD §6.2) ──────────────────────────────────

/**
 * 허용된 전이만 통과시킨다.
 * 같은 값으로의 전이(연장)는 새 입력이므로 허용한다 — 만료된 AVAILABLE 을 다시 켜는 경우다.
 * UNKNOWN 으로는 저장하지 않는다. 파생·초기값이다.
 */
export function canTransition(from: ServiceStatus, to: ServiceStatus): boolean {
  if (to === "UNKNOWN") return false; // UNKNOWN 은 저장하는 값이 아니라 파생·초기값이다.
  switch (from) {
    case "UNKNOWN":
      // 미확인·만료에서 직원이 처음 누르는 값. '일시 중단'을 첫 입력으로 두지 않는다 —
      // 무엇을 중단했는지가 없으면 보호자가 읽을 수 없다.
      return to === "AVAILABLE" || to === "LIMITED" || to === "CLOSED";
    case "AVAILABLE":
      return to === "AVAILABLE" || to === "LIMITED" || to === "PAUSED" || to === "CLOSED";
    case "LIMITED":
      return to === "AVAILABLE" || to === "LIMITED" || to === "PAUSED" || to === "CLOSED";
    case "PAUSED":
      return to === "AVAILABLE" || to === "LIMITED" || to === "PAUSED" || to === "CLOSED";
    case "CLOSED":
      // 마감에서 곧바로 '일시 중단'으로 가지 않는다. 다시 열거나(가능·제한) 마감 유지뿐이다.
      return to === "AVAILABLE" || to === "LIMITED" || to === "CLOSED";
  }
}

// ─── 상태 파생 (PRD §9.2) ──────────────────────────────────

export interface StoredStatus {
  status: ServiceStatus;
  waitBucket: WaitBucket;
  /** null = 아직 한 번도 게시되지 않음. */
  validUntil: string | null;
  updatedAt: string | null;
  /** 재개 예정 시각. 안내일 뿐이며 도달해도 자동으로 AVAILABLE 이 되지 않는다. */
  reopenAt?: string | null;
}

export interface OfficialStatusView {
  status: DerivedStatus;
  reason: StatusReason | null;
  waitBucket: WaitBucket;
  /** 만료 전까지 남은 시각. 만료·미승인이면 null 이다. */
  validUntil: string | null;
  updatedAt: string | null;
  reopenAt: string | null;
  /** 지금 이 값을 '현재 접수 가능'으로 읽어도 되는가. */
  usableNow: boolean;
  source: "HOSPITAL";
}

/**
 * PRD §9.2 의 의사코드를 그대로 옮긴 것.
 *
 *   if verification != APPROVED  → UNVERIFIED
 *   else if now >= valid_until   → UNKNOWN(reason=EXPIRED)
 *   else                         → stored status
 *
 * 만료된 값을 stale-while-revalidate 로 '가능'으로 재사용하지 않는다. (PRD §9.2 말미)
 */
export function deriveOfficialStatus(input: {
  verificationState: VerificationState;
  stored: StoredStatus | null;
  now: Date;
}): OfficialStatusView {
  const { verificationState, stored, now } = input;

  const base: OfficialStatusView = {
    status: "UNKNOWN",
    reason: null,
    waitBucket: "UNKNOWN",
    validUntil: null,
    updatedAt: stored?.updatedAt ?? null,
    reopenAt: stored?.reopenAt ?? null,
    usableNow: false,
    source: "HOSPITAL",
  };

  if (verificationState !== "APPROVED") {
    return { ...base, status: "UNVERIFIED", reason: "NOT_APPROVED" };
  }
  if (!stored || stored.validUntil === null) {
    return { ...base, reason: "NEVER_SET" };
  }

  const expiresAt = Date.parse(stored.validUntil);
  // 파싱할 수 없는 시각은 만료로 본다. 읽을 수 없는 값을 '가능'으로 쓰지 않는다.
  if (Number.isNaN(expiresAt) || now.getTime() >= expiresAt) {
    return { ...base, reason: "EXPIRED" };
  }

  return {
    status: stored.status,
    reason: null,
    waitBucket: stored.waitBucket,
    validUntil: stored.validUntil,
    updatedAt: stored.updatedAt,
    reopenAt: stored.reopenAt ?? null,
    // LIMITED·PAUSED·CLOSED 는 유효해도 '지금 접수 가능'이 아니다.
    // LIMITED 를 여기 넣으면 "일부 제한"이 "접수 가능"으로 읽힌다.
    usableNow: stored.status === "AVAILABLE",
    source: "HOSPITAL",
  };
}

// ─── 화면 표현 (PRD §6.3 · §7.2) ───────────────────────────

/** 상태색은 4개만 쓴다. (기획안 53항 · components/common/StatusPill) */
export type StatusTone = "confirmed" | "caution" | "limited" | "unverified";

/**
 * 상태 문구.
 *
 * LIMITED 와 PAUSED 를 다르게 쓴다. 병원이 말한 내용이 다르고, 보호자가 기대할 것도 다르다.
 *  - LIMITED : 문은 열려 있는데 특정 처치가 안 된다. "무엇이 안 되는지"는 사유 필드에 있다.
 *              재개 시각을 붙이지 않는다 — 기다리면 되는 일이 아니다.
 *  - PAUSED  : 지금 멈췄고 다시 열 예정이다. 재개 예정 시각을 붙일 수 있다.
 *
 * 어느 문구도 "진료 가능"이라고 확정하지 않는다. 병원이 확인한 시점의 값이다. (§7.2)
 */
export const STATUS_TEXT: Record<DerivedStatus, string> = {
  AVAILABLE: "확인 당시 접수 가능",
  LIMITED: "일부 제한 · 전화 확인 필요",
  PAUSED: "일시 중단",
  CLOSED: "오늘 접수 마감",
  UNKNOWN: "현재 상태 확인 필요",
  UNVERIFIED: "의료기관 확인 정보 없음",
};

export const STATUS_TONE: Record<DerivedStatus, StatusTone> = {
  AVAILABLE: "confirmed",
  LIMITED: "caution",
  PAUSED: "limited",
  CLOSED: "limited",
  UNKNOWN: "unverified",
  UNVERIFIED: "unverified",
};

/**
 * 재개 예정 시각을 붙일 수 있는 상태.
 *
 * PAUSED 뿐이다. LIMITED 는 reopen_at 컬럼에 값이 들어 있어도 보여주지 않는다 —
 * "일부 제한"에 시각을 붙이면 그때 그 처치가 된다는 뜻으로 읽힌다. 그건 병원이 한 말이 아니다.
 * 그리고 재개 시각이 지나도 자동으로 AVAILABLE 이 되지 않는다. (§6.2)
 */
export function showsReopenAt(status: DerivedStatus): boolean {
  return status === "PAUSED";
}

/**
 * 화면에 그대로 넣을 수 있는 한 줄.
 * formatClock 은 화면 계층(lib/freshness.formatClock)이 갖고 있으므로 여기서는
 * 붙일지 말지와 원본 ISO 만 돌려준다. 시간대 포맷을 두 곳에서 하지 않는다.
 */
export function describeServiceStatus(view: OfficialStatusView): {
  tone: StatusTone;
  text: string;
  /** 붙여도 되는 재개 예정 시각(ISO). 없으면 null. */
  reopenAt: string | null;
} {
  return {
    tone: STATUS_TONE[view.status],
    text: STATUS_TEXT[view.status],
    reopenAt: showsReopenAt(view.status) ? view.reopenAt : null,
  };
}

export function isExpiredView(view: OfficialStatusView): boolean {
  return view.status === "UNKNOWN" && view.reason === "EXPIRED";
}

// ─── 공식·제보 충돌 (PRD §3.4 말미 · §9.2) ─────────────────

/**
 * 충돌은 지우지 않고 양쪽을 다 보여준다. (PRD §3.4)
 * 다수결로 공식 상태를 바꾸거나, 공식 상태로 제보를 숨기지 않는다.
 */
export type ConflictKind = "OFFICIAL_OPEN_VS_REPORTED_CLOSED" | "OFFICIAL_CLOSED_VS_REPORTED_OPEN";

export function detectConflict(input: {
  official: OfficialStatusView;
  /** 유효한 CLOSED_REPORTED 관찰 건수. */
  closedReports: number;
  /** 유효한 '접수 가능' 계열 관찰 건수. */
  openReports: number;
}): ConflictKind | null {
  const { official, closedReports, openReports } = input;
  // 만료·미승인 상태는 비교 대상이 아니다. 충돌이 아니라 그냥 미확인이다.
  if (official.reason !== null) return null;

  if (official.status === "AVAILABLE" && closedReports > 0) {
    return "OFFICIAL_OPEN_VS_REPORTED_CLOSED";
  }
  if (official.status === "CLOSED" && openReports > 0) {
    return "OFFICIAL_CLOSED_VS_REPORTED_OPEN";
  }
  return null;
}

/** 충돌 배너 문구. PRD §3.4 의 문장을 그대로 쓴다. */
export const CONFLICT_NOTICE = "정보가 서로 달라요. 전화 확인이 필요합니다.";

// ─── 정렬 (PRD §2.2) ──────────────────────────────────────

/**
 * 정렬 그룹. 낮은 값이 위로 온다.
 * 제보만으로 그룹을 올리지 않는다 — 리액션 수는 이 함수에 들어오지 않는다.
 * 구독 등급도 인자에 없다. 접근 경로 자체를 만들지 않는다. (PRD §2.2 · §7.1)
 *
 * LIMITED 는 그룹 1 이다. AVAILABLE 과 같은 그룹에 두지 않는다.
 *   "일부 제한"은 대개 전문의 부재나 특정 처치 불가다. AVAILABLE 과 같은 그룹으로 보이면
 *   보호자가 야간에 갔다가 현장에서 "그 처치는 안 됩니다"를 듣는다.
 *   그 헛걸음이 이 서비스가 없애려던 상황이다.
 *
 *   UNKNOWN 과 같은 그룹인 것은 어색해 보이지만, 보호자가 취해야 할 행동이 같다 —
 *   출발 전 전화 확인. 그룹은 상태가 아니라 행동 기준으로 나눈다.
 */
export function sortGroupOf(official: OfficialStatusView): 0 | 1 | 2 {
  if (official.usableNow) return 0; // 유효한 공식 접수 가능
  if (official.status === "CLOSED" && official.reason === null) return 2; // 공식 마감
  return 1; // 전화 확인이 필요한 것 (UNVERIFIED · EXPIRED · NEVER_SET · LIMITED · PAUSED)
}

/**
 * 같은 그룹 안에서는 거리 → 이름 → id 로 안정 정렬한다. (PRD §2.2)
 * 좌표가 없으면 거리 비교를 건너뛴다. 없는 좌표를 0 으로 취급하면 제일 위로 올라간다.
 */
export function compareInGroup(
  a: { distanceKm: number | null; name: string; id: string },
  b: { distanceKm: number | null; name: string; id: string },
): number {
  if (a.distanceKm !== null && b.distanceKm !== null && a.distanceKm !== b.distanceKm) {
    return a.distanceKm - b.distanceKm;
  }
  if (a.distanceKm === null && b.distanceKm !== null) return 1;
  if (a.distanceKm !== null && b.distanceKm === null) return -1;
  const byName = a.name.localeCompare(b.name, "ko");
  return byName !== 0 ? byName : a.id.localeCompare(b.id);
}
