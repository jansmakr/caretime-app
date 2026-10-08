import type { Sido } from "@/features/reports/regions";
import type { ReportCategory } from "@/features/reports/types";
import type { ReactionCounts, ReactionKey } from "./reactions";

/**
 * 실시간 현장톡.
 *
 * 보호자가 쓴 글은 **전부 이 타입이다.** 전에는 병원 상세에 별도의 제보 타입과
 * 보관소가 있었고, 그쪽 글은 브라우저 메모리에만 남았다 — 같은 사람이 같은 병원에
 * 대해 쓰는데 어디에 썼느냐로 남는지가 갈렸다. 그래서 하나로 합쳤다.
 *
 * /chat 은 전체 방이고, 병원 상세는 같은 방을 그 의료기관으로 좁혀 보여 준다
 * (components/hospital/HospitalFieldTalk). 저장소도 작성창도 하나다.
 *
 * 설계 규칙:
 *   - 병원 직접확인 계층(HospitalLiveStatus 등)으로 승격되는 경로가 없다.
 *   - 개인 식별 정보를 담지 않는다. 작성자는 익명 표시명(handle)뿐이다.
 *   - 진단·권고를 담는 필드를 두지 않는다. (Release Blocker 7)
 */

/**
 * 글 분류. **화면에서는 고르지 않는다.**
 *
 * 전에는 작성창에 칩 셋(찢어진 상처·화상·그 밖)이 있었다. 그것이 대상을 좁혔다 —
 * 열·구토로 온 사람이 그 셋을 보고 "내 건 해당 안 되나" 하고 멈춘다. 서비스는
 * 전 과목·전 연령으로 연다(2026-10-06).
 *
 * 컬럼과 타입은 남긴다. 모든 글이 DEFAULT_CATEGORY 로 들어가고, 2차에 분류가 다시
 * 필요해지면 그때 쓴다. 지우면 되살릴 때 migration 이 또 필요하다.
 */
export type ChatCategory = ReportCategory;

/** 화면에서 고르지 않으므로 모든 글이 이 값이다. */
export const DEFAULT_CATEGORY: ChatCategory = "other";

/**
 * 이 글이 어느 지역·어느 병원 이야기인지.
 * 전부 null 이면 지역을 특정하지 않은 글이다. 비어 있는 값을 추측해서 채우지 않는다.
 *
 * hospitalId 가 없는 글은 끝까지 없다. 나중에 이름이 비슷한 병원으로 자동 연결하지
 * 않는다 — 오연결은 되돌릴 수 없고, 보호자는 그 글을 그 병원 이야기로 읽는다.
 */
export interface ChatScope {
  sido: Sido | null;
  sigungu: string | null;
  hospitalId: string | null;
  hospitalName: string | null;
}

export interface ChatDraft {
  category: ChatCategory;
  /** "기타"에서만 쓰는 주제 직접 입력. */
  topic: string | null;
  body: string;
  scope: ChatScope;
}

export interface ChatMessage extends ChatDraft {
  id: string;
  /** 익명 표시명. 예: "야간지킴이". 이름·연락처를 담지 않는다. → features/chat/nickname */
  handle: string;
  /** 이 브라우저에서 보낸 글. 정렬·권한에 쓰지 않고 표시에만 쓴다. */
  mine: boolean;
  /** 글이 들고 있던 반응 수. 이 브라우저가 누른 것은 여기 더하지 않는다. */
  baseReactions: ReactionCounts;
  createdAt: string; // ISO8601
}

/** 화면에 넘기는 모양. 저장된 값에 이 브라우저의 반응을 합쳐 둔다. */
export interface ChatMessageView extends ChatMessage {
  reactions: ReactionCounts;
  myReactions: ReactionKey[];
}

/**
 * 목록 필터. 지역 둘 + 기간 하나다.
 *
 * 방을 지역별로 나누지 않는다. **전국 하나의 방**이고 이 필터로 좁혀 본다 —
 * 방을 나누면 다 빈 방이 되고, 하나로 합치면 글이 모여 활기가 보인다.
 *
 * 병원 조건은 없다. 글을 병원이 아니라 **구에 건다**(1차). 병원을 다시 붙이는
 * 2차에 hospitalId 를 여기 더한다 — 글 스키마에는 컬럼이 남아 있다.
 */
export interface ChatFilter {
  /** 내 지역만 볼 때. null = 전국 */
  sido: Sido | null;
  /** 구 목록이 있는 시도에서만 채운다. (features/regions/sigungu) */
  sigungu: string | null;
  /**
   * 최근 1개월만 볼까(기본 true), 전체 기간을 볼까.
   *
   * 글을 쌓아 두므로 기간이 곧 검색이다. 키워드 검색을 넣지 않은 이유 —
   * 글이 수십 건일 때 검색창은 빈 결과를 만드는 장치다(UI 원칙 10).
   */
  recentOnly: boolean;
}

/** "최근"의 길이. 1개월로 본다. */
export const RECENT_DAYS = 30;

export const EMPTY_SCOPE: ChatScope = {
  sido: null,
  sigungu: null,
  hospitalId: null,
  hospitalName: null,
};

/** 처음 보는 화면: 전국 · 최근 1개월. */
export const EMPTY_FILTER: ChatFilter = { sido: null, sigungu: null, recentOnly: true };

/**
 * 본문 상한. 음성 입력을 쓰기 때문에 넉넉히 둔다 — 키보드 마이크로 말하면 300자에서
 * 말하다 잘린다. DB 제약도 1000 이다(migration 20261007). 화면은 남은 글자를 보여준다.
 */
export const CHAT_BODY_MAX = 1000;
export const CHAT_TOPIC_MAX = 30;

/**
 * 연속 등록 차단 시간. 같은 사람이 같은 내용을 연달아 올리는 것을 막는 최소 장치다.
 * 서버 차단·신고(Moderation)는 7단계다. 여기서 막는 것은 실수와 연타까지다.
 */
export const CHAT_COOLDOWN_MS = 5_000;
