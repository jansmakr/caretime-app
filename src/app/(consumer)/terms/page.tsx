import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "이용약관 · CareTime" };

/** 본문은 docs/legal/terms.md 다. 파일을 읽으므로 정적 생성하지 않는다. */
export const dynamic = "force-dynamic";

export default function TermsPage() {
  return <LegalPage id="terms" fallbackTitle="이용약관" />;
}
