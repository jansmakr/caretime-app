import { CATEGORY_LABEL_GUARDIAN } from "@/features/hospitals/labels";
import type { ReportCategory } from "./types";

/**
 * 카테고리별 가이드 템플릿.
 *
 * 빈 textarea 는 "무엇을 적어야 하는지 모르겠다"로 끝난다. 그래서 칩을 누르면
 * 확인해야 할 항목이 줄로 채워진다. 채워주는 것은 '질문'뿐이고 답은 비워 둔다 —
 * 예시 답을 미리 넣으면 확인하지 않은 내용이 그대로 제보로 올라간다.
 *
 * 기타는 템플릿이 없다. 대신 주제 직접 입력 + 자유 서술이다.
 *
 * 칩 이름은 보호자용 표(CATEGORY_LABEL_GUARDIAN)를 읽는다. 여기 "열상"을 직접 적어
 * 두었더니 보호자 화면에 한자어가 나갔다(원칙 7 위반). 병원 화면은 같은 항목을
 * "열상"으로 부르고, 그 표는 CATEGORY_LABEL_PARTNER 다. 두 표가 섞이지 않게
 * tests/guardianWords.test.ts 가 감시한다.
 */

export interface CategoryMeta {
  value: ReportCategory;
  label: string;
  /** 칩 아래에 붙는 한 줄 설명. */
  hint: string;
  /** 칩을 누르면 textarea 에 채워지는 문구. 기타는 빈 문자열. */
  template: string;
  /** 주제 직접 입력 필드를 쓰는가. */
  needsTopic: boolean;
}

export const REPORT_CATEGORIES: CategoryMeta[] = [
  {
    value: "laceration",
    label: CATEGORY_LABEL_GUARDIAN.laceration,
    hint: "찢어짐·봉합",
    template: ["· 봉합 가능 여부: ", "· 소아 진료 여부: ", "· 대기 상황: "].join("\n"),
    needsTopic: false,
  },
  {
    value: "burn",
    label: CATEGORY_LABEL_GUARDIAN.burn,
    hint: "드레싱·처치",
    template: ["· 응급 드레싱 가능 여부: ", "· 소요 시간: "].join("\n"),
    needsTopic: false,
  },
  {
    value: "other",
    label: CATEGORY_LABEL_GUARDIAN.other,
    hint: "직접 입력",
    template: "",
    needsTopic: true,
  },
];

export function categoryMeta(category: ReportCategory): CategoryMeta {
  // 3개 고정이라 find 가 undefined 를 반환할 수 없지만, 타입을 좁히기 위해 기본값을 둔다.
  return REPORT_CATEGORIES.find((c) => c.value === category) ?? REPORT_CATEGORIES[0];
}

export function categoryLabel(category: ReportCategory): string {
  return categoryMeta(category).label;
}

export function templateFor(category: ReportCategory): string {
  return categoryMeta(category).template;
}

/**
 * 카테고리를 바꿀 때 본문을 새 템플릿으로 갈아끼울지 판정한다.
 * 보호자가 이미 적어 넣은 내용은 칩을 잘못 눌러도 지워지지 않아야 한다.
 * 비어 있거나 '직전 템플릿 그대로'일 때만 교체한다.
 */
export function shouldReplaceBody(body: string, previous: ReportCategory): boolean {
  return body.trim() === "" || body === templateFor(previous);
}

/** 템플릿 줄만 있고 답이 하나도 없는 상태. 그대로 등록하지 않게 막는다. */
export function isTemplateUnfilled(body: string, category: ReportCategory): boolean {
  const template = templateFor(category);
  if (template === "") return false;
  return body.trim() === "" || body === template;
}
