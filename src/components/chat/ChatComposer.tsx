"use client";

import { useEffect, useId, useState } from "react";
import type { HospitalView } from "@/features/hospitals/types";
import { toDirectory } from "@/features/reports/directory";
import { CHAT_TEMPLATES, chatTemplate, chatTemplateText, shouldReplaceChatBody } from "@/features/chat/templates";
import { validateChatDraft } from "@/features/chat/service";
import { sendChatMessage } from "@/features/chat/store";
import { COOLDOWN_SECONDS, useChatNickname, useCooldownSeconds } from "@/features/chat/useChatRoom";
import {
  CHAT_BODY_MAX,
  CHAT_TOPIC_MAX,
  EMPTY_SCOPE,
  type ChatCategory,
  type ChatFilter,
  type ChatScope,
} from "@/features/chat/types";

/**
 * 현장톡 입력창.
 *
 * 퀵 템플릿 칩(열상 · 화상 · 기타)을 누르면 물어볼 항목이 채워지고, 보호자는 상황만 덧붙인다.
 * 이미 쓴 글은 칩을 잘못 눌러도 지워지지 않는다.
 *
 * 보내는 글의 지역·병원은 지금 보고 있는 필터를 그대로 따라간다 —
 * 강서구를 보고 있다가 보낸 글이 다른 지역에 붙으면 아무도 답을 못 한다.
 */
export function ChatComposer({
  hospitals,
  filter,
  lastSentAt,
  onSent,
  scopePickerVisible = true,
}: {
  hospitals: HospitalView[];
  filter: ChatFilter;
  lastSentAt: number | null;
  onSent: (message: string) => void;
  /** 조건 고르는 줄이 화면에 있는가. 빈 방에서는 감춰져 있어 안내 문구가 달라진다. */
  scopePickerVisible?: boolean;
}) {
  const [category, setCategory] = useState<ChatCategory>("laceration");
  const [topic, setTopic] = useState("");
  const [body, setBody] = useState(() => chatTemplateText("laceration"));
  const [error, setError] = useState<string | null>(null);
  const cooldown = useCooldownSeconds(lastSentAt);

  /*
   * 닉네임은 서버가 정한다(게스트 세션). 화면은 받아와서 보여 주기만 한다.
   * 아직 못 받았으면 null 이고, 그동안에도 글은 쓸 수 있다 — 글에 붙는 이름도 서버가
   * 정하므로 화면이 이름을 알아야 보낼 수 있는 것은 아니다.
   */
  const nickname = useChatNickname();

  const ids = useId();
  const meta = chatTemplate(category);

  /** 필터를 그대로 글의 범위로 쓴다. 병원까지 골라져 있으면 이름도 같이 싣는다. */
  function scopeFromFilter(): ChatScope {
    if (!filter.sido && !filter.sigungu && !filter.hospitalId) return EMPTY_SCOPE;
    const entry = toDirectory(hospitals).find((h) => h.id === filter.hospitalId);
    return {
      sido: filter.sido ?? entry?.sido ?? null,
      sigungu: filter.sigungu ?? entry?.sigungu ?? null,
      hospitalId: filter.hospitalId,
      hospitalName: entry?.name ?? null,
    };
  }

  function pickCategory(next: ChatCategory) {
    if (next === category) return;
    if (shouldReplaceChatBody(body, category)) setBody(chatTemplateText(next));
    setCategory(next);
    setError(null);
  }

  async function send() {
    const draft = {
      category,
      topic: category === "other" ? topic : null,
      body,
      scope: scopeFromFilter(),
    };
    const result = validateChatDraft(draft);
    if (!result.ok) {
      setError(result.reason);
      return;
    }

    // 글은 이제 서버에 저장된다. 저장이 끝나기 전에 입력칸을 비우지 않는다 —
    // 실패했을 때 쓴 내용이 사라지면 다시 쓰게 된다.
    try {
      if ((await sendChatMessage(draft)) === null) {
        setError(`잠시 후 다시 보낼 수 있습니다. (${cooldown || COOLDOWN_SECONDS}초)`);
        return;
      }
    } catch {
      setError("보내지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    setBody(chatTemplateText(category));
    setTopic("");
    setError(null);
    onSent("등록되었습니다");
  }

  const scope = scopeFromFilter();
  const scopeLabel =
    [scope.hospitalName, scope.sigungu ?? scope.sido].filter(Boolean).join(" · ") || "지역 미지정";

  return (
    <section className="ct-card p-5">
      <h2 className="ct-section-title">현장 상황 묻기 · 답하기</h2>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-muted">
        직접 확인한 사실만 적어 주세요. 진단이나 치료 판단은 적지 않습니다.
      </p>

      {/* 퀵 템플릿 칩 3분할 */}
      <div role="group" aria-label="퀵 템플릿" className="mt-4 grid grid-cols-3 gap-1 rounded-[18px] bg-fill p-1">
        {CHAT_TEMPLATES.map((t) => {
          const on = t.value === category;
          return (
            <button
              key={t.value}
              type="button"
              aria-pressed={on}
              onClick={() => pickCategory(t.value)}
              className={`flex min-h-[54px] flex-col items-center justify-center rounded-field px-1 text-center transition active:scale-[0.97] ${
                on ? "bg-blue-soft text-blue-deep ring-1 ring-inset ring-blue" : "text-ink-muted"
              }`}
            >
              <span className={`text-[15px] ${on ? "font-bold" : "font-semibold"}`}>{t.label}</span>
              <span className="mt-0.5 text-[11px] font-medium text-ink-faint">{t.hint}</span>
            </button>
          );
        })}
      </div>

      {meta.needsTopic && (
        <div className="mt-3">
          <label htmlFor={`${ids}-topic`} className="text-[12.5px] font-semibold text-ink-faint">
            증상 · 주제 직접 입력
          </label>
          <input
            id={`${ids}-topic`}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            maxLength={CHAT_TOPIC_MAX}
            placeholder="예: 야간 진료, 접수 마감, 주차"
            className="ct-field mt-1 h-12"
          />
        </div>
      )}

      <div className="mt-3">
        <label htmlFor={`${ids}-body`} className="text-[12.5px] font-semibold text-ink-faint">
          자유 입력
        </label>
        <textarea
          id={`${ids}-body`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          maxLength={CHAT_BODY_MAX}
          placeholder="지금 상황을 적어 주세요."
          className="mt-1 w-full resize-none rounded-field bg-fill px-4 py-3 text-[15px] leading-relaxed
                     text-ink transition placeholder:text-ink-faint
                     focus:bg-surface focus:outline-none focus:ring-2 focus:ring-blue"
        />
        <div className="mt-1 flex items-start justify-between gap-3">
          <p className="text-[11.5px] leading-relaxed text-ink-faint">
            이름·연락처처럼 개인을 알 수 있는 정보는 적지 마세요.
          </p>
          <span className="shrink-0 text-[11.5px] text-ink-faint">
            {body.length}/{CHAT_BODY_MAX}
          </span>
        </div>
      </div>

      <p className="mt-3 rounded-field bg-fill px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-faint">
        <span className="font-semibold text-ink-muted">올라갈 위치 </span>
        {scopeLabel}
        <br />
        {/*
          빈 방에서는 조건 고르는 줄을 감춘다(ChatRoom). 그때 "위에서 고르면"은 가리킬
          곳이 없는 말이 된다. 안내는 화면에 실제로 있는 것만 가리켜야 한다.
        */}
        {scopePickerVisible
          ? "위에서 지역·병원을 고르면 그 방으로 올라갑니다."
          : "지역을 고르지 않아도 올라갑니다. 어느 병원인지는 글에 적어 주세요."}
        {nickname && (
          <>
            <br />
            <span className="font-semibold text-ink-muted">{nickname}</span> 이름으로 올라갑니다 · 로그인 없이 등록됩니다
          </>
        )}
      </p>

      {error && (
        <p role="alert" className="mt-3 text-[13.5px] font-semibold text-limited-ink">
          {error}
        </p>
      )}

      <button type="button" onClick={() => void send()} disabled={cooldown > 0} className="ct-primary mt-4">
        {cooldown > 0 ? `${cooldown}초 후 보낼 수 있습니다` : "보내기"}
      </button>
    </section>
  );
}
