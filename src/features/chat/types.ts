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

/** 제보와 같은 3분할을 쓴다. 라벨이 갈라지지 않게 reports 의 표를 그대로 읽는다. */
export type ChatCategory = ReportCategory;

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

/** 목록 필터. 세 값 모두 null 이면 전체 보기다. */
export interface ChatFilter {
  sido: Sido | null;
  sigungu: string | null;
  hospitalId: string | null;
}

export const EMPTY_SCOPE: ChatScope = {
  sido: null,
  sigungu: null,
  hospitalId: null,
  hospitalName: null,
};

export const EMPTY_FILTER: ChatFilter = { sido: null, sigungu: null, hospitalId: null };

export const CHAT_BODY_MAX = 300;
export const CHAT_TOPIC_MAX = 30;

/**
 * 연속 등록 차단 시간. 같은 사람이 같은 내용을 연달아 올리는 것을 막는 최소 장치다.
 * 서버 차단·신고(Moderation)는 7단계다. 여기서 막는 것은 실수와 연타까지다.
 */
export const CHAT_COOLDOWN_MS = 5_000;
