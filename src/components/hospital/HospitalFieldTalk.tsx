"use client";

import Link from "next/link";
import { LiveInfoNotice } from "@/components/common/LiveInfoNotice";
import { Toast, useToast } from "@/components/common/Toast";
import { ChatBubble } from "@/components/chat/ChatBubble";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ComposerClosedNotice } from "@/components/chat/ComposerClosedNotice";
import { useChatRoom } from "@/features/chat/useChatRoom";
import type { ChatFilter, ChatMessage } from "@/features/chat/types";
import type { HospitalView } from "@/features/hospitals/types";
import { isFieldTalkSharingLive } from "@/lib/demoContent";

/**
 * 이 의료기관의 현장톡.
 *
 * ── 왜 합쳤는가 ─────────────────────────────────────────────
 * 전에는 여기에 별도의 "실시간 제보" 피드와 작성 폼이 있었고, 그 글은 브라우저
 * 메모리에만 남았다. 새로고침하면 사라졌다. 같은 사람이 같은 병원에 대해 쓰는데
 * **어디에 썼느냐로 남는지가 갈렸다** — 이용자에게 설명할 수 없는 구분이다.
 *
 * 그래서 저장소를 하나로 뒀다. 이 화면은 /chat 과 같은 방을 이 의료기관으로 좁혀
 * 보여 주는 것이고, 같은 목록 컴포넌트와 같은 작성창을 쓴다. 여기서 쓴 글은
 * 현장톡에서도 보이고, 현장톡에서 이 병원으로 쓴 글은 여기서도 보인다.
 *
 * now 는 병원 상세가 들고 있는 값을 그대로 받는다 — 한 화면에서 '몇 분 전'의
 * 기준 시각이 두 개가 되지 않게 한다. 그래서 여기서 타이머를 따로 돌리지 않는다.
 */
export function HospitalFieldTalk({
  hospital,
  renderedAt,
  now,
  initialMessages = [],
  initialLoadFailed = false,
}: {
  hospital: HospitalView;
  renderedAt: string;
  now: Date;
  /** 서버가 읽어 온 이 의료기관의 글. 첫 화면부터 보이게 하려는 것이다. */
  initialMessages?: ChatMessage[];
  /** 조회가 실패했는가. 빈 목록과 같은 말을 하지 않기 위해 따로 받는다. */
  initialLoadFailed?: boolean;
}) {
  /*
   * 범위는 이 의료기관으로 고정이다. 지역은 비워 둔다 — 병원이 정해지면 지역은
   * 더 좁힐 것이 없고, 지역을 같이 걸면 글의 지역 값이 비어 있을 때 사라진다.
   */
  const filter: ChatFilter = { sido: null, sigungu: null, hospitalId: hospital.id };
  const { messages, lastSentAt, react } = useChatRoom(renderedAt, filter, initialMessages);
  const { message: toast, show } = useToast();

  return (
    <>
      <section className="ct-card p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="ct-section-title">이 의료기관 현장톡</h2>
          <span className="shrink-0 text-[13px] font-semibold text-ink-faint">
            {messages.length}건
          </span>
        </div>

        {/* 읽는 자리 최상단 고정 고지. 접히지 않는다. */}
        <div className="mt-3">
          <LiveInfoNotice />
        </div>

        <ul className="mt-3 divide-y divide-fill">
          {messages.map((message) => (
            <li key={message.id} className="py-3.5 first:pt-1">
              {/* 지금 보고 있는 병원이다. 같은 화면으로 가는 링크를 만들지 않는다. */}
              <ChatBubble
                message={message}
                now={now}
                onReact={react}
                onShared={show}
                hideHospitalLink
              />
            </li>
          ))}
        </ul>

        {messages.length === 0 && (
          <p className="mt-3 text-[14.5px] leading-relaxed text-ink-muted">
            {/*
              조회 실패와 "아직 글이 없음"을 구분해서 말한다. 둘을 같게 다루면 서버가
              죽은 날에도 화면이 "아직 글이 없습니다"라고 말한다. 그건 사실이 아니다.
            */}
            {initialLoadFailed
              ? "글을 불러오지 못했습니다. 잠시 후 다시 열어 주세요. 올라온 글이 없다는 뜻은 아닙니다."
              : "이 의료기관에 올라온 글이 아직 없습니다. 지금 보고 계신 상황을 남겨 주세요."}
          </p>
        )}

        <p className="mt-3 text-[12px] leading-relaxed text-ink-faint">
          {isFieldTalkSharingLive
            ? "여기 남긴 글은 실시간 현장톡에도 함께 올라갑니다. 24시간 동안 공개되고, 이름·연락처는 저장하지 않습니다."
            : "제보 공유 기능은 준비 중입니다. 목록이 비어 있는 것은 오류가 아니라 아직 올라온 글이 없다는 뜻입니다."}
        </p>

        {/*
          다른 지역·병원 이야기로 가는 길. 이 병원 글은 이미 위에 다 있으므로
          "이 병원 보기"로 보내지 않는다 — 같은 것을 두 번 열게 하는 일이다.
        */}
        <Link href="/chat" className="ct-secondary mt-3 w-full">
          다른 지역 · 의료기관 현장톡 보기
        </Link>
      </section>

      {isFieldTalkSharingLive ? (
        <ChatComposer
          /*
           * 범위를 찾는 데 쓸 목록은 이 병원 하나면 된다. 전체 목록을 또 읽어 오면
           * 상세 화면이 목록 조회에 매달린다.
           */
          hospitals={[hospital]}
          filter={filter}
          lastSentAt={lastSentAt}
          onSent={show}
          scopePickerVisible={false}
          scopeNote="이 의료기관 이야기로 올라갑니다. 실시간 현장톡에서도 보입니다."
        />
      ) : (
        <ComposerClosedNotice />
      )}

      <Toast message={toast} />
    </>
  );
}
