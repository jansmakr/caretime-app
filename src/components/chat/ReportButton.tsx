"use client";

import { useState } from "react";
import { reportFieldReport, type ReportReason } from "@/features/chat/repository";

/**
 * 글 신고.
 *
 * 누르면 **바로 접수되지 않는다.** 이유를 한 번 고르게 한다 — 신고는 즉시 글을 내리므로
 * 잘못 눌러서 남의 글이 사라지는 일을 만들면 안 된다. 그 한 단계가 실수를 거른다.
 *
 * 이유를 묻는 두 번째 이유: 운영자가 복구 여부를 판단할 때 "왜 신고됐는지"가 있어야
 * 한다. 개인정보가 적혔다는 신고와 거짓 정보 같다는 신고는 처리가 다르다.
 *
 * 접수되면 화면에서 그 글이 사라진다 — 서버가 내리고 그 사실이 실시간으로 전파된다.
 * 여기서 목록을 직접 건드리지 않는다.
 */

/** 화면에 내놓는 이유. PRD 의 report_reason 중 보호자가 고를 수 있는 것만. */
const REASONS: { value: ReportReason; label: string }[] = [
  { value: "PRIVACY", label: "개인정보가 적혀 있어요" },
  { value: "SUSPECTED_FALSE", label: "사실과 달라 보여요" },
  { value: "DANGEROUS_ADVICE", label: "위험한 조언이에요" },
  { value: "ABUSE", label: "욕설·비방이에요" },
  { value: "SPAM", label: "광고예요" },
  { value: "OTHER", label: "그 밖의 이유" },
];

export function ReportButton({
  messageId,
  onResult,
}: {
  messageId: string;
  onResult: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);

  async function send(reason: ReportReason) {
    if (sending) return;
    setSending(true);
    try {
      await reportFieldReport(messageId, reason);
      setOpen(false);
      onResult("신고했습니다. 확인할 때까지 이 글은 보이지 않습니다.");
    } catch {
      onResult("신고를 접수하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-[44px] shrink-0 px-2 text-[13px] font-semibold text-ink-faint"
      >
        신고
      </button>
    );
  }

  return (
    <div className="mt-2 w-full rounded-field bg-fill p-3">
      <p className="text-[14px] font-semibold">어떤 점이 문제인가요?</p>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
        접수되면 이 글은 바로 보이지 않게 됩니다. 확인 후 복구될 수 있습니다.
      </p>

      <ul className="mt-2.5 space-y-1">
        {REASONS.map((reason) => (
          <li key={reason.value}>
            <button
              type="button"
              disabled={sending}
              onClick={() => void send(reason.value)}
              className="min-h-[44px] w-full rounded-field bg-surface px-3.5 text-left text-[15px] font-medium active:scale-[0.99] disabled:opacity-50"
            >
              {reason.label}
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => setOpen(false)}
        className="mt-2 min-h-[44px] w-full text-[14px] font-semibold text-ink-muted"
      >
        취소
      </button>
    </div>
  );
}
