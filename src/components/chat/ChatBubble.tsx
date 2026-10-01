"use client";

import Link from "next/link";
import { SourceBadge } from "@/components/common/SourceBadge";
import { ChatReactions } from "@/components/chat/ChatReactions";
import { ReportButton } from "@/components/chat/ReportButton";
import { ShareButton } from "@/components/chat/ShareButton";
import { categoryLabel } from "@/features/reports/templates";
import type { ReactionKey } from "@/features/chat/reactions";
import { formatChatAgo } from "@/features/chat/service";
import { buildShareText } from "@/features/chat/share";
import type { ChatMessageView } from "@/features/chat/types";

/**
 * 글 하나.
 *
 * /chat 과 병원 상세가 **같은 컴포넌트**를 쓴다. 두 벌로 두었더니 한쪽 화면에만
 * 신고 버튼이 붙거나 문구가 갈라졌다 — 같은 글을 보는데 어디서 보느냐로 할 수 있는
 * 일이 달라지면 안 된다.
 *
 * now 는 받아서 쓴다. 화면 안에서 '몇 분 전'의 기준 시각이 두 개가 되지 않게 한다.
 */
export function ChatBubble({
  message,
  now,
  onReact,
  onShared,
  hideHospitalLink = false,
}: {
  message: ChatMessageView;
  now: Date;
  onReact: (id: string, key: ReactionKey) => void;
  onShared: (text: string) => void;
  /** 이미 그 의료기관 화면에 있는가. 지금 보고 있는 곳으로 가는 링크를 만들지 않는다. */
  hideHospitalLink?: boolean;
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
        {message.scope.hospitalId && !hideHospitalLink ? (
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
