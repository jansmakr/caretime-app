"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { DemoNotice } from "@/components/common/DemoNotice";
import { HospitalCard } from "@/components/search/HospitalCard";
import { useSearchSession } from "@/features/search-session/SearchSessionProvider";
import { nextQuestion } from "@/features/search-session/extract";
import { labelForBodyPart, labelForSituation } from "@/features/search-session/types";
import { searchHospitals } from "@/features/hospitals/service";
import { CALL_IS_SUREST, NOT_A_BOOKING } from "@/lib/copy";

export default function SearchPage() {
  const { session, answer, ready } = useSearchSession();
  const [day, setDay] = useState<"today" | "tomorrow">("today");

  const question = session ? nextQuestion(session) : null;
  const results = useMemo(
    () => (session ? searchHospitals(session.facts) : []),
    [session],
  );

  if (!ready) return null;

  if (!session) {
    return (
      <>
        <AppHeader title="진료정보" backHref="/" />
        <main className="px-4 py-10">
          <div className="ct-card p-6 text-center">
            <p className="text-[16px] font-semibold">검색 조건이 없습니다.</p>
            <p className="mt-2 text-[14px] text-ink-muted">
              상황을 입력하면 조건에 맞는 의료기관 정보를 보여드립니다.
            </p>
            <Link href="/" className="ct-primary mt-4">
              상황 입력하기
            </Link>
          </div>
        </main>
      </>
    );
  }

  const { facts } = session;
  const chips = [
    facts.ageYears !== null ? `만 ${facts.ageYears}세` : null,
    facts.sex === "female" ? "여" : facts.sex === "male" ? "남" : null,
    labelForBodyPart(facts.bodyPartId),
    labelForSituation(facts.situationId),
    facts.hemostasis === "stopped" ? "지혈됨" : facts.hemostasis === "bleeding" ? "출혈 중" : null,
    facts.basicTreatment === "done" ? "기본처치 완료" : null,
  ].filter(Boolean) as string[];

  return (
    <>
      <AppHeader title="진료정보" backHref="/" />
      <DemoNotice />

      <div className="sticky top-14 z-30 border-b border-line bg-surface px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          {chips.length > 0 ? (
            chips.map((c) => (
              <span key={c} className="ct-chip bg-blue-soft text-blue">
                {c}
              </span>
            ))
          ) : (
            <span className="text-[13px] text-ink-faint">입력된 조건이 없습니다</span>
          )}
        </div>

        <div className="mt-3 flex gap-2">
          {(["today", "tomorrow"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDay(d)}
              className={`h-9 flex-1 rounded-card text-[14px] ${
                day === d ? "bg-blue-soft font-semibold text-blue" : "border border-line text-ink-muted"
              }`}
            >
              {d === "today" ? "오늘" : "내일 오전"}
            </button>
          ))}
        </div>
      </div>

      <main className="px-4 py-4">
        {question && (
          <section className="ct-card mb-4 border-blue/20 bg-blue-soft p-4">
            <p className="text-[15px] font-semibold">{question.question}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {question.options.map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => answer(opt.apply)}
                  className="rounded-pill border border-blue/30 bg-surface px-3.5 py-2 text-[14px] text-blue"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </section>
        )}

        {day === "tomorrow" ? (
          <div className="ct-card p-6 text-center text-[14px] leading-relaxed text-ink-muted">
            내일 진료 일정 정보는 8단계(공공데이터 연동) 이후에 표시됩니다.
          </div>
        ) : results.length === 0 ? (
          <div className="ct-card p-6 text-center">
            <p className="text-[15px] font-semibold">조건에 맞는 의료기관 정보가 아직 없습니다.</p>
            <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
              부위를 다시 선택하거나, 위급한 상황이라면 119에 연락하세요.
            </p>
            <Link href="/" className="ct-secondary mt-4 w-full">
              조건 다시 입력
            </Link>
          </div>
        ) : (
          <>
            <p className="mb-3 text-[13px] text-ink-faint">
              가까운 순으로 {results.length}곳. 추천이나 순서 조정은 하지 않습니다.
              <br />
              {NOT_A_BOOKING} {CALL_IS_SUREST}
            </p>
            <div className="space-y-3">
              {results.map((m) => (
                <HospitalCard key={m.hospital.id} match={m} />
              ))}
            </div>
          </>
        )}
      </main>
    </>
  );
}
