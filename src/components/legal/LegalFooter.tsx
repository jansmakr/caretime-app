import Link from "next/link";
import { LEGAL_DOC_PATH } from "@/features/legal/documents";
import { areLegalDocsReadable, isPolicyInForce } from "@/features/legal/version";

/**
 * 약관·방침 링크 한 줄. **홈에만 붙인다.**
 *
 * ── 왜 홈에는 남기는가 ──────────────────────────────────────
 * 개인정보보호법 제30조 2항은 처리방침을 "정보주체가 **쉽게 확인할 수 있도록**"
 * 공개하라고 한다. 실무 기준은 **첫 화면에 링크가 보이는 것**이다. 더보기 메뉴
 * 안으로만 옮기면 메뉴를 열고 또 들어가게 되어 그 기준에서 벗어난다.
 *
 * 그래서 홈에는 남기고, 다른 화면에서는 뺐다 — 머리띠의 "더보기"가 길을 준다.
 *
 * ── 왜 14px 인가 ────────────────────────────────────────────
 * 12.5px 이었다. 원칙 2 의 하한 아래이고, 법이 "쉽게 확인"이라고 할 때 읽히지
 * 않는 크기면 취지가 살지 않는다. 사업자 정보 4줄이 /more 로 빠져 자리가 생겼다.
 *
 * ── 세 가지 상태 ────────────────────────────────────────────
 *   · 본문이 없으면 아무것도 그리지 않는다. 빈 링크를 만들지 않는다.
 *   · 시행 전이면 "미리 읽을 수 있습니다 · 아직 효력이 없습니다".
 *   · 시행 뒤에만 "동의하는 것으로 봅니다" — 효력 없는 문서에 동의시키지 않는다.
 *
 * 서버 컴포넌트다. 파일을 읽으므로 클라이언트에서 부르지 않는다.
 */
export function LegalFooter() {
  const ready = areLegalDocsReadable();
  const inForce = isPolicyInForce();

  if (!ready) return null;

  return (
    <footer className="px-5 pb-5 pt-2">
      <p className="text-[14px] leading-relaxed text-ink-faint">
          {inForce ? "글을 남기면 " : "시행 전입니다. "}
          <Link href={LEGAL_DOC_PATH.terms} className="font-semibold text-ink-muted underline">
            이용약관
          </Link>
          {" 과 "}
          <Link href={LEGAL_DOC_PATH.privacy} className="font-semibold text-ink-muted underline">
            개인정보 처리방침
          </Link>
          {inForce
            ? "에 동의하는 것으로 봅니다. 로그인 없이 이용하며 이름·연락처는 저장하지 않습니다."
            : " 을 미리 읽을 수 있습니다. 아직 효력이 없습니다."}
      </p>
    </footer>
  );
}
