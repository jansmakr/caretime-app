"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LiveInfoNotice } from "@/components/common/LiveInfoNotice";
import { SourceBadge } from "@/components/common/SourceBadge";
import { Toast, useToast } from "@/components/common/Toast";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatFilterBar } from "@/components/chat/ChatFilterBar";
import { ChatReactions } from "@/components/chat/ChatReactions";
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
}: {
  renderedAt: string;
  /** URL 로 들어온 조건. 허용값 검증은 features/chat/urlFilter 가 이미 마쳤다. */
  initialFilter?: ChatFilter;
  /** 서버가 읽어 온 글. 첫 화면부터 글이 보이게 하려는 것뿐이고 화면 구조는 그대로다. */
  initialMessages?: ChatMessage[];
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

  return (
    <main className="space-y-3 px-4 pb-6 pt-3">
      {/* 상단 고정 고지 — 의료기관 현장 상황이 항상 최우선. 접히지 않는다. */}
      <LiveInfoNotice />

      {/* 톡방 전체 공유. 개별 카드에도 같은 버튼이 있다. */}
      <ShareButton text={buildRoomShareText()} scope={EMPTY_SCOPE} onResult={show} variant="block" />

      <ChatFilterBar
        hospitals={list.hospitals}
        loading={list.status === "loading"}
        filter={filter}
        onChange={setFilter}
      />

      {/*
        작성 기능은 아직 서버에 저장되지 않는다(브라우저 메모리 전용, 실시간 수신 없음).
        저장되지 않는 입력을 공유처럼 보이게 하지 않기 위해 운영에서는 작성창을 닫고
        준비 중으로 안내한다. 읽기는 그대로 둔다.
      */}
      {isFieldTalkSharingLive ? (
        <ChatComposer hospitals={list.hospitals} filter={filter} lastSentAt={lastSentAt} onSent={show} />
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

        {messages.length === 0 && (
          <div className="mt-3">
            <p className="text-[14.5px] leading-relaxed text-ink-muted">
              {filtered
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

        <p className="mt-3 text-[12px] leading-relaxed text-ink-faint">
          {isFieldTalkSharingLive
            ? "보낸 글은 지금 이 브라우저에만 보관됩니다. 서버 저장·실시간 공유는 아직 연결되지 않았습니다."
            : "제보 공유 기능은 준비 중입니다. 목록이 비어 있는 것은 오류가 아니라 아직 올라온 제보가 없다는 뜻입니다."}
        </p>
      </section>

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
        <ShareButton
          text={buildShareText(message.scope, message.category)}
          scope={message.scope}
          onResult={onShared}
        />
      </div>
    </article>
  );
}
