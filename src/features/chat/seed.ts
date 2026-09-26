import { ZERO_REACTIONS, type ReactionCounts } from "./reactions";
import type { ChatCategory, ChatMessage, ChatScope } from "./types";

/**
 * ⚠️ 데모 대화. 실제 보호자가 남긴 글이 아닙니다. (README 「Mock 정책」)
 *
 * 기준시각(baseIso)을 받는 순수 함수다. 서버 렌더와 브라우저가 같은 값을 만들어야
 * "10분 전" 같은 상대시각에서 hydration 이 어긋나지 않는다. 여기서 Date.now() 를 읽지 않는다.
 *
 * 병원명은 시드(supabase/seed.sql)와 Mock 의 가상 병원과 같은 이름만 쓴다.
 */

interface Seed {
  minutesAgo: number;
  handle: string;
  category: ChatCategory;
  topic: string | null;
  body: string;
  scope: ChatScope;
  /** 데모용 반응 수. 실제로 누른 사람이 있는 값이 아니다. */
  reactions?: Partial<ReactionCounts>;
}

const GANGSEO: ChatScope = {
  sido: "서울",
  sigungu: "강서구",
  hospitalId: "h_001",
  hospitalName: "가상아이봄의원",
};
const YANGCHEON: ChatScope = {
  sido: "서울",
  sigungu: "양천구",
  hospitalId: "h_002",
  hospitalName: "가상한빛외과의원",
};
const YEONGDEUNGPO: ChatScope = {
  sido: "서울",
  sigungu: "영등포구",
  hospitalId: "h_003",
  hospitalName: "가상연세365의원",
};
const NO_SCOPE: ChatScope = { sido: null, sigungu: null, hospitalId: null, hospitalName: null };

const SEEDS: Seed[] = [
  {
    minutesAgo: 3,
    handle: "강서구맘",
    category: "laceration",
    topic: null,
    body: ["· 지금 봉합 가능한가요?", "· 소아도 진료되나요?", "6살 이마 열상인데 지금 출발해도 될지 봐주실 분 계신가요."].join("\n"),
    scope: GANGSEO,
    reactions: { doctor_present: 2 },
  },
  {
    minutesAgo: 11,
    handle: "강서구지킴이",
    category: "laceration",
    topic: null,
    body: "방금 접수했습니다. 소아 봉합 된다고 안내받았고 앞에 두 명 기다리고 있었습니다.",
    scope: GANGSEO,
    reactions: { low_wait: 4, doctor_present: 3 },
  },
  {
    minutesAgo: 26,
    handle: "양천구아빠",
    category: "burn",
    topic: null,
    body: ["· 응급 드레싱 가능한가요?", "· 처치까지 얼마나 걸리나요?", "아이 손등 화상이라 야간에 갈 수 있는 곳을 찾고 있습니다."].join("\n"),
    scope: YANGCHEON,
  },
  {
    minutesAgo: 52,
    handle: "영등포지킴이",
    category: "other",
    topic: "접수 마감",
    body: "도착했더니 접수가 이미 끝나 있었습니다. 마감 시간 확인하고 출발하시는 게 좋겠습니다.",
    scope: YEONGDEUNGPO,
    reactions: { closed: 5 },
  },
  {
    minutesAgo: 95,
    handle: "야간보호자",
    category: "other",
    topic: "야간 진료",
    body: "서울 서남권에서 밤 10시 넘어 소아 외상 받아주는 곳 아시는 분 있나요?",
    scope: NO_SCOPE,
  },
];

export function seedChatMessages(baseIso: string): ChatMessage[] {
  const base = Date.parse(baseIso);
  if (Number.isNaN(base)) return [];

  return SEEDS.map((seed, index) => ({
    id: `cm_demo_${index}`,
    handle: seed.handle,
    category: seed.category,
    topic: seed.topic,
    body: seed.body,
    scope: seed.scope,
    mine: false,
    baseReactions: { ...ZERO_REACTIONS, ...seed.reactions },
    createdAt: new Date(base - seed.minutesAgo * 60_000).toISOString(),
  }));
}
