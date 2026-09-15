"use client";

import { ChoiceGroup, type Choice } from "@/components/partner/ChoiceGroup";
import { VerifiedLine } from "@/components/partner/VerifiedLine";
import { CONTACT_TEXT } from "@/features/hospitals/labels";
import type { ContactStatusCode } from "@/features/hospitals/types";
import { usePartner } from "@/features/partner/PartnerProvider";
import type { PartnerState } from "@/features/partner/types";

const CHOICES: Choice<ContactStatusCode>[] = [
  { value: "available", label: "가능", tone: "confirmed" },
  { value: "busy", label: "통화량 많음", tone: "caution" },
  { value: "difficult", label: "현재 어려움", tone: "limited" },
];

export function ContactStatusCard({ state, now }: { state: PartnerState; now: Date }) {
  const { setContactStatus } = usePartner();
  const contact = state.contact;

  return (
    <section className="ct-card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="ct-section-title">전화 상태</h2>
        <VerifiedLine verifiedAt={contact.verifiedAt} now={now} />
      </div>

      <ChoiceGroup
        label="전화 상태"
        choices={CHOICES}
        selected={contact.status}
        onSelect={setContactStatus}
      />

      <p className="mt-3 text-[13px] leading-relaxed text-ink-faint">
        보호자 화면: {CONTACT_TEXT[contact.status]}
        {contact.status === "difficult" &&
          " · 보호자에게 전화 확인 대신 화면 재확인을 먼저 안내합니다."}
      </p>
    </section>
  );
}
