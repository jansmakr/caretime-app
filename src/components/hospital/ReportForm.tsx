"use client";

import { useId, useMemo, useState } from "react";
import { LiveInfoNotice } from "@/components/common/LiveInfoNotice";
import type { HospitalView } from "@/features/hospitals/types";
import { hospitalRef, targetFromRef } from "@/features/reports/directory";
import { validateDraft } from "@/features/reports/service";
import { submitReport } from "@/features/reports/store";
import {
  REPORT_CATEGORIES,
  categoryMeta,
  shouldReplaceBody,
  templateFor,
} from "@/features/reports/templates";
import {
  REPORT_BODY_MAX,
  REPORT_TOPIC_MAX,
  REPORT_WAITING_MAX,
  type ReportCategory,
  type ReportTarget,
} from "@/features/reports/types";
import { ReportTargetPicker } from "@/components/hospital/ReportTargetPicker";
import { WaitingStepper } from "@/components/hospital/WaitingStepper";

/**
 * 실시간 제보 작성 폼.
 *
 * 저장 버튼 하나로 끝나야 한다 — 병원 앞에서 한 손으로 쓰는 화면이다.
 * 카테고리 칩을 누르면 확인 항목이 템플릿으로 채워지고, 보호자는 답만 적는다.
 * 이미 적어 넣은 내용은 칩을 잘못 눌러도 지워지지 않는다.
 *
 * 이 폼이 쓰는 저장 경로는 features/reports/store 하나뿐이다.
 * 병원 직접확인 테이블(hospital_live_status 등)로는 아무것도 보내지 않는다.
 */
export function ReportForm({ hospital }: { hospital: HospitalView }) {
  const defaultTarget = useMemo(() => targetFromRef(hospitalRef(hospital)), [hospital]);

  const [target, setTarget] = useState<ReportTarget>(defaultTarget);
  const [category, setCategory] = useState<ReportCategory>("laceration");
  const [topic, setTopic] = useState("");
  const [body, setBody] = useState(() => templateFor("laceration"));
  const [waiting, setWaiting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submittedTo, setSubmittedTo] = useState<string | null>(null);

  const ids = useId();
  const meta = categoryMeta(category);

  function pickCategory(next: ReportCategory) {
    if (next === category) return;
    if (shouldReplaceBody(body, category)) setBody(templateFor(next));
    setCategory(next);
    setError(null);
  }

  function register() {
    const draft = {
      target,
      category,
      topic: category === "other" ? topic : null,
      body,
      waitingHeadcount: waiting,
    };
    const result = validateDraft(draft);
    if (!result.ok) {
      setError(result.reason);
      return;
    }

    submitReport(draft);
    setSubmittedTo(target.hospitalName);
    setError(null);
    // 다음 제보를 위해 본문만 비운다. 대상 병원과 카테고리는 그대로 둔다.
    setBody(templateFor(category));
    setTopic("");
    setWaiting(null);
  }

  const otherHospital = submittedTo !== null && submittedTo !== defaultTarget.hospitalName;

  return (
    <section className="ct-card p-5">
      <h2 className="ct-section-title">실시간 제보하기</h2>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-muted">
        현장에서 직접 확인한 사실만 적어 주세요. 진단이나 치료 판단은 적지 않습니다.
      </p>

      {/* 작성 폼 상단 고정 고지. 피드 쪽과 같은 문구를 쓴다. */}
      <div className="mt-3">
        <LiveInfoNotice compact />
      </div>

      <div className="mt-4">
        <ReportTargetPicker target={target} onChange={setTarget} defaultTarget={defaultTarget} />
      </div>

      {/* 카테고리 3분할 칩 */}
      <div role="group" aria-label="제보 카테고리" className="mt-4 grid grid-cols-3 gap-1 rounded-[18px] bg-fill p-1">
        {REPORT_CATEGORIES.map((c) => {
          const on = c.value === category;
          return (
            <button
              key={c.value}
              type="button"
              aria-pressed={on}
              onClick={() => pickCategory(c.value)}
              className={`flex min-h-[54px] flex-col items-center justify-center rounded-field px-1 text-center transition active:scale-[0.97] ${
                on ? "bg-blue-soft text-blue-deep ring-1 ring-inset ring-blue" : "text-ink-muted"
              }`}
            >
              <span className={`text-[15px] ${on ? "font-bold" : "font-semibold"}`}>{c.label}</span>
              <span className="mt-0.5 text-[11px] font-medium text-ink-faint">{c.hint}</span>
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
            maxLength={REPORT_TOPIC_MAX}
            placeholder="예: 이물, 교상, 접수 방법"
            className="ct-field mt-1 h-12"
          />
        </div>
      )}

      <div className="mt-3">
        <label htmlFor={`${ids}-body`} className="text-[12.5px] font-semibold text-ink-faint">
          {meta.needsTopic ? "자유 서술" : "확인한 내용"}
        </label>
        <textarea
          id={`${ids}-body`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={meta.needsTopic ? 5 : 4}
          maxLength={REPORT_BODY_MAX}
          placeholder={
            meta.needsTopic
              ? "확인한 내용을 자유롭게 적어 주세요."
              : "각 항목 뒤에 확인한 내용을 적어 주세요."
          }
          className="mt-1 w-full resize-none rounded-field bg-fill px-4 py-3 text-[15px] leading-relaxed
                     text-ink transition placeholder:text-ink-faint
                     focus:bg-surface focus:outline-none focus:ring-2 focus:ring-blue"
        />
        <div className="mt-1 flex items-start justify-between gap-3">
          <p className="text-[11.5px] leading-relaxed text-ink-faint">
            이름·연락처처럼 개인을 알 수 있는 정보는 적지 마세요.
          </p>
          <span className="shrink-0 text-[11.5px] text-ink-faint">
            {body.length}/{REPORT_BODY_MAX}
          </span>
        </div>
      </div>

      <div className="mt-3">
        <WaitingStepper value={waiting} onChange={setWaiting} max={REPORT_WAITING_MAX} />
      </div>

      {error && (
        <p role="alert" className="mt-3 text-[13.5px] font-semibold text-limited-ink">
          {error}
        </p>
      )}

      <button type="button" onClick={register} className="ct-primary mt-4">
        지금 등록하기
      </button>

      {submittedTo && !error && (
        <p role="status" className="mt-3 rounded-field bg-confirmed-soft px-3.5 py-2.5 text-[13px] leading-relaxed text-confirmed-ink">
          {otherHospital
            ? `${submittedTo}(으)로 등록했습니다. 이 화면의 피드에는 이 의료기관의 제보만 표시됩니다.`
            : "등록했습니다. 아래 피드 맨 위에 올라갑니다."}
        </p>
      )}
    </section>
  );
}
