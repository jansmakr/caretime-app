"use client";

import { useId, useState } from "react";
import { regionLabel, type MyRegion } from "@/features/regions/sigungu";
import { LocateButton } from "@/components/chat/LocateButton";
import { RegionPicker } from "@/components/chat/RegionPicker";
import { validateChatDraft } from "@/features/chat/service";
import { sendChatMessage } from "@/features/chat/store";
import { RateLimitedError, ReportRejectedError } from "@/features/chat/repository";
import { COOLDOWN_SECONDS, useChatNickname, useCooldownSeconds } from "@/features/chat/useChatRoom";
import {
  CHAT_BODY_MAX,
  DEFAULT_CATEGORY,
  EMPTY_SCOPE,
  type ChatScope,
} from "@/features/chat/types";

/**
 * 현장톡 입력창. **칸 하나로 끝난다.**
 *
 * ── 주제 칩을 없앴다 (2026-10-06) ───────────────────────────
 * 전에는 "찢어진 상처 / 화상 / 그 밖의 상황" 칩 셋이 먼저 보이고, 누르면 물어볼
 * 항목이 본문에 채워졌다. 그것이 **대상을 좁혔다** — 열·구토로 온 사람이 그 셋을
 * 보고 "내 건 해당 안 되나" 하고 멈춘다. 서비스는 전 과목·전 연령으로 연다.
 *
 * 분류할 이유도 없어졌다. 글은 지역 하나로 흐르고(전국 방 + 내 지역 필터),
 * 찾는 축은 지역과 기간이다. 칩은 읽어야 하는 줄만 늘린다(원칙 4·10).
 *
 * `field_reports.category` 컬럼은 남아 있고 모든 글이 같은 값으로 들어간다.
 * 2차에 분류가 다시 필요해지면 그 컬럼을 쓴다 — 지금은 화면에서만 없앴다.
 *
 * 남은 것: 주제 한 줄(선택) · 본문 · 보내기. 진단·치료 조언을 적지 말라는 문구는
 * 그대로 둔다. 그건 대상을 좁히는 말이 아니라 **하지 말아야 하는 일**이다.
 */
export function ChatComposer({
  myRegion,
  lastSentAt,
  onSent,
  onPickRegion,
  scopeNote,
}: {
  /**
   * 글에 붙는 지역. **보고 있는 필터가 아니라 글쓴이의 지역이다.**
   *
   * 전에는 필터를 그대로 글의 범위로 썼다. 전국을 보고 있으면 글에 지역이 안 붙고,
   * 다른 구를 보고 있으면 그 구에 붙었다. 전국 한 방에서는 "글쓴이의 구"가 맞다 —
   * 다른 구 이야기는 본문에 쓴다(병원을 본문에 쓰기로 한 것과 같다).
   */
  myRegion: MyRegion | null;
  lastSentAt: number | null;
  onSent: (message: string) => void;
  /**
   * "내 위치로 선택"으로 고른 지역을 저장한다. 직접 고르는 것(지역 바꾸기)과
   * **같은 자리에 들어간다** — 고르는 길이 둘이어도 저장되는 값은 하나다.
   * 넘기지 않으면 버튼을 그리지 않는다.
   */
  onPickRegion?: (region: MyRegion) => void;
  /** 어디로 올라가는지 설명하는 한 줄. 넘기면 이 문구를 쓴다. */
  scopeNote?: string;
}) {
  const [body, setBody] = useState("");
  /** 지역을 고치는 칸을 펼쳤는가. 평소 접혀 있다 — 한 번 정하면 거의 안 바꾼다. */
  const [editingRegion, setEditingRegion] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cooldown = useCooldownSeconds(lastSentAt);

  /*
   * 닉네임은 서버가 정한다(게스트 세션). 화면은 받아와서 보여 주기만 한다.
   * 아직 못 받았으면 null 이고, 그동안에도 글은 쓸 수 있다 — 글에 붙는 이름도 서버가
   * 정하므로 화면이 이름을 알아야 보낼 수 있는 것은 아니다.
   */
  const nickname = useChatNickname();
  const ids = useId();

  /**
   * 글에 붙는 범위. 내 지역 하나뿐이다.
   *
   * 병원은 넣지 않는다 — 1차에는 고르는 자리가 없고, 병원 이름은 본문에 쓴다.
   * 컬럼은 글 스키마에 남아 있다(2차).
   */
  function myScope(): ChatScope {
    if (myRegion === null) return EMPTY_SCOPE;
    return {
      sido: myRegion.sido,
      sigungu: myRegion.sigungu,
      hospitalId: null,
      hospitalName: null,
    };
  }

  async function send() {
    const draft = {
      // 모든 글이 같은 값으로 들어간다. 화면에서 고르지 않는다.
      category: DEFAULT_CATEGORY,
      // 주제 칸이 없다. 쓸 말은 본문에 들어간다.
      topic: null,
      body,
      scope: myScope(),
    };
    const result = validateChatDraft(draft);
    if (!result.ok) {
      setError(result.reason);
      return;
    }

    // 저장이 끝나기 전에 입력칸을 비우지 않는다 — 실패했을 때 쓴 내용이 사라지면
    // 다시 쓰게 된다.
    try {
      if ((await sendChatMessage(draft)) === null) {
        setError(`잠시 후 다시 보낼 수 있습니다. (${cooldown || COOLDOWN_SECONDS}초)`);
        return;
      }
    } catch (e) {
      /*
       * 서버가 거절한 이유를 **그대로 보여 준다.** "보내지 못했습니다"만 뜨면
       * 무엇을 고쳐야 할지 모르고 그냥 나간다 — 개인정보가 걸린 것인지, 욕설이
       * 걸린 것인지, 서버가 죽은 것인지가 전부 같은 문장이 된다.
       */
      if (e instanceof ReportRejectedError) setError(e.message);
      else if (e instanceof RateLimitedError) setError(e.message);
      else setError("보내지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    setBody("");
    setError(null);
    onSent("등록되었습니다");
  }

  /*
   * "지역 미지정"은 관리자 말이고, 뭘 안 고른 잘못처럼 읽힌다. 안 골라도 올라가는
   * 것이 사실이므로 **괜찮다고 말하는 문구**를 쓴다.
   */
  const scopeLabel = myRegion === null ? "지역 없이" : regionLabel(myRegion);
  const left = CHAT_BODY_MAX - body.length;

  return (
    <section className="ct-card p-5">
      <h2 className="ct-section-title">묻거나 알려주기</h2>

      {/*
        금지 문구를 맨 위에서 **버튼 근처로 내렸다.** 첫 글을 쓰려는 사람이 처음 보는
        것이 "하지 마라" 두 개면 손이 멈춘다. 같은 문장이 올리기 직전에는 "확인"으로
        읽힌다.
      */}
      <div className="mt-3">
        <textarea
          id={`${ids}-body`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          maxLength={CHAT_BODY_MAX}
          placeholder="지금 상황이든, 전에 겪은 일이든 적어 주세요. 어느 동네·병원인지 함께 적으면 더 도움이 됩니다."
          className="mt-1 w-full resize-none rounded-field bg-fill px-4 py-3 text-[15px] leading-relaxed
                     text-ink transition placeholder:text-ink-faint
                     focus:bg-surface focus:outline-none focus:ring-2 focus:ring-blue"
        />
        <div className="mt-1 flex items-start justify-between gap-3">
          <p className="break-keep text-[11.5px] leading-relaxed text-ink-faint">
            이름과 연락처는 적지 마세요
          </p>
          {/*
            남은 글자를 보여준다. 음성으로 말하면 길어지기 쉬워서 "몇 자 썼나"보다
            "얼마 남았나"가 쓸모 있다 — 잘린 줄 모르고 올리는 것을 막는다.
            100자 아래로 내려가면 색으로도 알린다.
          */}
          <span
            className={`shrink-0 text-[11.5px] ${
              left <= 100 ? "font-semibold text-caution-ink" : "text-ink-faint"
            }`}
          >
            {left}자 남음
          </span>
        </div>
      </div>

      {/*
        주제 칸을 없앴다(원칙 10). 자유 입력이라 분류가 되지 않고, 쓸 말은 본문에 다
        들어간다 — 칸을 하나 더 두면 "채워야 하나"를 한 번 더 판단하게 된다.
        목록의 칩도 함께 사라진다.
      */}

      <p className="mt-3 rounded-field bg-fill px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-faint">
        <span className="font-semibold text-ink-muted">올라갈 위치 </span>
        {scopeLabel}
        <br />
        {scopeNote ??
          (myRegion === null
            ? "구를 고르면 같은 동네 사람이 찾아 읽습니다. 안 골라도 올라갑니다."
            : "다른 동네 이야기는 글에 적어 주세요.")}
        {nickname && (
          <>
            <br />
            <span className="font-semibold text-ink-muted">{nickname}</span> 이름으로 올라갑니다 ·
            로그인 없이 등록됩니다
          </>
        )}
      </p>

      {/*
        ── 지역을 정하는 자리. 작성창 안에 둔다 ──────────────────
        전에는 바꾸려면 위로 올라가 필터의 "내 지역 바꾸기"를 눌러야 했다. 위치로
        고른 값이 틀렸을 때 **고치는 비용이 거기까지 올라가는 것**이면, 확인 창을
        미리 띄워야 한다. 고치는 길을 옆에 두면 미리 묻지 않아도 된다.

        · 아직 안 골랐으면 → [내 위치로 선택]
        · 골랐으면 → [바꾸기] 한 줄. 누를 때만 고르는 칸이 펼쳐진다(원칙 4).
      */}
      {onPickRegion && !editingRegion && myRegion === null && (
        <LocateButton onPick={onPickRegion} />
      )}

      {onPickRegion && !editingRegion && myRegion !== null && (
        <button
          type="button"
          onClick={() => setEditingRegion(true)}
          className="mt-1 min-h-[44px] text-[13.5px] font-semibold text-blue"
        >
          올라갈 위치 바꾸기
        </button>
      )}

      {onPickRegion && editingRegion && (
        <div className="mt-2">
          <RegionPicker
            region={myRegion}
            onChange={(next) => {
              onPickRegion(next);
              setEditingRegion(false);
            }}
          />
          <button
            type="button"
            onClick={() => setEditingRegion(false)}
            className="mt-2 min-h-[44px] w-full text-[13.5px] font-semibold text-ink-muted"
          >
            닫기
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-[13.5px] font-semibold text-limited-ink">
          {error}
        </p>
      )}

      {/*
        올리기 직전의 확인 두 줄.
        둘째 줄을 "차단됩니다"로 쓰지 않는다 — 욕설은 서버가 거르지만 문맥 비방
        ("○○병원 불친절해요")은 통과한다. 통과하는 것을 막는다고 적으면 거짓이
        되고, 거짓인 경고는 다음 경고까지 안 읽히게 만든다(features/p0/abuse).
      */}
      <p className="mt-4 break-keep text-[13px] leading-relaxed text-ink-muted">
        직접 확인한 사실만 적어 주세요. 진단이나 치료 판단은 적지 않습니다.
        <br />
        <span className="font-semibold text-ink">
          의료기관·의료진을 비방하는 글, 욕설은 올릴 수 없습니다.
        </span>
      </p>

      {/*
        "보내기"는 1:1 로 전하는 느낌이다. 글은 쌓여서 뒤에 오는 사람이 읽는다.
      */}
      <button
        type="button"
        onClick={() => void send()}
        disabled={cooldown > 0}
        className="ct-primary mt-2"
      >
        {cooldown > 0 ? `${cooldown}초 후 올릴 수 있습니다` : "올리기"}
      </button>
    </section>
  );
}
