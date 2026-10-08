import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "개인정보 처리방침 · CareTime" };

/** 본문은 docs/legal/privacy.md 다. 파일을 읽으므로 정적 생성하지 않는다. */
export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  return <LegalPage id="privacy" fallbackTitle="개인정보 처리방침" />;
}
