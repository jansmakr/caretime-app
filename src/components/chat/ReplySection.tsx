"use client";

import { useEffect, useId, useState } from "react";
import { ReportButton } from "@/components/chat/ReportButton";
import { formatChatAgo } from "@/features/chat/service";
import {
  RateLimitedError,
  ReportRejectedError,
  fetchReplies,
  insertReply,
  type ChatReply,
} from "@/features/chat/repository";
import {
  NO_REPLIES,
  REPLIES_FAILED,
  REPLIES_LOADING,
  newRepliesLabel,
  replyButtonLabel,
} from "@/features/chat/replies";
import { markMine } from "@/features/chat/store";
import { CHAT_BODY_MAX } from "@/features/chat/types";
import { FACT_ONLY_NOTICE } from "@/lib/copy";
import { getPublicBrowserSupabase } from "@/lib/supabase/browser";

/**
 * 글 아래 답글.
 *
 * ── 카드에 줄을 늘리지 않는다(원칙 4) ──────────────────────
 * 버튼("💬 답글 N개")은 신고·공유가 있는 **기존 줄**에 들어간다(ReplyToggle).
 * 답글 목록·"첫 답글을 남겨 주세요"·작성칸은 **펼친 뒤에만** 나온다(ReplyPanel).
 * 페이지를 옮기지 않는다 — 급한 화면에서 뒤로 가기 한 번이 길다.
 *
 * ── 빠른 문구는 없다(2026-10-22 결정) ───────────────────────
 * "지금 열려 있어요" 같은 버튼은 확인하지 않은 답을 한 번에 올리게 만든다. 짧은 답은
 * 글 아래 빠른 반응 칩이 맡는다.
 *
 * 답글은 들여쓰고 연한 바탕을 깐다 — 원글과 같은 무게로 읽히면 누가 묻고 누가 답했는지
 * 섞인다. 글자 14px 이상, 버튼 44px 이상(원칙 2·3).
 */

/** 기존 아래쪽 줄에 들어가는 버튼. 내 글이면 새 답글 수를 함께 보인다. */
export function ReplyToggle({
  count,
  newCount,
  open,
  controls,
  onToggle,
}: {
  count: number;
  /** 내 글의 새 답글 수. 남의 글이면 0 이다. */
  newCount: number;
  open: boolean;
  controls: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 px-2 text-[14px] font-semibold text-blue-deep"
    >
      <span aria-hidden>💬</span>
      {replyButtonLabel(count)}
      {newCount > 0 && (
        <span className="rounded-pill bg-blue px-2 py-0.5 text-[14px] font-bold text-surface">
          {newRepliesLabel(newCount)}
        </span>
      )}
    </button>
  );
}

export type ReplyListStatus = "loading" | "failed" | "ready";

/** 펼친 답글 목록. 그리기만 한다(테스트가 저장소 없이 문구를 본다). */
export function ReplyListView({
  status,
  replies,
  now,
  isMine,
  onShared,
  onReported,
}: {
  status: ReplyListStatus;
  replies: ChatReply[];
  now: Date;
  isMine: (id: string) => boolean;
  onShared: (text: string) => void;
  onReported: (id: string) => void;
}) {
  // 상태마다 다른 말을 한다. 실패를 "답글 없음"과 같은 말로 하지 않는다(원칙 8).
  if (status === "loading") {
    return <p className="text-[14px] text-ink-muted">{REPLIES_LOADING}</p>;
  }
  if (status === "failed") {
    return <p className="text-[14px] font-semibold text-ink-muted">{REPLIES_FAILED}</p>;
  }
  if (replies.length === 0) {
    return <p className="text-[14px] font-semibold text-ink-muted">{NO_REPLIES}</p>;
  }
  return (
    <ul aria-label="답글" className="space-y-2">
      {replies.map((reply) => {
        const mine = isMine(reply.id);
        return (
          <li key={reply.id} className="rounded-field bg-fill px-3.5 py-3">
            <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink">{reply.body}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-2">
              <span className="text-[14px] font-semibold text-ink-muted">
                {mine ? `${reply.handle} · 내 답글` : reply.handle}
              </span>
              <span className="text-[14px] text-ink-faint">{formatChatAgo(reply.createdAt, now)}</span>
              {/* 내 답글은 신고하지 않는다(원글과 같다). */}
              {!mine && (
                <span className="ml-auto">
                  <ReportButton
                    messageId={reply.id}
                    onResult={onShared}
                    onReported={() => onReported(reply.id)}
                  />
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** 답글 작성칸. 그리기만 한다. */
export function ReplyComposerView({
  body,
  sending,
  error,
  onChange,
  onSend,
}: {
  body: string;
  sending: boolean;
  error: string | null;
  onChange: (value: string) => void;
  onSend: () => void;
}) {
  const inputId = useId();
  return (
    <div className="mt-3">
      <label htmlFor={inputId} className="text-[14px] font-semibold text-ink">
        답글 쓰기
      </label>
      {/* 16px — iOS 가 입력칸을 누를 때 화면을 확대하지 않는 크기다. */}
      <textarea
        id={inputId}
        value={body}
        maxLength={CHAT_BODY_MAX}
        rows={2}
        onChange={(e) => onChange(e.target.value)}
        className="ct-field mt-1.5 min-h-[88px] w-full resize-none py-3 text-[16px] leading-relaxed"
      />
      {error && (
        <p role="alert" className="mt-2 text-[14px] font-semibold text-limited-ink">
          {error}
        </p>
      )}
      {/* 글과 같은 안내 한 줄(lib/copy). 진단 요구 확인창은 아직 없다. */}
      <p className="mt-2 break-keep text-[14px] leading-relaxed text-ink-muted">{FACT_ONLY_NOTICE}</p>
      <button
        type="button"
        onClick={onSend}
        disabled={sending}
        className="ct-primary mt-2 min-h-[44px] w-full disabled:opacity-60"
      >
        {sending ? "올리는 중…" : "답글 올리기"}
      </button>
    </div>
  );
}

/**
 * 펼친 답글 영역. 펼칠 때 읽고, 올리면 목록 끝에 붙인다.
 * 내 글이면 읽은 답글의 가장 늦은 시각을 "본 시각"으로 남긴다(features/chat/replies).
 */
export function ReplyPanel({
  id,
  postId,
  postIsMine,
  canWrite,
  now,
  isMine,
  onShared,
  onChanged,
  onSeen,
}: {
  id: string;
  postId: string;
  postIsMine: boolean;
  /** 작성 기능이 열려 있는가(lib/demoContent). 닫혀 있으면 목록만 보인다. */
  canWrite: boolean;
  now: Date;
  isMine: (id: string) => boolean;
  onShared: (text: string) => void;
  /** 답글 수가 바뀌었다(올렸다·신고로 내렸다). 부르는 쪽이 수를 다시 읽는다. */
  onChanged: () => void;
  onSeen: (postId: string, latestAt: string) => void;
}) {
  const [status, setStatus] = useState<ReplyListStatus>("loading");
  const [replies, setReplies] = useState<ChatReply[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchReplies(getPublicBrowserSupabase(), postId)
      .then((rows) => {
        if (!live) return;
        setReplies(rows);
        setStatus("ready");
      })
      .catch(() => {
        if (live) setStatus("failed");
      });
    return () => {
      live = false;
    };
  }, [postId]);

  // 내 글의 답글을 봤다. 가장 늦은 답글의 서버 시각으로 적는다.
  useEffect(() => {
    if (!postIsMine || status !== "ready" || replies.length === 0) return;
    onSeen(postId, replies[replies.length - 1].createdAt);
  }, [postIsMine, status, replies, postId, onSeen]);

  async function send() {
    if (sending) return;
    if (body.trim() === "") {
      setError("보낼 내용을 입력해 주세요.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const saved = await insertReply(postId, body);
      markMine(saved.id);
      setReplies((list) => [...list, saved]);
      setStatus("ready");
      setBody("");
      onChanged();
    } catch (e) {
      // 거절 이유(개인정보·욕설·제한)는 서버가 적어 보낸 말을 그대로 쓴다. 작성창과 같다.
      if (e instanceof ReportRejectedError || e instanceof RateLimitedError) setError(e.message);
      else setError("보내지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div id={id} className="mt-2 border-l-2 border-line pl-3">
      <ReplyListView
        status={status}
        replies={replies}
        now={now}
        isMine={isMine}
        onShared={onShared}
        onReported={(replyId) => {
          setReplies((list) => list.filter((r) => r.id !== replyId));
          onChanged();
        }}
      />
      {canWrite && (
        <ReplyComposerView
          body={body}
          sending={sending}
          error={error}
          onChange={(value) => {
            setBody(value);
            if (error) setError(null);
          }}
          onSend={() => void send()}
        />
      )}
    </div>
  );
}
