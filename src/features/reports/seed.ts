import { targetFromRef, type HospitalRef } from "./directory";
import type { ReportCategory, UserReport } from "./types";

/**
 * ⚠️ 데모 제보. 실제 보호자가 남긴 정보가 아닙니다. (README 「Mock 정책」)
 *
 * 기준시각(baseIso)을 인자로 받는 순수 함수다. 서버 렌더와 브라우저가 같은 값을 만들어야
 * "10분 전" 같은 상대시각에서 hydration 이 어긋나지 않는다. 그래서 여기서 Date.now() 를 읽지 않는다.
 */

interface Seed {
  minutesAgo: number;
  category: ReportCategory;
  topic: string | null;
  body: string;
  waitingHeadcount: number | null;
}

const SEEDS: Seed[] = [
  {
    minutesAgo: 8,
    category: "laceration",
    topic: null,
    body: ["· 봉합 가능 여부: 가능하다고 안내받음", "· 소아 진료 여부: 확인 못 함", "· 대기 상황: 접수 후 바로 진료"].join("\n"),
    waitingHeadcount: 3,
  },
  {
    minutesAgo: 34,
    category: "burn",
    topic: null,
    body: ["· 응급 드레싱 가능 여부: 가능", "· 소요 시간: 접수부터 처치까지 40분 정도 걸렸습니다"].join("\n"),
    waitingHeadcount: 7,
  },
  {
    minutesAgo: 126,
    category: "other",
    topic: "주차",
    body: "건물 지하주차장이 좁아 길가에 잠깐 세우는 분이 많았습니다. 접수는 바로 됐습니다.",
    waitingHeadcount: null,
  },
];

export function seedReports(ref: HospitalRef, baseIso: string): UserReport[] {
  const base = Date.parse(baseIso);
  if (Number.isNaN(base)) return [];
  const target = targetFromRef(ref);

  return SEEDS.map((seed, index) => ({
    id: `ur_demo_${ref.id}_${index}`,
    target,
    category: seed.category,
    topic: seed.topic,
    body: seed.body,
    waitingHeadcount: seed.waitingHeadcount,
    source: "user" as const,
    createdAt: new Date(base - seed.minutesAgo * 60_000).toISOString(),
  }));
}
