import { categoryLabel } from "@/features/reports/templates";
import type { ChatCategory } from "./types";

/**
 * 현장톡 퀵 템플릿.
 *
 * 제보 템플릿은 다녀온 사람이 채우는 '보고'라 "· 봉합 가능 여부: " 형태다.
 * 현장톡은 지금 묻는 '질문'이라 같은 항목을 물음표로 바꾼다.
 * 라벨(열상 · 화상 · 기타)은 제보 쪽 표를 그대로 읽어 두 화면이 갈라지지 않게 한다.
 *
 * 여기서도 답을 미리 채우지 않는다 — 확인하지 않은 내용이 대화에 올라가면 안 된다.
 */

export interface ChatTemplate {
  value: ChatCategory;
  label: string;
  hint: string;
  /** 칩을 누르면 입력창에 채워지는 문구. 기타는 빈 문자열. */
  template: string;
  needsTopic: boolean;
}

export const CHAT_TEMPLATES: ChatTemplate[] = [
  {
    value: "laceration",
    label: categoryLabel("laceration"),
    hint: "봉합·소아",
    template: ["· 지금 봉합 가능한가요?", "· 소아도 진료되나요?", "· 대기 얼마나 되나요?"].join("\n"),
    needsTopic: false,
  },
  {
    value: "burn",
    label: categoryLabel("burn"),
    hint: "드레싱·시간",
    template: ["· 응급 드레싱 가능한가요?", "· 처치까지 얼마나 걸리나요?"].join("\n"),
    needsTopic: false,
  },
  {
    value: "other",
    label: categoryLabel("other"),
    hint: "직접 입력",
    template: "",
    needsTopic: true,
  },
];

export function chatTemplate(category: ChatCategory): ChatTemplate {
  return CHAT_TEMPLATES.find((t) => t.value === category) ?? CHAT_TEMPLATES[0];
}

export function chatTemplateText(category: ChatCategory): string {
  return chatTemplate(category).template;
}

/** 비어 있거나 직전 템플릿 그대로일 때만 교체한다. 쓴 글을 칩이 지우지 않게. */
export function shouldReplaceChatBody(body: string, previous: ChatCategory): boolean {
  return body.trim() === "" || body === chatTemplateText(previous);
}
