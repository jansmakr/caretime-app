"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { SourceBadge } from "@/components/common/SourceBadge";
import { ChatReactions } from "@/components/chat/ChatReactions";
import { PostTime } from "@/components/chat/PostTime";
import { ReplyPanel, ReplyToggle } from "@/components/chat/ReplySection";
import { ReportButton } from "@/components/chat/ReportButton";
import { ShareButton } from "@/components/chat/ShareButton";
import type { ReactionKey } from "@/features/chat/reactions";
import type { ReactionOutcome } from "@/features/chat/repository";
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
 *
 * 내 글에는 삭제가 붙고 신고가 붙지 않는다. 자기 글을 신고하는 것은 운영자에게 가는
 * 길이고 본인이 쓸 길이 아니다 — 익명 게시판에서 자기 글을 못 지우면 잘못 쓴 사람에게
 * 남는 방법이 그것뿐이 된다.
 */
export function ChatBubble({
  message,
  now,
  onReact,
  onShared,
  onRemove,
  hideHospitalLink = false,
  replies,
}: {
  message: ChatMessageView;
  now: Date;
  onReact: (id: string, key: ReactionKey) => Promise<ReactionOutcome>;
  onShared: (text: string) => void;
  /** 내 글 지우기. 없으면 삭제 버튼을 그리지 않는다. */
  onRemove?: (id: string) => Promise<void>;
  /** 이미 그 의료기관 화면에 있는가. 지금 보고 있는 곳으로 가는 링크를 만들지 않는다. */
  hideHospitalLink?: boolean;
  /**
   * 답글. 없으면 답글 버튼을 그리지 않는다 — 답글 수를 아직 못 읽었거나 읽기가 실패한
   * 경우다(features/chat/useReplies). 숫자를 모르는 채로 "답글 0개"를 그리지 않는다.
   */
  replies?: {
    count: number;
    /** 내 글의 새 답글 수. */
    newCount: number;
    canWrite: boolean;
    isMine: (id: string) => boolean;
    onChanged: () => void;
    onSeen: (postId: string, latestAt: string) => void;
  };
}) {
  const place = [message.scope.hospitalName, message.scope.sigungu ?? message.scope.sido]
    .filter(Boolean)
    .join(" · ");
  const [repliesOpen, setRepliesOpen] = useState(false);
  const panelId = useId();

  return (
    <article>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {/*
          분류 칩을 떼었다(2026-10-06). 화면에서 고르지 않으므로 모든 글이 같은 값이고,
          같은 말이 모든 글에 한 줄씩 붙으면 읽어야 하는 줄만 늘어난다(원칙 4).
          글쓴이가 적은 주제가 있으면 그것만 보여준다.
        */}
        {message.topic && <span className="ct-chip bg-blue-soft text-blue-deep">{message.topic}</span>}
        {message.mine && (
          <span className="ct-chip bg-confirmed-soft text-confirmed-ink">내 글</span>
        )}
        {/*
          날짜를 크게 쓴다. 글을 지우지 않고 쌓으므로 2년 전 글이 섞여 있고, 병원이
          진료시간을 바꾸면 **그 글은 거짓이 된다.** 읽는 사람이 그것을 감안할 수
          있어야 해서, 오래된 글일수록 날짜를 더 분명하게 보여준다(원칙 5).
        */}
        <span className="ml-auto shrink-0 text-right">
          {/* "상대 시간 · 정확한 시각"(서울). 색은 24시간·30일로 가른다(PostTime). */}
          <PostTime createdAt={message.createdAt} now={now} />
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

      {/* 원클릭 빠른 반응 — 텍스트 없이 상황을 거든다. 내 글에서는 받은 것만 보여 준다. */}
      <ChatReactions
        counts={message.reactions}
        mine={message.myReactions}
        readOnly={message.mine}
        onPress={(key) => onReact(message.id, key)}
      />

      {/* 답글 버튼도 이 줄에 넣는다. 카드에 새 줄을 만들지 않는다(원칙 4). */}
      <div className="mt-2 flex flex-wrap items-center gap-x-2">
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
        {replies && (
          <ReplyToggle
            count={replies.count}
            newCount={message.mine ? replies.newCount : 0}
            open={repliesOpen}
            controls={panelId}
            onToggle={() => setRepliesOpen((open) => !open)}
          />
        )}
        {/* 내 글은 신고하지 않는다. 대신 지운다. */}
        {message.mine
          ? onRemove && (
              <DeleteButton
                onConfirm={() => onRemove(message.id)}
                onFailed={() => onShared("지우지 못했습니다. 잠시 후 다시 시도해 주세요.")}
              />
            )
          : <ReportButton messageId={message.id} onResult={onShared} />}
        <ShareButton
          text={buildShareText(message.scope, message.category)}
          scope={message.scope}
          onResult={onShared}
        />
      </div>

      {replies && repliesOpen && (
        <ReplyPanel
          id={panelId}
          postId={message.id}
          postIsMine={message.mine}
          canWrite={replies.canWrite}
          now={now}
          isMine={replies.isMine}
          onShared={onShared}
          onChanged={replies.onChanged}
          onSeen={replies.onSeen}
        />
      )}
    </article>
  );
}

/**
 * 삭제 — 두 번 눌러야 지워진다.
 *
 * 한 번에 지우면 목록을 스크롤하다 잘못 눌러 글이 사라진다. 되돌릴 수 없는 동작이라
 * 한 걸음을 둔다. 그렇다고 모달을 띄우지 않는다 — 급한 화면에서 전체를 덮는 창은
 * 읽는 흐름을 끊고, 지금 확인할 것은 "정말 지울까" 한 줄뿐이다.
 */
function DeleteButton({
  onConfirm,
  onFailed,
}: {
  onConfirm: () => Promise<void>;
  onFailed: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="min-h-[44px] shrink-0 px-2 text-[13px] font-semibold text-ink-faint"
      >
        삭제
      </button>
    );
  }

  return (
    <span className="flex shrink-0 items-center gap-1">
      <span className="text-[12.5px] text-ink-muted">지울까요?</span>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          onConfirm()
            .catch(() => {
              onFailed();
              setAsking(false);
            })
            .finally(() => setBusy(false));
        }}
        className="min-h-[44px] px-2 text-[13px] font-bold text-limited-ink"
      >
        {busy ? "지우는 중" : "지운다"}
      </button>
      <button
        type="button"
        onClick={() => setAsking(false)}
        className="min-h-[44px] px-2 text-[13px] font-semibold text-ink-faint"
      >
        취소
      </button>
    </span>
  );
}
