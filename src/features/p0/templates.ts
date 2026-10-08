/**
 * 1초 템플릿 15개 (PRD §3.3).
 *
 * 표의 문구는 **환자 상태가 아니라 해당 병원의 운영 현황**이다. 그래서 어느 문구에도
 * 증상·나이·부위가 없다. 개인 증상 템플릿은 P0 에 아예 존재하지 않는다(§3.2).
 *
 * 병원명은 화면 컨텍스트로 붙이고 본문에 반복하지 않는다(§3.3 머리말).
 * 템플릿 선택은 내용을 채울 뿐 자동 게시하지 않는다(§3.3 말미).
 */

/**
 * ⏳ 아직 어디서도 import 되지 않는다. 지금 화면은 features/chat/templates.ts 를 쓴다.
 *    글쓰기를 서버 API 로 옮기는 턴에 이쪽으로 갈아탄다.
 */

export type TemplateCategory = "laceration" | "burn" | "other";

/** 관찰(observation)은 집계에 들어가고, 질문(question)은 들어가지 않는다. (§3.2 말미) */
export type TemplateKind = "observation" | "question";

export interface ChoiceSlot {
  /** 본문에 들어 있는 대괄호 토큰. 이 문자열을 선택값으로 바꿔야 게시할 수 있다. */
  token: string;
  options: string[];
}

export interface PostTemplate {
  id: string;
  category: TemplateCategory;
  kind: TemplateKind;
  /** 입력창에 채워지는 문구. */
  text: string;
  /** 게시 전 조건 (PRD 표의 마지막 칼럼). */
  precondition: string;
  /** 선택지가 있는 템플릿. 없으면 undefined. */
  choice?: ChoiceSlot;
}

export const POST_TEMPLATES: PostTemplate[] = [
  // ── 열상 ──
  { id: "L01", category: "laceration", kind: "observation", text: "방금 봉합 접수가 가능하다고 안내받았어요.", precondition: "확인 시각" },
  { id: "L02", category: "laceration", kind: "observation", text: "봉합 접수가 마감됐다고 안내받았어요.", precondition: "확인 시각" },
  { id: "L03", category: "laceration", kind: "observation", text: "봉합 접수 가능 여부는 전화 확인이 필요하다고 안내받았어요.", precondition: "확인 시각" },
  { id: "L04", category: "laceration", kind: "question", text: "지금 소아 봉합 접수 여부를 확인하신 분 있나요?", precondition: "질문 라벨" },
  { id: "L05", category: "laceration", kind: "question", text: "지금 봉합 접수 대기 상황을 확인하신 분 있나요?", precondition: "질문 라벨" },
  // ── 화상 ──
  { id: "B01", category: "burn", kind: "observation", text: "방금 화상 진료 접수가 가능하다고 안내받았어요.", precondition: "확인 시각" },
  { id: "B02", category: "burn", kind: "observation", text: "화상 진료 접수가 마감됐다고 안내받았어요.", precondition: "확인 시각" },
  { id: "B03", category: "burn", kind: "observation", text: "화상 진료 가능 여부는 전화 확인이 필요하다고 안내받았어요.", precondition: "확인 시각" },
  { id: "B04", category: "burn", kind: "question", text: "지금 화상 진료 접수 여부를 확인하신 분 있나요?", precondition: "질문 라벨" },
  { id: "B05", category: "burn", kind: "question", text: "화상 진료 접수 대기 상황을 확인하신 분 있나요?", precondition: "질문 라벨" },
  // ── 기타 ──
  { id: "O01", category: "other", kind: "observation", text: "현재 접수 대기 3명 이하로 보였어요.", precondition: "사람 수 기준·시각" },
  { id: "O02", category: "other", kind: "observation", text: "의료진이 있다고 안내받았어요. 진료 항목은 전화 확인해 주세요.", precondition: "확인 시각" },
  { id: "O03", category: "other", kind: "observation", text: "현재 접수가 마감됐다고 안내받았어요.", precondition: "확인 시각" },
  {
    id: "O04",
    category: "other",
    kind: "observation",
    text: "안내받은 예상 대기 시간은 [30분 이내/30~60분/60분 이상]예요.",
    precondition: "선택지 필수",
    choice: { token: "[30분 이내/30~60분/60분 이상]", options: ["30분 이내", "30~60분", "60분 이상"] },
  },
  { id: "O05", category: "other", kind: "question", text: "지금 접수 상황을 확인하신 분 있나요?", precondition: "질문 라벨" },
];

export function templateById(id: string): PostTemplate | null {
  return POST_TEMPLATES.find((t) => t.id === id) ?? null;
}

export function templatesFor(category: TemplateCategory, kind?: TemplateKind): PostTemplate[] {
  return POST_TEMPLATES.filter((t) => t.category === category && (kind ? t.kind === kind : true));
}

// ─── 관찰 시각 (PRD §3.2) ─────────────────────────────────

/** [방금 확인] [5분 전] [10분 전]. 서버가 observed_at 을 검증한다. */
export const OBSERVED_OFFSET_MINUTES = [0, 5, 10] as const;
export type ObservedOffset = (typeof OBSERVED_OFFSET_MINUTES)[number];

export const OBSERVED_OFFSET_TEXT: Record<ObservedOffset, string> = {
  0: "방금 확인",
  5: "5분 전",
  10: "10분 전",
};

export function isObservedOffset(value: number): value is ObservedOffset {
  return (OBSERVED_OFFSET_MINUTES as readonly number[]).includes(value);
}

export function observedAtFrom(offsetMinutes: ObservedOffset, now: Date): Date {
  return new Date(now.getTime() - offsetMinutes * 60_000);
}

// ─── 게시 전 검증 (PRD §3.3 말미) ─────────────────────────

/** 대괄호가 남아 있으면 게시할 수 없다. */
export function hasUnresolvedChoice(text: string): boolean {
  return /\[[^\]]*\]/.test(text);
}

/** 선택값을 넣어 본문을 완성한다. 허용된 선택지만 받는다. */
export function applyChoice(
  template: PostTemplate,
  selected: string | null,
): { ok: true; text: string } | { ok: false; code: "CHOICE_REQUIRED" | "CHOICE_INVALID" } {
  if (!template.choice) return { ok: true, text: template.text };
  if (selected === null || selected === "") return { ok: false, code: "CHOICE_REQUIRED" };
  if (!template.choice.options.includes(selected)) return { ok: false, code: "CHOICE_INVALID" };
  return { ok: true, text: template.text.replace(template.choice.token, selected) };
}

export interface PostDraftInput {
  templateId: string;
  category: TemplateCategory;
  /** O04 처럼 선택지가 있는 템플릿에서만 쓴다. */
  choice?: string | null;
  /** 관찰 제보에만 필요하다. */
  observedOffsetMinutes?: number | null;
  /** 짧은 운영현황 메모. P0.1 기능 플래그가 켜져 있을 때만 받는다. (§3.2) */
  memo?: string | null;
}

export type PostValidationError =
  | "TEMPLATE_UNKNOWN"
  | "CATEGORY_MISMATCH"
  | "CHOICE_REQUIRED"
  | "CHOICE_INVALID"
  | "UNRESOLVED_CHOICE"
  | "OBSERVED_AT_REQUIRED"
  | "OBSERVED_AT_INVALID"
  | "OBSERVED_AT_NOT_ALLOWED"
  | "MEMO_TOO_LONG"
  | "MEMO_NOT_ALLOWED";

/** 운영현황 메모 상한. (PRD §3.2 "≤120자") */
export const MEMO_MAX = 120;

/**
 * 게시 요청 검증.
 *
 * PRD §3.2: "게시 요청은 body 보다 template_id + 선택지 값을 우선 사용한다."
 * 그래서 본문 문자열을 클라이언트에서 받지 않고 여기서 만들어 돌려준다.
 * 클라이언트가 보낸 문구를 그대로 저장하면 템플릿 밖의 내용이 들어올 길이 생긴다.
 */
export function validatePostDraft(
  input: PostDraftInput,
  options: { now: Date; freeTextEnabled: boolean },
): { ok: true; text: string; kind: TemplateKind; observedAt: Date | null } | { ok: false; code: PostValidationError } {
  const template = templateById(input.templateId);
  if (!template) return { ok: false, code: "TEMPLATE_UNKNOWN" };
  if (template.category !== input.category) return { ok: false, code: "CATEGORY_MISMATCH" };

  const applied = applyChoice(template, input.choice ?? null);
  if (!applied.ok) return { ok: false, code: applied.code };
  if (hasUnresolvedChoice(applied.text)) return { ok: false, code: "UNRESOLVED_CHOICE" };

  let observedAt: Date | null = null;
  if (template.kind === "observation") {
    const offset = input.observedOffsetMinutes;
    if (offset === null || offset === undefined) return { ok: false, code: "OBSERVED_AT_REQUIRED" };
    if (!isObservedOffset(offset)) return { ok: false, code: "OBSERVED_AT_INVALID" };
    observedAt = observedAtFrom(offset, options.now);
  } else if (input.observedOffsetMinutes !== null && input.observedOffsetMinutes !== undefined) {
    // 질문에 관찰 시각을 붙이면 집계에 섞인다. 조용히 버리지 않고 거절한다.
    return { ok: false, code: "OBSERVED_AT_NOT_ALLOWED" };
  }

  const memo = (input.memo ?? "").trim();
  if (memo !== "") {
    if (!options.freeTextEnabled) return { ok: false, code: "MEMO_NOT_ALLOWED" };
    if (memo.length > MEMO_MAX) return { ok: false, code: "MEMO_TOO_LONG" };
  }

  return { ok: true, text: applied.text, kind: template.kind, observedAt };
}
