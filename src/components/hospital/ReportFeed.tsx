"use client";

import { LiveInfoNotice } from "@/components/common/LiveInfoNotice";
import { SourceBadge } from "@/components/common/SourceBadge";
import type { HospitalView } from "@/features/hospitals/types";
import { formatReportAgo } from "@/features/reports/service";
import { categoryLabel } from "@/features/reports/templates";
import type { UserReport } from "@/features/reports/types";
import { useReportFeed } from "@/features/reports/useReportFeed";

/**
 * 보호자 실시간 제보 피드.
 *
 * 병원 직접확인 카드와 같은 카드 안에 넣지 않는다. 출처가 다른 정보를 한 면에 얹으면
 * 보호자는 둘을 구분하지 못한다. (기획안 12항) 모든 항목에 SourceBadge(사용자 공유 · 미확인)가 붙는다.
 *
 * now 는 HospitalDetail 이 들고 있는 값을 그대로 받는다 — 화면 안에서 '몇 분 전'의
 * 기준 시각이 두 개가 되지 않게 한다.
 */
export function ReportFeed({
  hospital,
  renderedAt,
  now,
}: {
  hospital: HospitalView;
  renderedAt: string;
  now: Date;
}) {
  const reports = useReportFeed(hospital, renderedAt);

  return (
    <section className="ct-card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="ct-section-title">실시간 제보</h2>
        <span className="shrink-0 text-[13px] font-semibold text-ink-faint">{reports.length}건</span>
      </div>

      {/* 피드 최상단 고정 고지. 접히지 않는다. */}
      <div className="mt-3">
        <LiveInfoNotice />
      </div>

      <ul className="mt-3 divide-y divide-fill">
        {reports.map((report) => (
          <li key={report.id} className="py-3.5 first:pt-1">
            <ReportItem report={report} now={now} />
          </li>
        ))}
      </ul>

      {reports.length === 0 && (
        <p className="mt-3 text-[14.5px] leading-relaxed text-ink-muted">
          아직 이 의료기관의 제보가 없습니다. 방문하셨다면 아래에서 현장 상황을 남겨 주세요.
        </p>
      )}

      <p className="mt-3 text-[12px] leading-relaxed text-ink-faint">
        등록한 제보는 지금 이 브라우저에만 보관됩니다. 6단계(Realtime Feed)에서 실제 저장·공유로
        연결됩니다.
      </p>
    </section>
  );
}

function ReportItem({ report, now }: { report: UserReport; now: Date }) {
  return (
    <article>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="ct-chip bg-blue-soft text-blue-deep">{categoryLabel(report.category)}</span>
        {report.topic && <span className="ct-chip">{report.topic}</span>}
        {report.waitingHeadcount !== null && (
          <span className="ct-chip">대기 {report.waitingHeadcount}명</span>
        )}
        <span className="ml-auto shrink-0 text-[12.5px] font-medium text-ink-faint">
          {formatReportAgo(report.createdAt, now)}
        </span>
      </div>

      {/* 보호자가 줄 단위로 적은 템플릿을 그대로 보여준다. */}
      <p className="mt-2 whitespace-pre-line text-[14.5px] leading-relaxed text-ink">{report.body}</p>

      <div className="mt-2">
        <SourceBadge source={report.source} />
      </div>

      {report.target.kind === "manual" && (
        <p className="mt-1.5 text-[12px] text-ink-faint">
          목록에 없는 의료기관으로 직접 입력된 제보입니다.
        </p>
      )}
    </article>
  );
}
