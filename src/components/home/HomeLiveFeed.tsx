"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LiveInfoNotice } from "@/components/common/LiveInfoNotice";
import { SourceBadge } from "@/components/common/SourceBadge";
import { Toast, useToast } from "@/components/common/Toast";
import { ChatReactions } from "@/components/chat/ChatReactions";
import { ShareButton } from "@/components/chat/ShareButton";
import { categoryLabel } from "@/features/reports/templates";
import type { ReactionKey } from "@/features/chat/reactions";
import { CHAT_TEMPLATES, chatTemplate, chatTemplateText, shouldReplaceChatBody } from "@/features/chat/templates";
import { formatChatAgo, validateChatDraft } from "@/features/chat/service";
import { buildRoomShareText, buildShareText } from "@/features/chat/share";
import { ensureNickname, sendChatMessage } from "@/features/chat/store";
import { COOLDOWN_SECONDS, useChatRoom, useCooldownSeconds } from "@/features/chat/useChatRoom";
import {
  CHAT_BODY_MAX,
  EMPTY_FILTER,
  EMPTY_SCOPE,
  type ChatCategory,
  type ChatMessageView,
} from "@/features/chat/types";

/** 홈에 띄우는 개수. 목록이 아니라 '지금 무슨 일이 있는지'를 보여주는 자리다. */
const HOME_FEED_LIMIT = 4;
/** 상대시각 재판정 주기. */
const TICK_MS = 30_000;

/**
 * 홈 최상단 라이브 피드 + 원터치 등록.
 *
 * 검색 바 바로 아래에 둔다. 야간에 이 앱을 여는 사람은 "지금 어디가 되는지"를 알고 싶고,
 * 그 답은 검색 결과보다 방금 다녀온 보호자의 한 줄에 먼저 있다.
 *
 * 로그인을 요구하지 않는다. 닉네임은 첫 글을 쓸 때 브라우저에 만들어 두고 계속 쓴다.
 * 연속 등록은 쿨다운으로 막는다 — 판정은 store 가 하므로 홈에서 막힌 것이 /chat 에도 통한다.
 */
export function HomeLiveFeed({ renderedAt }: { renderedAt: string }) {
  const { messages, totalCount, nickname, lastSentAt, react } = useChatRoom(renderedAt, EMPTY_FILTER);
  const cooldown = useCooldownSeconds(lastSentAt);
  const { message: toast, show } = useToast();

  const [now, setNow] = useState(() => new Date(renderedAt));
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<ChatCategory>("laceration");
  const [body, setBody] = useState(() => chatTemplateText("laceration"));
  const [topic, setTopic] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const meta = chatTemplate(category);
  const visible = messages.slice(0, HOME_FEED_LIMIT);

  function pickCategory(next: ChatCategory) {
    if (next === category) return;
    if (shouldReplaceChatBody(body, category)) setBody(chatTemplateText(next));
    setCategory(next);
    setError(null);
  }

  function post() {
    const draft = {
      category,
      topic: category === "other" ? topic : null,
      body,
      // 홈에서는 지역을 고르지 않는다. 모르는 지역을 추측해 붙이지 않고 비워 둔다.
      scope: EMPTY_SCOPE,
    };
    const result = validateChatDraft(draft);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    if (sendChatMessage(draft) === null) {
      setError(`잠시 후 다시 등록할 수 있습니다. (${cooldown || COOLDOWN_SECONDS}초)`);
      return;
    }
    setBody(chatTemplateText(category));
    setTopic("");
    setError(null);
    show("등록되었습니다");
  }

  return (
    <section id="live-feed" className="mt-7 scroll-mt-16">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[17px] font-bold leading-snug">
          <span aria-hidden>🔥</span> 실시간 응급·야간 현장 상황
          <span className="ml-1 font-semibold text-ink-faint">(열상·화상)</span>
        </h2>
        <span className="shrink-0 text-[13px] font-semibold text-ink-faint">{totalCount}건</span>
      </div>

      <div className="mt-2.5">
        <LiveInfoNotice compact />
      </div>

      {/* 원터치 등록 — 로그인 없이 칩 한 번 + 등록. */}
      <div className="mt-2.5 ct-card p-4">
        {open ? (
          <>
            <div role="group" aria-label="빠른 등록 분류" className="grid grid-cols-3 gap-1 rounded-[16px] bg-fill p-1">
              {CHAT_TEMPLATES.map((t) => {
                const on = t.value === category;
                return (
                  <button
                    key={t.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => pickCategory(t.value)}
                    className={`h-10 rounded-field text-[14px] transition active:scale-[0.97] ${
                      on ? "bg-blue-soft font-bold text-blue-deep ring-1 ring-inset ring-blue" : "font-semibold text-ink-muted"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>

            {meta.needsTopic && (
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                maxLength={30}
                placeholder="증상·주제 (예: 야간 진료)"
                aria-label="증상 또는 주제"
                className="ct-field mt-2 h-12"
              />
            )}

            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              maxLength={CHAT_BODY_MAX}
              aria-label="현장 상황"
              placeholder="지금 상황을 한 줄로 적어 주세요."
              className="mt-2 w-full resize-none rounded-field bg-fill px-4 py-3 text-[15px] leading-relaxed
                         text-ink transition placeholder:text-ink-faint
                         focus:bg-surface focus:outline-none focus:ring-2 focus:ring-blue"
            />

            <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-faint">
              {nickname ? (
                <>
                  <span className="font-semibold text-ink-muted">{nickname}</span> 이름으로 올라갑니다 · 로그인 없이 등록됩니다
                </>
              ) : (
                "로그인 없이 등록됩니다. 닉네임은 자동으로 만들어집니다."
              )}
              <br />
              이름·연락처처럼 개인을 알 수 있는 정보는 적지 마세요.
            </p>

            {error && (
              <p role="alert" className="mt-2 text-[13px] font-semibold text-limited-ink">
                {error}
              </p>
            )}

            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                onClick={post}
                disabled={cooldown > 0}
                className="h-12 flex-1 rounded-field bg-blue text-[15px] font-semibold text-white transition
                           active:scale-[0.98] disabled:bg-line disabled:text-ink-faint disabled:active:scale-100"
              >
                {cooldown > 0 ? `${cooldown}초 후 등록 가능` : "지금 등록"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-12 rounded-field bg-fill px-4 text-[14.5px] font-semibold text-ink-muted active:brightness-95"
              >
                접기
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              // 닉네임을 미리 만들어 두면 등록 버튼을 누르기 전에 무슨 이름으로 올라가는지 보인다.
              ensureNickname(null);
            }}
            className="flex w-full items-center justify-between gap-3 text-left"
          >
            <span className="min-w-0">
              <span className="block text-[15px] font-bold">현장 상황 1초 등록</span>
              <span className="mt-0.5 block text-[12.5px] text-ink-faint">
                로그인 없이 · 열상 · 화상 · 기타
              </span>
            </span>
            <span
              aria-hidden
              className="flex h-9 shrink-0 items-center rounded-pill bg-blue px-3.5 text-[14px] font-bold text-white"
            >
              등록
            </span>
          </button>
        )}
      </div>

      {/* 라이브 피드 카드 */}
      <ul className="mt-2.5 space-y-2.5">
        {visible.map((message) => (
          <li key={message.id}>
            <FeedCard message={message} now={now} onReact={react} onShared={show} />
          </li>
        ))}
      </ul>

      {visible.length === 0 && (
        <p className="mt-2.5 ct-card p-5 text-[14.5px] leading-relaxed text-ink-muted">
          아직 올라온 현장 상황이 없습니다. 위에서 첫 글을 남겨 주세요.
        </p>
      )}

      <div className="mt-2.5 space-y-2">
        <Link href="/chat" className="ct-primary">
          전체 톡방 보러가기
        </Link>
        <ShareButton text={buildRoomShareText()} scope={EMPTY_SCOPE} onResult={show} variant="block" />
      </div>

      <Toast message={toast} />
    </section>
  );
}

function FeedCard({
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
    <article className="ct-card p-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="ct-chip bg-blue-soft text-blue-deep">{categoryLabel(message.category)}</span>
        {message.topic && <span className="ct-chip">{message.topic}</span>}
        {message.mine && <span className="ct-chip bg-confirmed-soft text-confirmed-ink">내 글</span>}
        <span className="ml-auto shrink-0 text-[12.5px] font-medium text-ink-faint">
          {formatChatAgo(message.createdAt, now)}
        </span>
      </div>

      {/* 홈 카드는 3줄까지만 보여준다. 전체는 톡방에서 읽는다. */}
      <p className="mt-2 line-clamp-3 whitespace-pre-line text-[14.5px] leading-relaxed text-ink">
        {message.body}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[12.5px] font-semibold text-ink-muted">{message.handle}</span>
        {place && <span className="text-[12.5px] text-ink-faint">· {place}</span>}
        <span className="ml-auto">
          <SourceBadge source="user" />
        </span>
      </div>

      <ChatReactions
        counts={message.reactions}
        mine={message.myReactions}
        onToggle={(key) => onReact(message.id, key)}
      />

      <div className="mt-2 flex items-center gap-2">
        <Link
          href={message.scope.hospitalId ? `/hospital/${message.scope.hospitalId}` : "/chat"}
          className="flex-1 text-[13px] font-semibold text-blue"
        >
          {message.scope.hospitalId ? "이 의료기관 정보 보기 ›" : "톡방에서 이어보기 ›"}
        </Link>
        <ShareButton
          text={buildShareText(message.scope, message.category)}
          scope={message.scope}
          onResult={onShared}
        />
      </div>
    </article>
  );
}
