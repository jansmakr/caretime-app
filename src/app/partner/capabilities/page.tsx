"use client";

import { PartnerLoading } from "@/components/partner/PartnerLoading";
import { ageConditionLabel, capabilityLabel } from "@/features/hospitals/service";
import type { HospitalCapability } from "@/features/hospitals/types";
import { usePartner } from "@/features/partner/PartnerProvider";

/**
 * 등록된 진료기능. 보호자 화면과 같은 데이터를 그대로 보여준다.
 * 직접입력(pending) 항목은 표준 매핑 전이라 검색 매칭에 쓰이지 않는다는 점을 병원에 알려준다.
 * 추가·수정은 운영자 검토를 거친다. 병원 계정에는 hospital_capabilities 쓰기 권한이 없다.
 */

const MAPPING_TAG: Record<HospitalCapability["mappingStatus"], { text: string; className: string } | null> = {
  standard: null,
  mapped: { text: "직접입력 · 표준 연결됨", className: "bg-blue-soft text-blue" },
  pending: { text: "직접입력 · 검토 대기", className: "bg-[#FDF2E4] text-caution" },
};

export default function PartnerCapabilitiesPage() {
  const { hospital } = usePartner();
  if (!hospital) return <PartnerLoading />;

  const caps = hospital.capabilities;
  const pendingCount = caps.filter((c) => c.mappingStatus === "pending").length;

  return (
    <main className="space-y-3 px-4 py-4">
      <section className="ct-card">
        <div className="border-b border-line px-4 py-3.5">
          <h2 className="text-[16px] font-semibold">등록된 진료기능 {caps.length}개</h2>
          {pendingCount > 0 && (
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
              검토 대기 {pendingCount}건은 표준 항목에 연결되기 전까지 보호자 검색 결과에 매칭되지
              않고, 병원 상세 화면에만 표시됩니다.
            </p>
          )}
        </div>
        <ul className="divide-y divide-line">
          {caps.map((cap, i) => {
            const tag = MAPPING_TAG[cap.mappingStatus];
            return (
              <li key={i} className="flex items-start justify-between gap-3 px-4 py-3.5">
                <div className="min-w-0">
                  <p className="text-[15px] font-medium">{capabilityLabel(cap)}</p>
                  {tag && (
                    <span
                      className={`mt-1.5 inline-flex rounded-pill px-2 py-0.5 text-[12px] font-semibold ${tag.className}`}
                    >
                      {tag.text}
                    </span>
                  )}
                </div>
                <span className="shrink-0 text-[14px] text-ink-muted">{ageConditionLabel(cap)}</span>
              </li>
            );
          })}
          {caps.length === 0 && (
            <li className="px-4 py-6 text-center text-[14px] text-ink-muted">
              등록된 진료기능이 없습니다.
            </li>
          )}
        </ul>
      </section>

      <p className="px-1 text-[13px] leading-relaxed text-ink-faint">
        진료기능 추가·수정과 연령조건 변경은 운영팀 확인 후 반영됩니다.
      </p>
    </main>
  );
}
