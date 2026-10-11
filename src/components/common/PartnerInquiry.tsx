"use client";

import { useId, useState } from "react";
import { RETENTION_DAYS } from "@/features/p0/retention";

/**
 * "의료기관이신가요?" — 2027년 서비스 사전 신청.
 *
 * ── 지금 없는 것을 있다고 하지 않는다 ───────────────────────
 * 의료기관 검색 서비스는 **아직 없다.** 그래서 첫 줄에 연도를 적고, 지금 받는 것이
 * 신청뿐이라는 것을 먼저 말한다. "참여하세요"로 시작하면 이미 돌아가는 서비스에
 * 들어오는 것으로 읽힌다.
 *
 * ── 쓰지 않는 말 ────────────────────────────────────────────
 * "추천" · "매칭" · "연결해드립니다". 셋 다 우리가 의료기관을 **고른다**는 뜻이고,
 * 그건 의료법 27조(환자 유인·알선)가 걸리는 자리다. 그리고 사실이 아니다 —
 * 우리는 신청을 받아 두었다가 연락할 뿐이다.
 *
 * ── 접혀 있다 ───────────────────────────────────────────────
 * 평소에는 버튼 하나다. 누를 때만 폼이 펼쳐진다(원칙 4). 이 화면의 주인공은
 * 보호자이고, 병원 담당자는 드물게 온다. 드문 쪽이 자리를 먹으면 안 된다.
 */
export function PartnerInquiry({ variant = "card" }: { variant?: "card" | "row" }) {
  const [open, setOpen] = useState(false);
  const [hospitalName, setHospitalName] = useState("");
  const [contact, setContact] = useState("");
  const [message, setMessage] = useState("");
  const [consented, setConsented] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const ids = useId();

  async function submit() {
    setError(null);
    if (hospitalName.trim().length < 2) return setError("병원 이름을 적어 주세요.");
    if (contact.trim().length < 3) return setError("연락처를 적어 주세요.");
    // 체크가 없으면 보내지 않는다. 서버도 다시 본다 — 화면은 증거가 아니다.
    if (!consented) return setError("개인정보 수집·이용에 동의해 주셔야 접수됩니다.");

    setBusy(true);
    try {
      const response = await fetch("/api/partner-inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          hospitalName: hospitalName.trim(),
          contact: contact.trim(),
          message: message.trim() || null,
          consented: true,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(
          response.status === 429
            ? "잠시 후 다시 보내 주세요."
            : (body.error ?? "접수하지 못했습니다."),
        );
        return;
      }
      setSent(true);
    } catch {
      setError("접수하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <Shell variant={variant}>
        <p className="break-keep text-[15px] font-bold leading-relaxed text-blue-deep">
          신청이 접수되었습니다.
        </p>
        <p className="mt-1 break-keep text-[14px] leading-relaxed text-ink-muted">
          준비가 되면 적어 주신 연락처로 안내드리겠습니다.
        </p>
      </Shell>
    );
  }

  if (!open) {
    return (
      <Shell variant={variant}>
        <p className="break-keep text-[16px] font-bold leading-snug">의료기관이신가요?</p>
        <p className="mt-1 break-keep text-[14px] leading-relaxed text-ink-muted">
          2027년부터 의료기관 검색 서비스를 시작합니다. 지금 미리 신청하시면 먼저
          안내드립니다. <span className="font-semibold text-ink">비용 없이 신청만 받습니다.</span>
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="ct-secondary mt-3 w-full"
        >
          사전 신청하기
        </button>
      </Shell>
    );
  }

  return (
    <Shell variant={variant}>
      <p className="break-keep text-[16px] font-bold leading-snug">의료기관 사전 신청</p>
      <p className="mt-1 break-keep text-[14px] leading-relaxed text-ink-muted">
        2027년 서비스 준비가 되면 적어 주신 연락처로 안내드립니다. 비용 없이 신청만
        받습니다.
      </p>

      <div className="mt-3 space-y-2">
        <Field id={`${ids}-name`} label="병원명">
          <input
            id={`${ids}-name`}
            value={hospitalName}
            onChange={(e) => setHospitalName(e.target.value)}
            maxLength={60}
            placeholder="예: ○○소아청소년과의원"
            className="ct-field h-12 w-full text-[15px]"
          />
        </Field>

        <Field id={`${ids}-contact`} label="연락처">
          <input
            id={`${ids}-contact`}
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            maxLength={120}
            placeholder="전화번호 또는 이메일"
            className="ct-field h-12 w-full text-[15px]"
          />
        </Field>

        <Field id={`${ids}-message`} label="남기실 말씀 (선택)">
          <textarea
            id={`${ids}-message`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={500}
            rows={3}
            className="ct-field w-full resize-none py-3 text-[15px]"
          />
        </Field>
      </div>

      {/*
        ── 수집 안내와 동의 ──────────────────────────────────
        제출 버튼 **바로 위**에 둔다. 폼 맨 위에 두면 칸을 채우는 동안 잊고,
        방침 링크로만 두면 읽지 않는다. 누르기 직전이 읽히는 유일한 자리다.

        보관 기간은 features/p0/retention 에서 읽는다 — 숫자를 여기 적으면
        DB 의 retention_policy 와 갈라진다.
      */}
      <div className="mt-4 rounded-field bg-fill px-3.5 py-3">
        <p className="break-keep text-[13.5px] leading-relaxed text-ink-muted">
          <span className="font-semibold text-ink">개인정보 수집·이용 안내</span>
          <br />
          수집 항목: 병원명, 연락처, 남기신 말씀
          <br />
          이용 목적: 사전 신청 접수와 서비스 시작 안내
          <br />
          보관 기간: 접수 후 {RETENTION_DAYS.partner_inquiries}일 (이후 삭제)
          <br />
          동의하지 않으셔도 됩니다. 다만 동의하지 않으시면 접수되지 않습니다.
        </p>

        <label className="mt-2.5 flex min-h-[44px] cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            checked={consented}
            onChange={(e) => setConsented(e.target.checked)}
            className="h-6 w-6 shrink-0 accent-blue"
          />
          <span className="break-keep text-[14.5px] font-semibold leading-snug">
            위 내용에 동의합니다
          </span>
        </label>
      </div>

      {error && (
        <p role="alert" className="mt-2 break-keep text-[13.5px] font-semibold text-limited-ink">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy}
        className="ct-primary mt-3"
      >
        {busy ? "보내는 중입니다…" : "신청 보내기"}
      </button>

      <button
        type="button"
        onClick={() => setOpen(false)}
        className="mt-2 min-h-[44px] w-full text-[13.5px] font-semibold text-ink-muted"
      >
        닫기
      </button>
    </Shell>
  );
}

function Shell({ variant, children }: { variant: "card" | "row"; children: React.ReactNode }) {
  // 더보기 안에서는 바깥 카드가 이미 있으므로 테두리를 또 두르지 않는다.
  return variant === "row" ? (
    <li className="px-5 py-4">{children}</li>
  ) : (
    <section className="ct-card mt-5 p-5">{children}</section>
  );
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="text-[13.5px] font-semibold text-ink-faint">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
