import type { InfoSource } from "@/features/hospitals/types";

/**
 * CareTime 에서 가장 중요한 컴포넌트.
 *
 * 정보 출처 4종을 구분하지 못하면 이 서비스는 존재 이유가 없다. (기획안 12항)
 * 구분을 색에만 맡기지 않는다 — 색각이상 사용자와 야간 저조도 화면을 고려해
 * ①점 색상 ②점 모양(채움/테두리/점선) ③텍스트 라벨 세 가지를 동시에 쓴다.
 */

const STYLES: Record<
  InfoSource,
  { label: string; dot: string; text: string }
> = {
  hospital: {
    label: "의료기관 직접확인",
    dot: "bg-confirmed",
    text: "text-confirmed",
  },
  public: {
    label: "공식 공공정보",
    dot: "bg-blue",
    text: "text-blue",
  },
  operator: {
    label: "운영자 전화확인",
    dot: "bg-caution",
    text: "text-caution",
  },
  user: {
    label: "사용자 공유 · 미확인",
    // 사용자 공유만 '비어 있는 점'이다. 확인되지 않았다는 뜻을 모양으로 전달한다.
    dot: "border border-dashed border-unverified bg-transparent",
    text: "text-unverified-ink",
  },
};

export function SourceBadge({
  source,
  verifiedAgo,
}: {
  source: InfoSource;
  verifiedAgo?: string;
}) {
  const s = STYLES[source];
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px]">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} aria-hidden />
      <span className={`font-semibold ${s.text}`}>{s.label}</span>
      {verifiedAgo && <span className="text-ink-faint">· {verifiedAgo}</span>}
    </span>
  );
}
