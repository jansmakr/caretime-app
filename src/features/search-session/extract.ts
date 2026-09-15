import {
  BODY_PARTS,
  SITUATIONS,
  type ExtractedFacts,
  type FollowUpQuestion,
  type MissingField,
  type SearchSession,
  type Sex,
} from "./types";

/**
 * 규칙기반 사실 추출기.
 *
 * 자연어 문장을 외부 LLM 에 보내지 않고 처리한다.
 * 아동 건강정보를 해외 API 로 보내면 국외이전 동의가 별도로 필요해지고,
 * 현재 MVP 진료영역(소아 안면열상 / 수부외상 / 화상)에서는
 * 사전 매칭만으로 대부분의 입력이 커버되기 때문이다.
 *
 * 여기서 못 잡은 문장은 "추측해서 채우지 않고" missing 으로 남긴 뒤
 * 사용자에게 한 번에 하나씩 되묻는다. (기획안 7항)
 * LLM 폴백을 붙일 경우 반드시 그 시점에 별도 동의를 받는다. → README 참고
 */

const AGE_UNITS = ["살", "세", "개월"];

const KO_NUMBERS: Record<string, number> = {
  한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10,
  돌: 1,
};

const BODY_PART_ALIASES: Record<string, string> = {
  이마: "forehead", 앞이마: "forehead",
  눈썹: "eyebrow", 눈두덩: "eyebrow",
  입술: "lip", 입: "lip",
  코: "nose", 콧등: "nose",
  귀: "ear", 귓바퀴: "ear",
  두피: "scalp", 머리: "scalp", 뒤통수: "scalp", 정수리: "scalp",
  턱: "chin",
  손: "hand", 손등: "hand", 손바닥: "hand",
  손가락: "finger", 엄지: "finger", 검지: "finger", 중지: "finger", 약지: "finger", 새끼손가락: "finger",
  손톱: "nail",
};

const SITUATION_ALIASES: Record<string, string> = {
  찢어: "laceration", 찢겼: "laceration", 열상: "laceration", 째: "laceration", 베: "laceration",
  데였: "burn", 데임: "burn", 화상: "burn", 뜨거운: "burn", 끓는: "burn",
  까졌: "abrasion", 긁: "abrasion", 찰과: "abrasion",
  물렸: "bite", 물림: "bite", 교상: "bite",
  박혔: "foreign_body", 이물: "foreign_body", 유리: "foreign_body",
  벌어: "deep_laceration", 깊: "deep_laceration",
};

function extractAge(text: string): number | null {
  const monthMatch = text.match(/(\d{1,2})\s*개월/);
  if (monthMatch) return Math.floor(Number(monthMatch[1]) / 12);

  const digitMatch = text.match(/(만\s*)?(\d{1,2})\s*(살|세)/);
  if (digitMatch) return Number(digitMatch[2]);

  for (const [word, n] of Object.entries(KO_NUMBERS)) {
    for (const unit of AGE_UNITS) {
      if (text.includes(`${word}${unit}`)) return n;
    }
    if (word === "돌" && text.includes("돌")) return 1;
  }
  return null;
}

function extractSex(text: string): Sex | null {
  if (/여자아이|여아|딸|여자애/.test(text)) return "female";
  if (/남자아이|남아|아들|남자애/.test(text)) return "male";
  return null;
}

function extractBodyPart(text: string): string | null {
  // 긴 별칭부터 매칭해야 "손톱"이 "손"으로 잡히지 않는다.
  const aliases = Object.keys(BODY_PART_ALIASES).sort((a, b) => b.length - a.length);
  for (const alias of aliases) {
    if (text.includes(alias)) return BODY_PART_ALIASES[alias];
  }
  return null;
}

function extractSituation(text: string): string | null {
  const aliases = Object.keys(SITUATION_ALIASES).sort((a, b) => b.length - a.length);
  for (const alias of aliases) {
    if (text.includes(alias)) return SITUATION_ALIASES[alias];
  }
  return null;
}

function extractHemostasis(text: string): "stopped" | "bleeding" | null {
  if (/피는?\s*멈|지혈(은|이)?\s*(됐|되었|완료)|피가?\s*안\s*나/.test(text)) return "stopped";
  if (/피가?\s*(계속|많이|안\s*멈)|출혈\s*중|피\s*나요|피나요/.test(text)) return "bleeding";
  return null;
}

function extractBasicTreatment(text: string): "done" | "none" | null {
  if (/소독(을|은)?\s*(했|받았)|처치(를|는)?\s*(했|받았)|거즈|밴드\s*(붙|감)/.test(text)) return "done";
  return null;
}

/** 이 파서는 '없음'을 추측하지 않는다. 못 찾으면 null 로 두고 되묻는다. */
export function extractFacts(rawInput: string): ExtractedFacts {
  const text = rawInput.replace(/\s+/g, " ").trim();
  return {
    ageYears: extractAge(text),
    sex: extractSex(text),
    bodyPartId: extractBodyPart(text),
    situationId: extractSituation(text),
    hemostasis: extractHemostasis(text),
    basicTreatment: extractBasicTreatment(text),
    priorGuidance: null,
  };
}

const REQUIRED_ORDER: MissingField[] = [
  "bodyPartId",
  "ageYears",
  "hemostasis",
  "basicTreatment",
  "priorGuidance",
];

export function findMissing(facts: ExtractedFacts): MissingField[] {
  return REQUIRED_ORDER.filter((field) => {
    switch (field) {
      case "bodyPartId":
        return facts.bodyPartId === null;
      case "ageYears":
        return facts.ageYears === null;
      case "hemostasis":
        return facts.hemostasis === null;
      case "basicTreatment":
        return facts.basicTreatment === null;
      case "priorGuidance":
        return facts.priorGuidance === null;
    }
  });
}

/**
 * 질문을 한꺼번에 여러 개 보여주지 않는다. (기획안 7항)
 * 항상 첫 번째 missing 하나만 돌려준다.
 */
export function nextQuestion(session: SearchSession): FollowUpQuestion | null {
  const field = session.missing[0];
  if (!field) return null;

  switch (field) {
    case "bodyPartId":
      return {
        field,
        question: "어느 부위인가요?",
        options: BODY_PARTS.map((p) => ({ label: p.label, apply: { bodyPartId: p.id } })),
      };
    case "ageYears":
      return {
        field,
        question: "나이가 어떻게 되나요?",
        options: [1, 3, 5, 7, 9, 12].map((n) => ({
          label: `만 ${n}세`,
          apply: { ageYears: n },
        })),
      };
    case "hemostasis":
      return {
        field,
        question: "지금 피는 멈췄나요?",
        options: [
          { label: "멈췄어요", apply: { hemostasis: "stopped" } },
          { label: "계속 나요", apply: { hemostasis: "bleeding" } },
        ],
      };
    case "basicTreatment":
      return {
        field,
        question: "다른 의료기관에서 소독이나 지혈 처치를 받았나요?",
        options: [
          { label: "받았어요", apply: { basicTreatment: "done" } },
          { label: "아니요", apply: { basicTreatment: "none" } },
        ],
      };
    case "priorGuidance":
      return {
        field,
        question: "의료진에게 다음날 외래진료 안내를 받았나요?",
        options: [
          { label: "받았어요", apply: { priorGuidance: "next_day_opd" } },
          { label: "다른 병원을 안내받았어요", apply: { priorGuidance: "referred" } },
          { label: "아니요", apply: { priorGuidance: "none" } },
        ],
      };
  }
}

export function createSession(rawInput: string): SearchSession {
  const facts = extractFacts(rawInput);
  return {
    id: crypto.randomUUID(),
    facts,
    rawInput,
    createdAt: new Date().toISOString(),
    missing: findMissing(facts),
  };
}

export function applyAnswer(
  session: SearchSession,
  patch: Partial<ExtractedFacts>,
): SearchSession {
  const facts = { ...session.facts, ...patch };
  return { ...session, facts, missing: findMissing(facts) };
}

export { SITUATIONS };
