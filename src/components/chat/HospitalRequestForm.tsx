"use client";

import { useId, useState } from "react";
import { requestHospital } from "@/features/chat/repository";
import type { ChatFilter } from "@/features/chat/types";

/**
 * 목록에 없는 병원을 알려 달라는 요청.
 *
 * 보호자가 병원 이름을 자유롭게 적어 **글에 붙이는** 길은 만들지 않는다. 같은 병원이
 * 여러 이름으로 쌓여 현장톡이 쪼개지고, 없는 병원에 대한 글이 올라가 다른 보호자가
 * 그걸 찾아 나선다. 그래서 이건 글이 아니라 운영자에게 가는 요청이다.
 *
 * ── 이 화면의 핵심은 접수가 아니다 ────────────────────────────
 *
 * 요청만 받고 끝내면 "나중에 다시 오세요"가 된다. 밤에 아이를 안고 있는 사람에게
 * 그건 나쁜 답이다. 그래서 **지금 할 수 있는 것**을 같이 준다 —
 * 병원을 고르지 않고 지역 현장톡에 묻는 것.
 *
 * "마곡동인데 지금 문 연 소아과 아시는 분?" 은 병원을 지목하지 않는 글이고,
 * 구조가 이미 그것을 허용한다(field_reports.hospital_id 는 null 이어도 된다).
 * 오히려 빈 방의 첫 글로 가장 자연스럽다.
 *
 * 접수 뒤에 닫지 않는다. 그 안내를 읽을 시간을 줘야 한다.
 */
export function HospitalRequestForm({ filter }: { filter: ChatFilter }) {
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [areaHint, setAreaHint] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (state === "sending") return;
    if (name.trim().length < 2) {
      setError("병원 이름을 적어 주세요.");
      return;
    }

    setState("sending");
    setError(null);
    try {
      await requestHospital({
        name: name.trim(),
        sido: filter.sido,
        sigungu: filter.sigungu,
        areaHint: areaHint.trim() === "" ? null : areaHint.trim(),
      });
      setState("done");
    } catch (e) {
      setState("idle");
      setError(e instanceof Error ? e.message : "요청을 접수하지 못했습니다.");
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-[44px] w-full text-left text-[14px] font-semibold text-blue"
      >
        찾는 병원이 목록에 없나요? 알려 주세요 ›
      </button>
    );
  }

  if (state === "done") {
    return (
      <section className="rounded-field bg-confirmed-soft px-4 py-3.5">
        <p className="text-[15px] font-bold text-confirmed-ink">알려 주셔서 고맙습니다.</p>
        <p className="mt-1.5 text-[14px] leading-relaxed text-confirmed-ink">
          확인해서 목록에 넣겠습니다. 다만 지금 바로는 아닙니다.
        </p>

        {/*
          여기가 이 화면에서 가장 중요한 부분이다. 접수만 알리고 끝내면 급한 사람이
          아무것도 얻지 못한 채 화면을 닫는다. 지금 할 수 있는 것을 말한다.
        */}
        <p className="mt-3 text-[15px] font-semibold leading-relaxed">
          지금은 병원을 고르지 않고 물어볼 수 있어요.
        </p>
        <p className="mt-1 text-[14px] leading-relaxed text-ink-muted">
          아래 작성창에 그대로 적어 보세요. 같은 동네 보호자가 볼 수 있습니다.
          <br />
          <span className="font-medium text-ink">
            &ldquo;{areaHint.trim() || "이 근처"}인데 지금 문 연 곳 아시는 분 있나요?&rdquo;
          </span>
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-field bg-fill px-4 py-3.5">
      <p className="text-[15px] font-bold">어느 병원인가요?</p>
      <p className="mt-1 text-[13.5px] leading-relaxed text-ink-muted">
        운영자만 봅니다. 글로 올라가지 않습니다.
      </p>

      <label htmlFor={`${ids}-name`} className="mt-3 block text-[13px] font-medium text-ink-faint">
        병원 이름
      </label>
      <input
        id={`${ids}-name`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={60}
        placeholder="예: 마곡 로뎀소아청소년과"
        className="mt-1 min-h-[48px] w-full rounded-field border border-line bg-surface px-3.5 text-[16px]"
      />

      <label htmlFor={`${ids}-area`} className="mt-3 block text-[13px] font-medium text-ink-faint">
        대략 어디쯤인가요? (선택)
      </label>
      <input
        id={`${ids}-area`}
        value={areaHint}
        onChange={(e) => setAreaHint(e.target.value)}
        maxLength={60}
        placeholder="예: 마곡동"
        className="mt-1 min-h-[48px] w-full rounded-field border border-line bg-surface px-3.5 text-[16px]"
      />
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-faint">
        동 이름 정도면 됩니다. 상세 주소는 적지 않아도 됩니다.
      </p>

      {error && (
        <p role="alert" className="mt-2.5 text-[14px] font-medium text-limited-ink">
          {error}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => void send()}
          disabled={state === "sending"}
          className="ct-primary flex-1 disabled:opacity-50"
        >
          {state === "sending" ? "보내는 중" : "알려 주기"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="ct-secondary">
          닫기
        </button>
      </div>
    </section>
  );
}
