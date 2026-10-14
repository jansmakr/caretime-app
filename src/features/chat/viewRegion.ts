import { SIDO_LIST, type Sido } from "@/features/reports/regions";
import { type MyRegion } from "@/features/regions/sigungu";

/**
 * 현장톡에서 **어느 시·도의 글을 볼지** (2026-10-15).
 *
 * 전에는 상단에 "전국 / 내 지역" 탭과 "최근 1개월 / 이전 글도 보기" 탭이 두 줄로
 * 있었다. 지금은 한 줄 "📍 서울 · 지역 바꾸기 ›" 이고, 누르면 시·도 목록이 열린다.
 * 보는 단위는 **시·도**다. 구 컬럼과 글의 구 값은 그대로 두고, 보는 쪽에서만 묻지 않는다.
 *
 * ── 처음 정하는 순서 ───────────────────────────────────────
 *   ① 이 화면에서 직접 고른 값(전국 포함)  — 사람이 고른 것을 위치가 덮지 않는다
 *   ② 내 지역(features/regions/myRegion)의 시·도 — 홈·작성창에서 고른 값
 *   ③ 위치 권한을 **이미 허락한** 기기라면 위치로 찾은 시·도(5초 안에)
 *   ④ 전국
 * ③은 권한 창을 띄우지 않는다. 처음 온 사람에게 위치를 묻는 것은 그 사람이 버튼을
 * 눌렀을 때뿐이다(방침 1-5, features/regions/geolocate.isLocationAllowed).
 * 실패·거부·시간 초과는 안내 없이 ④로 간다 — 급한 사람을 오류 문구 앞에 세우지 않는다.
 *
 * ── 저장 ────────────────────────────────────────────────────
 * 직접 고른 값만 저장한다. 이 브라우저의 localStorage 에만 있고 서버로 가지 않는다.
 * 위치로 찾은 값은 저장하지 않는다(다음에 들어오면 같은 순서로 다시 정한다).
 */

/** 보는 지역. null = 전국. */
export type ViewSido = Sido | null;

const KEY = "caretime_chat_view";

/** 위치로 찾는 데 기다리는 시간. 넘으면 전국으로 시작한다. */
export const AUTO_LOCATE_TIMEOUT_MS = 5_000;

/**
 * 직접 고른 값. 고른 적이 없으면 undefined — **전국을 고른 것(null)과 다르다.**
 * 둘을 합치면 "전국"을 고른 사람에게 매번 위치로 지역을 다시 정해 준다.
 */
export function readViewChoice(): ViewSido | undefined {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { sido?: unknown };
    if (parsed.sido === null) return null;
    // 저장소는 사용자가 고칠 수 있다. 목록에 없는 값은 고른 적 없는 것으로 읽는다.
    return SIDO_LIST.find((s) => s === parsed.sido) ?? undefined;
  } catch {
    return undefined;
  }
}

export function writeViewChoice(sido: ViewSido): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ sido }));
  } catch {
    // 저장이 막혀도(시크릿 창 등) 이번 화면에서는 고른 대로 보인다.
  }
}

export type InitialView =
  | { sido: ViewSido; source: "saved" }
  | { sido: Sido; source: "my-region" }
  | { sido: Sido; source: "located"; region: MyRegion }
  | { sido: null; source: "nationwide" };

/**
 * 처음 볼 지역을 정한다. 위치 찾기는 넘겨받는다 — 테스트가 거부·시간 초과를 흉내 낸다.
 *
 * `autoLocate` 는 권한이 이미 허락된 경우에만 지역을 돌려주고, 아니면 null 이다.
 * 던지거나 늦으면 전국이다.
 */
export async function resolveInitialView({
  saved,
  myRegion,
  autoLocate,
  timeoutMs = AUTO_LOCATE_TIMEOUT_MS,
}: {
  saved: ViewSido | undefined;
  myRegion: MyRegion | null;
  autoLocate: () => Promise<MyRegion | null>;
  timeoutMs?: number;
}): Promise<InitialView> {
  if (saved !== undefined) return { sido: saved, source: "saved" };
  if (myRegion !== null) return { sido: myRegion.sido, source: "my-region" };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  try {
    const region = await Promise.race([autoLocate().catch(() => null), timeout]);
    if (region !== null) return { sido: region.sido, source: "located", region };
  } finally {
    clearTimeout(timer);
  }
  return { sido: null, source: "nationwide" };
}

/**
 * 목록이 비었을 때의 한 줄. 넷을 구분한다 — 할 일이 다르다.
 *   조회 실패 · 고른 지역 0건 · 최근 1개월 0건 · 진짜 0건
 * 하나로 합치면 서버가 죽은 날에도 "아직 글이 없습니다"라고 말하게 된다.
 */
export function emptyListCopy({
  loadFailed,
  regionFiltered,
  recentOnly,
}: {
  loadFailed: boolean;
  regionFiltered: boolean;
  recentOnly: boolean;
}): string {
  if (loadFailed) return "글을 불러오지 못했습니다. 잠시 후 다시 열어 주세요. 올라온 글이 없다는 뜻은 아닙니다.";
  if (regionFiltered) return "이 지역엔 아직 글이 없어요";
  if (recentOnly) return "최근 1개월에 올라온 글이 없습니다.";
  return "아직 올라온 글이 없습니다. 지금 상황을 물어보거나 알려 주세요.";
}
