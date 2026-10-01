import Link from "next/link";
import { LEGAL_DOC_PATH } from "@/features/legal/documents";
import { areLegalDocsReady } from "@/features/legal/version";

/**
 * 보호자 화면 맨 아래 한 줄.
 *
 * **문서가 준비되기 전에는 아무것도 그리지 않는다.** 빈 방침으로 가는 링크를 만들지
 * 않고, 동의했다고 적지도 않는다. 준비 여부는 파일 머리글의 시행일로 판정한다
 * (features/legal/documents). 그래서 본문을 넣는 것만으로 이 줄이 생긴다 —
 * 코드를 또 고칠 필요가 없다.
 *
 * 서버 컴포넌트다. 파일을 읽으므로 클라이언트에서 부르지 않는다.
 * /more 에는 이 줄을 쓰지 않는다 — 그쪽은 준비 중이라는 사실까지 적어 둔다.
 */
export function LegalFooter() {
  if (!areLegalDocsReady()) return null;

  return (
    <p className="px-5 pb-4 text-[12.5px] leading-relaxed text-ink-faint">
      글을 남기면{" "}
      <Link href={LEGAL_DOC_PATH.terms} className="font-semibold text-ink-muted underline">
        이용약관
      </Link>
      {" 과 "}
      <Link href={LEGAL_DOC_PATH.privacy} className="font-semibold text-ink-muted underline">
        개인정보 처리방침
      </Link>
      에 동의하는 것으로 봅니다. 로그인 없이 이용하며 이름·연락처는 저장하지 않습니다.
    </p>
  );
}
