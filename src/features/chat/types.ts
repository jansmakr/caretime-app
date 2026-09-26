import type { Sido } from "@/features/reports/regions";
import type { ReportCategory } from "@/features/reports/types";
import type { ReactionCounts, ReactionKey } from "./reactions";

/**
 * 실시간 현장톡 (/chat).
 *
 * 병원 상세의 제보 피드와 같은 "사용자 공유 계층"이다. 다른 점은 방향이다 —
 * 제보는 다녀온 사람이 남기는 기록이고, 현장톡은 지금 묻고 답하는 대화다.
 * 그래서 병원 상세 안에 묶지 않고 별도 화면으로 둔다(상세에 묶히면 질문이 병원 1곳에 갇힌다).
 *
 * 설계 규칙은 제보와 같다:
 *   - 병원 직접확인 계층(HospitalLiveStatus 등)으로 승격되는 경로가 없다.
 *   - 개인 식별 정보를 담지 않는다. 작성자는 익명 표시명(handle)뿐이다.
 *   - 진단·권고를 담는 필드를 두지 않는다. (Release Blocker 7)
 */

/** 제보와 같은 3분할을 쓴다. 라벨이 갈라지지 않게 reports 의 표를 그대로 읽는다. */
export type ChatCategory = ReportCategory;

/**
 * 이 글이 어느 지역·어느 병원 이야기인지.
 * 전부 null 이면 지역을 특정하지 않은 글이다. 비어 있는 값을 추측해서 채우지 않는다.
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
