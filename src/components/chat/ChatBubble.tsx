"use client";

import { useState } from "react";
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
}: {
  message: ChatMessageView;
  now: Date;
  onReact: (id: string, key: ReactionKey) => void;
  onShared: (text: string) => void;
  /** 내 글 지우기. 없으면 삭제 버튼을 그리지 않는다. */
  onRemove?: (id: string) => Promise<void>;
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
