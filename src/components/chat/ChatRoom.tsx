"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LiveInfoNotice } from "@/components/common/LiveInfoNotice";
import { SourceBadge } from "@/components/common/SourceBadge";
import { Toast, useToast } from "@/components/common/Toast";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatFilterBar } from "@/components/chat/ChatFilterBar";
import { EmptyRoomLead } from "@/components/chat/EmptyRoomLead";
import { ChatReactions } from "@/components/chat/ChatReactions";
import { ReportButton } from "@/components/chat/ReportButton";
import { ShareButton } from "@/components/chat/ShareButton";
import { useHospitalList } from "@/features/hospitals/useHospitalList";
import { categoryLabel } from "@/features/reports/templates";
import type { ReactionKey } from "@/features/chat/reactions";
import { formatChatAgo, isFilterActive } from "@/features/chat/service";
import { buildRoomShareText, buildShareText } from "@/features/chat/share";
import { useChatRoom } from "@/features/chat/useChatRoom";
import {
  EMPTY_FILTER,
  EMPTY_SCOPE,
  type ChatFilter,
  type ChatMessage,
  type ChatMessageView,
} from "@/features/chat/types";
import { CALL_IS_SUREST, NOT_A_BOOKING } from "@/lib/copy";
import { isFieldTalkSharingLive } from "@/lib/demoContent";

/** 상대시각 재판정 주기. 이벤트가 없어도 "3분 전"은 시간이 지나면 바뀌어야 한다. */
const TICK_MS = 30_000;

/**
 * 실시간 현장톡.
 *
 * 병원 상세의 제보 피드는 "이 병원에 다녀온 기록"이고, 여기는 "지금 묻고 답하는 방"이다.
 * 상세 화면에 묶으면 질문이 병원 1곳에 갇히므로 별도 화면으로 둔다.
 *
 * 첫 렌더의 now 는 서버 시각(renderedAt)을 쓴다. 마운트 후 실제 시각으로 바꿔
 * 상대시각에서 hydration 이 어긋나지 않게 한다. (병원 상세와 같은 방식)
 */
export function ChatRoom({
  renderedAt,
  initialFilter = EMPTY_FILTER,
  initialMessages = [],
  initialLoadFailed = false,
}: {
  renderedAt: string;
  /** URL 로 들어온 조건. 허용값 검증은 features/chat/urlFilter 가 이미 마쳤다. */
  initialFilter?: ChatFilter;
  /** 서버가 읽어 온 글. 첫 화면부터 글이 보이게 하려는 것뿐이고 화면 구조는 그대로다. */
  initialMessages?: ChatMessage[];
  /** 서버 조회가 실패했는가. 빈 목록과 같은 말을 하지 않기 위해 따로 받는다. */
  initialLoadFailed?: boolean;
}) {
  const [filter, setFilter] = useState<ChatFilter>(initialFilter);
  const [now, setNow] = useState(() => new Date(renderedAt));
  const list = useHospitalList();
  const { messages, totalCount, lastSentAt, react } = useChatRoom(
    renderedAt,
    filter,
    initialMessages,
  );
  const { message: toast, show } = useToast();

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const filtered = isFilterActive(filter);

  /*
   * 빈 방. **출시 직후에는 반드시 이 상태다.**
   *
   * 아무도 없는 방에 처음 들어온 사람이 글을 쓰게 만드는 것이 이 기능의 전부다.
   * 그런데 평소 화면을 그대로 두면 고를 것 없는 필터 3개와, 공유할 것 없는 공유 버튼이
   * 먼저 나온다. 지금 이 화면의 결정은 하나여야 한다 — 첫 글을 쓴다(원칙 1).
   *
   * 조건을 걸어서 0건인 것은 여기 해당하지 않는다. 그때는 조건을 넓히면 글이 있고,
   * 필터를 감추면 그 길을 막는다.
   */
  const emptyRoom = !filtered && totalCount === 0 && !initialLoadFailed;

  return (
    <main className="space-y-3 px-4 pb-6 pt-3">
      {/* 상단 고정 고지 — 의료기관 현장 상황이 항상 최우선. 접히지 않는다. */}
      <LiveInfoNotice />

      {emptyRoom && <EmptyRoomLead />}

      {/* 톡방 전체 공유. 공유할 글이 없을 때는 내리지 않는다 — 빈 방을 공유하라고 하지 않는다. */}
      {!emptyRoom && (
        <ShareButton text={buildRoomShareText()} scope={EMPTY_SCOPE} onResult={show} variant="block" />
      )}

      {/* 고를 것이 없으면 조건도 접는다. 첫 글은 지역을 고르지 않고도 쓸 수 있다. */}
      {!emptyRoom && (
        <ChatFilterBar
          hospitals={list.hospitals}
          loading={list.status === "loading"}
          filter={filter}
          onChange={setFilter}
        />
      )}

      {/*
        작성 기능이 닫혀 있을 때의 안내. 지금은 열려 있다(lib/demoContent).
        플래그를 내리면 이쪽이 나온다 — 장애 때 쓰기만 닫는 경로다.
      */}
      {isFieldTalkSharingLive ? (
        <ChatComposer
          hospitals={list.hospitals}
          filter={filter}
          lastSentAt={lastSentAt}
          onSent={show}
          scopePickerVisible={!emptyRoom}
        />
      ) : (
        <section className="ct-card p-5">
          <h2 className="ct-section-title">현장 상황 남기기</h2>
          <p className="mt-2 rounded-field border border-amber-200 bg-amber-50 px-3.5 py-3 text-[13.5px] leading-relaxed text-amber-900">
            <span className="mr-1.5 font-bold">준비 중</span>
            제보 작성과 공유 기능을 준비하고 있습니다. 아직 다른 분들에게 전달되지 않아 작성창을
            열어 두지 않았습니다. 지금 상황은 병원에 전화로 확인해 주세요.
          </p>
        </section>
      )}

      {/* 빈 방에서는 "대화 0건"을 그리지 않는다. 위의 안내가 이미 그 말을 하고 있다. */}
      {!emptyRoom && (
      <section className="ct-card p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="ct-section-title">대화</h2>
          <span className="shrink-0 text-[13px] font-semibold text-ink-faint">
            {filtered ? `${messages.length} / ${totalCount}건` : `${totalCount}건`}
          </span>
        </div>

        <ul className="mt-2 divide-y divide-fill">
          {messages.map((message) => (
            <li key={message.id} className="py-3.5 first:pt-1">
              <ChatBubble message={message} now={now} onReact={react} onShared={show} />
            </li>
          ))}
        </ul>

        {messages.length === 0 && !emptyRoom && (
          <div className="mt-3">
            {/*
              세 가지를 구분해서 말한다. 셋 다 "목록이 비어 있다"이지만 사용자가 할 일이 다르다.
                조회 실패 — 우리 문제다. 다시 시도해야 한다.
                조건에 걸림 — 조건을 넓히면 보인다.
                진짜 0건   — 첫 글을 쓰면 된다.
              하나로 합치면 서버가 죽은 날에도 "아직 글이 없습니다"라고 말하게 된다.
            */}
            <p className="text-[14.5px] leading-relaxed text-ink-muted">
              {initialLoadFailed && messages.length === 0
                ? "글을 불러오지 못했습니다. 잠시 후 다시 열어 주세요. 올라온 글이 없다는 뜻은 아닙니다."
                : filtered
                  ? "이 조건에 올라온 글이 아직 없습니다. 위에서 첫 글을 남겨 보세요."
                  : "아직 올라온 글이 없습니다. 지금 상황을 물어보거나 알려 주세요."}
            </p>
            {filtered && (
              <button
                type="button"
                onClick={() => setFilter(EMPTY_FILTER)}
                className="ct-secondary mt-3 w-full"
              >
                전체 보기
              </button>
            )}
          </div>
        )}

        {/*
          이 문구는 "지금 무슨 일이 일어나는가"를 적는 자리다. 사실이 바뀌면 같이 바뀌어야 한다 —
          글이 서버에 저장되기 시작한 뒤에도 "이 브라우저에만 보관됩니다"가 남아 있었다.
        */}
        <p className="mt-3 text-[12px] leading-relaxed text-ink-faint">
          {isFieldTalkSharingLive
            ? "올린 글은 24시간 동안 공개되고, 다른 분들에게 바로 전달됩니다. 이름·연락처는 저장하지 않습니다."
            : "제보 공유 기능은 준비 중입니다. 목록이 비어 있는 것은 오류가 아니라 아직 올라온 제보가 없다는 뜻입니다."}
        </p>
      </section>
      )}

      <p className="px-1 text-[13px] leading-relaxed text-ink-faint">
        {NOT_A_BOOKING} {CALL_IS_SUREST}
      </p>
      <Link href="/" className="ct-secondary w-full">
        진료정보 찾기
      </Link>

      <Toast message={toast} />
    </main>
  );
}

function ChatBubble({
  message,
  now,
  onReact,
  onShared,
}: {
  message: ChatMessageView;
  now: Date;
  onReact: (id: string, key: ReactionKey) => void;
  onShared: (text: string) => void;
}) {
  const place = [message.scope.hospitalName, message.scope.sigungu ?? message.scope.sido]
    .filter(Boolean)
    .join(" · ");

  return (
    <article>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="ct-chip bg-blue-soft text-blue-deep">{categoryLabel(message.category)}</span>
        {message.topic && <span className="ct-chip">{message.topic}</span>}
        {message.mine && (
          <span className="ct-chip bg-confirmed-soft text-confirmed-ink">내 글</span>
        )}
        <span className="ml-auto shrink-0 text-[12.5px] font-medium text-ink-faint">
          {formatChatAgo(message.createdAt, now)}
        </span>
      </div>

      <p className="mt-2 whitespace-pre-line text-[14.5px] leading-relaxed text-ink">{message.body}</p>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[12.5px] font-semibold text-ink-muted">{message.handle}</span>
        {place && <span className="text-[12.5px] text-ink-faint">· {place}</span>}
      </div>
      <div className="mt-1.5">
        {/* 현장톡도 사용자 공유 계층이다. 병원 확인 정보와 같은 배지를 쓰지 않는다. */}
        <SourceBadge source="user" />
      </div>

      {/* 원클릭 빠른 반응 — 텍스트 없이 상황을 거든다. */}
      <ChatReactions
        counts={message.reactions}
        mine={message.myReactions}
        onToggle={(key) => onReact(message.id, key)}
      />

      <div className="mt-2 flex items-center gap-2">
        {message.scope.hospitalId ? (
          <Link
            href={`/hospital/${message.scope.hospitalId}`}
            className="flex-1 text-[13px] font-semibold text-blue"
          >
            이 의료기관 정보 보기 ›
          </Link>
        ) : (
          <span className="flex-1" />
        )}
        {/* 내 글은 신고하지 않는다. 지우는 경로는 아직 없다 — 그건 별도 작업이다. */}
        {!message.mine && <ReportButton messageId={message.id} onResult={onShared} />}
        <ShareButton
          text={buildShareText(message.scope, message.category)}
          scope={message.scope}
          onResult={onShared}
        />
      </div>
    </article>
  );
}
