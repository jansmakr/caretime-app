"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LiveInfoNotice } from "@/components/common/LiveInfoNotice";
import { Toast, useToast } from "@/components/common/Toast";
import { ChatBubble } from "@/components/chat/ChatBubble";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatFilterBar } from "@/components/chat/ChatFilterBar";
import { ComposerClosedNotice } from "@/components/chat/ComposerClosedNotice";
import { EmptyRoomLead } from "@/components/chat/EmptyRoomLead";
import { ShareButton } from "@/components/chat/ShareButton";
import { useMyRegion } from "@/features/regions/myRegion";
import { regionLabel } from "@/features/regions/sigungu";
import { isFilterActive } from "@/features/chat/service";
import { buildRoomShareText } from "@/features/chat/share";
import { useChatRoom } from "@/features/chat/useChatRoom";
import {
  EMPTY_FILTER,
  EMPTY_SCOPE,
  type ChatFilter,
  type ChatMessage,
} from "@/features/chat/types";
import { CALL_IS_SUREST, NOT_A_BOOKING } from "@/lib/copy";
import { isFieldTalkSharingLive } from "@/lib/demoContent";

/** 상대시각 재판정 주기. 이벤트가 없어도 "3분 전"은 시간이 지나면 바뀌어야 한다. */
const TICK_MS = 30_000;

/**
 * 실시간 현장톡 — 전체 방.
 *
 * 병원 상세는 같은 방을 그 의료기관으로 좁혀 보여 준다(HospitalFieldTalk). 두 화면이
 * 같은 저장소·같은 목록 컴포넌트(ChatBubble)·같은 작성창(ChatComposer)을 쓴다.
 * 이 화면만 따로 들고 있는 것은 지역·병원 필터와 방 전체 공유다 — 상세에서는
 * 범위가 이미 정해져 있어 고를 것이 없다.
 *
 * 첫 렌더의 now 는 서버 시각(renderedAt)을 쓴다. 마운트 후 실제 시각으로 바꿔
 * 상대시각에서 hydration 이 어긋나지 않게 한다. (병원 상세와 같은 방식)
 */
export function ChatRoom({
  renderedAt,
  initialFilter = EMPTY_FILTER,
  initialMessages = [],
  initialLoadFailed = false,
  initialMyPostIds = [],
}: {
  renderedAt: string;
  /** URL 로 들어온 조건. 허용값 검증은 features/chat/urlFilter 가 이미 마쳤다. */
  initialFilter?: ChatFilter;
  /** 서버가 읽어 온 글. 첫 화면부터 글이 보이게 하려는 것뿐이고 화면 구조는 그대로다. */
  initialMessages?: ChatMessage[];
  /** 서버 조회가 실패했는가. 빈 목록과 같은 말을 하지 않기 위해 따로 받는다. */
  initialLoadFailed?: boolean;
  /** 이 브라우저가 쓴 글의 id. 첫 그림부터 삭제 버튼이 붙게 한다. */
  initialMyPostIds?: string[];
}) {
  const [filter, setFilter] = useState<ChatFilter>(initialFilter);
  const [now, setNow] = useState(() => new Date(renderedAt));
  /*
   * 내 지역은 브라우저에 있다(localStorage). 서버는 못 읽으므로 첫 렌더에서는 null 이고
   * 마운트 뒤에 채워진다 — 그래서 첫 화면은 전국이다. 방침에 "거주 지역"을 적지 않기
   * 위해 고른 대가다(features/regions/myRegion).
   */
  const { region: myRegion, loaded: regionLoaded, save: saveRegion } = useMyRegion();
  const { messages, totalCount, lastSentAt, react, remove } = useChatRoom(
    renderedAt,
    filter,
    initialMessages,
    initialMyPostIds,
  );
  const { message: toast, show } = useToast();

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const filtered = isFilterActive(filter);
  /** 지금 좁혀 본 지역의 이름. 안내 문구가 "강서구에는" 으로 시작해야 한다. */
  const regionName =
    filter.sido === null
      ? "전국"
      : regionLabel({ sido: filter.sido, sigungu: filter.sigungu });

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
          filter={filter}
          myRegion={myRegion}
          onChange={setFilter}
          onChangeRegion={saveRegion}
        />
      )}

      {/*
        작성 기능이 닫혀 있을 때의 안내. 지금은 열려 있다(lib/demoContent).
        플래그를 내리면 이쪽이 나온다 — 장애 때 쓰기만 닫는 경로다.
      */}
      {isFieldTalkSharingLive ? (
        <ChatComposer
          myRegion={myRegion}
          lastSentAt={lastSentAt}
          onSent={show}
          onPickRegion={saveRegion}
        />
      ) : (
        <ComposerClosedNotice />
      )}

      {/* 빈 방에서는 "대화 0건"을 그리지 않는다. 위의 안내가 이미 그 말을 하고 있다. */}
      {!emptyRoom && (
      <section className="ct-card p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="ct-section-title">대화</h2>
          <span className="shrink-0 text-[13px] font-semibold text-ink-faint">
            {messages.length}건
          </span>
        </div>

        <ul className="mt-2 divide-y divide-fill">
          {messages.map((message) => (
            <li key={message.id} className="py-3.5 first:pt-1">
              <ChatBubble
                message={message}
                now={now}
                onReact={react}
                onShared={show}
                onRemove={remove}
              />
            </li>
          ))}
        </ul>

        {messages.length === 0 && !emptyRoom && (
          <div className="mt-3">
            {/*
              네 가지를 구분해서 말한다. 넷 다 "목록이 비어 있다"이지만 할 일이 다르다.
                조회 실패      — 우리 문제다. 다시 시도해야 한다.
                내 지역 0건    — 전국에는 글이 있다. **되돌려 준다.**
                기간에 걸림    — 이전 글을 보면 있다.
                진짜 0건       — 첫 글을 쓰면 된다.
              하나로 합치면 서버가 죽은 날에도 "아직 글이 없습니다"라고 말하게 된다.

              내 지역 0건이 **막다른 화면이 되면 안 된다.** 출시 직후 대부분의 구는
              0건이고, 그 사람이 보는 첫 화면이 빈 목록이면 나간다.
            */}
            <p className="text-[14.5px] leading-relaxed text-ink-muted">
              {initialLoadFailed
                ? "글을 불러오지 못했습니다. 잠시 후 다시 열어 주세요. 올라온 글이 없다는 뜻은 아닙니다."
                : filtered
                  ? `${regionName}에는 아직 글이 없어요. 전국 글을 보시겠어요?`
                  : filter.recentOnly
                    ? "최근 1개월에 올라온 글이 없습니다. 이전 글도 보시겠어요?"
                    : "아직 올라온 글이 없습니다. 지금 상황을 물어보거나 알려 주세요."}
            </p>

            {filtered && (
              <button
                type="button"
                onClick={() => setFilter({ ...filter, sido: null, sigungu: null })}
                className="ct-primary mt-3"
              >
                전국 글 보기
              </button>
            )}
            {!filtered && filter.recentOnly && (
              <button
                type="button"
                onClick={() => setFilter({ ...filter, recentOnly: false })}
                className="ct-secondary mt-3 w-full"
              >
                이전 글도 보기
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
            ? "올린 글은 지워지지 않고 쌓입니다. 다른 분들에게 바로 전달되고, 이름·연락처는 저장하지 않습니다. 내 글은 글 옆 [삭제]로 지울 수 있습니다."
            : "제보 공유 기능은 준비 중입니다. 목록이 비어 있는 것은 오류가 아니라 아직 올라온 제보가 없다는 뜻입니다."}
        </p>
      </section>
      )}

      <p className="px-1 text-[13px] leading-relaxed text-ink-faint">
        {NOT_A_BOOKING} {CALL_IS_SUREST}
      </p>
      <Link href="/" className="ct-secondary w-full">
        홈으로
      </Link>

      <Toast message={toast} />
    </main>
  );
}
