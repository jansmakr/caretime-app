"use client";

import { useId, useState } from "react";
import { SIDO_LIST, type Sido } from "@/features/reports/regions";
import { summarize, validateApplication, type ApplyField } from "@/features/partner-apply/service";
import { submitApplication } from "@/features/partner-apply/store";
import {
  APPLY_CONTACT_NAME_MAX,
  APPLY_CONTACT_POINT_MAX,
  APPLY_NAME_MAX,
  APPLY_SIGUNGU_MAX,
  APPLY_SPECIALTY_MAX,
  EMPTY_APPLICATION,
  type PartnerApplicationDraft,
} from "@/features/partner-apply/types";

/**
 * 의료기관 무료 입점 안내 + 신청 폼.
 *
 * 로그인하지 않은 /partner 의 기본 화면이다. 보호자 화면 헤더의 "[무료] 의료기관 참여"를
 * 누르고 온 의료기관이 처음 보는 면이므로, 로그인 폼을 먼저 세우지 않는다 —
 * 계정은 운영팀이 발급하므로 처음 온 병원에는 넣을 아이디가 없다.
 *
 * 약속하지 않는 것: 노출 순서·상단 배치. 무료라고 적은 자리 바로 아래에
 * "검색 순서에 영향 없음"을 같이 적는다. (Release Blocker 8 — 정렬은 거리 단일축)
 */

const BENEFITS = [
  { title: "등록·이용 비용 없음", detail: "노출을 돈으로 사는 자리가 없습니다." },
  { title: "검색 순서에 영향 없음", detail: "결과는 거리순 하나로만 정렬됩니다." },
  { title: "입력은 1탭", detail: "\"어제와 동일\" 한 번으로 오늘 상태를 확정합니다." },
  { title: "언제든 중단", detail: "입력을 멈추면 공공정보만 남습니다." },
];

const STEPS = [
  "신청 접수 — 아래 내용을 남겨 주세요.",
  "운영팀 확인 — 의료기관 정보와 담당자를 확인합니다.",
  "계정 발급 — 파트너 계정을 만들어 연락드립니다.",
  "입력 시작 — 로그인 후 오늘 상태를 1탭으로 확정합니다.",
];

export function PartnerJoin({ onSignIn }: { onSignIn: () => void }) {
  const [draft, setDraft] = useState<PartnerApplicationDraft>(EMPTY_APPLICATION);
  const [error, setError] = useState<{ field: ApplyField; reason: string } | null>(null);
  const [done, setDone] = useState<PartnerApplicationDraft | null>(null);

  const ids = useId();
  const set = <K extends keyof PartnerApplicationDraft>(key: K, value: PartnerApplicationDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setError((e) => (e?.field === key ? null : e));
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const result = validateApplication(draft);
    if (!result.ok) {
      setError({ field: result.field, reason: result.reason });
      return;
    }
    submitApplication(draft);
    setDone(draft);
  }

  if (done) {
    return (
      <main className="space-y-3 px-4 pb-8 pt-4">
        <section className="ct-card p-6">
          <p className="text-[13px] font-bold text-confirmed">신청 내용을 확인했습니다</p>
          <h2 className="mt-1 text-[21px] font-extrabold">접수할 내용은 아래와 같습니다</h2>

          <dl className="mt-4 space-y-2.5 rounded-field bg-fill px-4 py-3.5 text-[15px]">
            {summarize(done).map((row) => (
              <div key={row.label} className="flex gap-3">
                <dt className="w-24 shrink-0 text-[14px] text-ink-faint">{row.label}</dt>
                <dd className="min-w-0 break-words font-medium">{row.value}</dd>
              </div>
            ))}
          </dl>

          {/* 자동 접수 창구가 아직 없다는 사실을 숨기지 않는다. (Mock 정책) */}
          <p className="mt-4 rounded-field bg-caution-soft px-3.5 py-3 text-[13px] leading-relaxed text-caution-ink">
            지금은 신청 내용이 이 브라우저에만 저장됩니다. 접수 테이블과 알림은 아직 연결되지
            않았습니다. 바로 진행을 원하시면 위 내용을 그대로 CareTime 운영팀에 전달해 주세요.
          </p>

          <div className="mt-5 space-y-2">
            <button
              type="button"
              onClick={() => {
                setDone(null);
                setDraft(EMPTY_APPLICATION);
              }}
              className="ct-secondary w-full"
            >
              다시 작성하기
            </button>
            <button type="button" onClick={onSignIn} className="ct-secondary w-full">
              이미 계정이 있나요? 파트너 로그인
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="space-y-3 px-4 pb-8 pt-4">
      {/* 안내 */}
      <section className="ct-card p-6">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
          <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">무료</span>
          의료기관 참여
        </span>
        <h2 className="mt-3 text-[23px] font-extrabold leading-snug">
          진료 가능 여부와 현재 상황을
          <br />
          보호자에게 직접 알립니다
        </h2>
        <p className="mt-2.5 text-[15px] leading-relaxed text-ink-muted">
          전화가 몰리는 시간에도 &quot;지금 되는지&quot;를 한 번만 입력해 두면 됩니다. CareTime은
          예약을 받지 않고, 의료기관이 확인한 정보를 확인시각과 함께 보여줍니다.
        </p>

        <ul className="mt-5 space-y-2.5">
          {BENEFITS.map((b) => (
            <li key={b.title} className="flex gap-2.5">
              <span aria-hidden className="mt-0.5 shrink-0 font-bold text-confirmed">
                ✓
              </span>
              <span className="min-w-0">
                <span className="text-[15px] font-semibold">{b.title}</span>
                <span className="mt-0.5 block text-[13.5px] leading-relaxed text-ink-faint">{b.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* 절차 */}
      <section className="ct-card p-6">
        <h3 className="ct-section-title">참여 절차</h3>
        <ol className="mt-3 space-y-2.5">
          {STEPS.map((step, i) => (
            <li key={step} className="flex gap-3 text-[14.5px] leading-relaxed">
              <span
                aria-hidden
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-soft text-[12.5px] font-bold text-blue-deep"
              >
                {i + 1}
              </span>
              <span className="min-w-0 text-ink-muted">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* 신청 폼 */}
      <section className="ct-card p-6">
        <h3 className="ct-section-title">참여 신청하기</h3>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-faint">
          운영팀이 연락드릴 수 있을 만큼만 받습니다. 사업자번호·결제수단은 받지 않습니다.
        </p>

        <form onSubmit={submit} noValidate className="mt-4 space-y-3">
          <Field
            id={`${ids}-name`}
            label="의료기관명"
            value={draft.hospitalName}
            onChange={(v) => set("hospitalName", v)}
            maxLength={APPLY_NAME_MAX}
            placeholder="예: ○○의원"
            error={error?.field === "hospitalName" ? error.reason : null}
          />

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[13px] font-semibold text-ink-faint">지역(시/도)</span>
              <select
                value={draft.sido ?? ""}
                aria-label="지역 시/도"
                onChange={(e) => set("sido", (e.target.value || null) as Sido | null)}
                className="ct-field mt-1.5 h-14 text-[15px]"
              >
                <option value="">선택</option>
                {SIDO_LIST.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <Field
              id={`${ids}-sigungu`}
              label="시/군/구"
              value={draft.sigungu}
              onChange={(v) => set("sigungu", v)}
              maxLength={APPLY_SIGUNGU_MAX}
              placeholder="예: 강서구"
              error={null}
            />
          </div>
          {error?.field === "sido" && (
            <p role="alert" className="text-[13.5px] font-semibold text-limited-ink">
              {error.reason}
            </p>
          )}

          <Field
            id={`${ids}-contact-name`}
            label="담당자명"
            value={draft.contactName}
            onChange={(v) => set("contactName", v)}
            maxLength={APPLY_CONTACT_NAME_MAX}
            placeholder="예: 김OO 실장"
            error={error?.field === "contactName" ? error.reason : null}
          />
          <Field
            id={`${ids}-contact-point`}
            label="연락처"
            value={draft.contactPoint}
            onChange={(v) => set("contactPoint", v)}
            maxLength={APPLY_CONTACT_POINT_MAX}
            placeholder="전화번호 또는 이메일"
            error={error?.field === "contactPoint" ? error.reason : null}
          />
          <Field
            id={`${ids}-specialty`}
            label="주요 진료분야"
            value={draft.specialty}
            onChange={(v) => set("specialty", v)}
            maxLength={APPLY_SPECIALTY_MAX}
            placeholder="예: 소아 안면열상 봉합, 화상 드레싱"
            error={error?.field === "specialty" ? error.reason : null}
          />

          <p className="pt-1 text-[12px] leading-relaxed text-ink-faint">
            담당자명·연락처는 참여 안내 연락에만 씁니다. 보호자 화면에는 표시되지 않습니다.
          </p>

          <button type="submit" className="ct-primary">
            무료로 참여 신청하기
          </button>
        </form>
      </section>

      {/* 기존 파트너 로그인 — 작게 분리한다. */}
      <button
        type="button"
        onClick={onSignIn}
        className="mx-auto flex w-fit items-center gap-1.5 rounded-pill px-3 py-2 text-[13.5px] font-semibold text-ink-faint active:bg-surface"
      >
        이미 계정이 있나요? 파트너 로그인 ›
      </button>
    </main>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  maxLength,
  placeholder,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  placeholder: string;
  error: string | null;
}) {
  return (
    <label className="block">
      <span className="text-[13px] font-semibold text-ink-faint">{label}</span>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        className="ct-field mt-1.5 h-14"
      />
      {error && (
        <span role="alert" className="mt-1 block text-[13.5px] font-semibold text-limited-ink">
          {error}
        </span>
      )}
    </label>
  );
}
