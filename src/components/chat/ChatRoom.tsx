"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LiveInfoNotice } from "@/components/common/LiveInfoNotice";
import { SourceBadge } from "@/components/common/SourceBadge";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatFilterBar } from "@/components/chat/ChatFilterBar";
import { useHospitalList } from "@/features/hospitals/useHospitalList";
import { categoryLabel } from "@/features/reports/templates";
import { formatChatAgo, isFilterActive } from "@/features/chat/service";
import { useChatRoom } from "@/features/chat/useChatRoom";
import { EMPTY_FILTER, type ChatFilter, type ChatMessage } from "@/features/chat/types";
import { CALL_IS_SUREST, NOT_A_BOOKING } from "@/lib/copy";

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
export function ChatRoom({ renderedAt }: { renderedAt: string }) {
  const [filter, setFilter] = useState<ChatFilter>(EMPTY_FILTER);
  const [now, setNow] = useState(() => new Date(renderedAt));
  const list = useHospitalList();
  const { messages, totalCount } = useChatRoom(renderedAt, filter);

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

      <ChatFilterBar
        hospitals={list.hospitals}
        loading={list.status === "loading"}
        filter={filter}
        onChange={setFilter}
      />

      <ChatComposer hospitals={list.hospitals} filter={filter} />

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
              <ChatBubble message={message} now={now} />
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
          보낸 글은 지금 이 브라우저에만 보관됩니다. 6단계(Realtime Feed · 로그인 · Moderation)에서
          실제 공유로 연결됩니다.
        </p>
      </section>

      <p className="px-1 text-[13px] leading-relaxed text-ink-faint">
        {NOT_A_BOOKING} {CALL_IS_SUREST}
      </p>
      <Link href="/" className="ct-secondary w-full">
        진료정보 찾기
      </Link>
    </main>
  );
}

function ChatBubble({ message, now }: { message: ChatMessage; now: Date }) {
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

      {message.scope.hospitalId && (
        <Link
          href={`/hospital/${message.scope.hospitalId}`}
          className="mt-2 inline-flex text-[13px] font-semibold text-blue"
        >
          이 의료기관 정보 보기 ›
        </Link>
      )}
    </article>
  );
}
