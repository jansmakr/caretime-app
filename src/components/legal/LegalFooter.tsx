import Link from "next/link";
import { COMPANY } from "@/features/legal/company";
import { LEGAL_DOC_PATH } from "@/features/legal/documents";
import { areLegalDocsReadable, isPolicyInForce } from "@/features/legal/version";

/**
 * 보호자 화면 맨 아래.
 *
 * 두 묶음이고 켜지는 조건이 다르다.
 *
 *   ① 사업자 정보 — **항상 보인다.** 표기 의무는 약관이 있는지와 무관하다.
 *      값은 features/legal/company 한 곳에서 읽는다. 문서 본문도 같은 값을 토큰으로
 *      읽으므로 주소나 보호책임자가 바뀌면 한 곳만 고치면 된다.
 *
 *   ② 약관·방침 **링크** — 본문이 들어오면 보인다. 시행 전에도 보여 준다(사전 고지).
 *
 *   ③ **동의 문구** — 시행일이 지난 뒤에만. 시행 전에 "동의하는 것으로 봅니다"를
 *      적으면 아직 효력이 없는 문서에 동의시킨 셈이 된다. 그 기간에는 쓰기도
 *      닫혀 있다(lib/demoContent.areWritesOpen).
 *
 * 서버 컴포넌트다. 파일을 읽으므로 클라이언트에서 부르지 않는다.
 */
export function LegalFooter() {
  const ready = areLegalDocsReadable();
  const inForce = isPolicyInForce();

  return (
    <footer className="px-5 pb-5 pt-2">
      {ready && (
        <p className="text-[12.5px] leading-relaxed text-ink-faint">
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
      )}

      {/*
        사업자 정보. 줄을 나눠 적는다 — 한 줄로 이으면 좁은 화면에서 끊어 읽기 어렵다.
        전화번호를 적지 않는다. 운영 문의는 이메일로 받는다(응급은 119 다).

        dl + sr-only 라벨로 짜다가 되돌렸다. 라벨을 숨긴 채 값 앞에 또 적으니
        화면에는 한 번, 스크린리더에는 두 번 읽혔다. 띄워서 읽고 찾았다.
      */}
      <address className={`not-italic text-[12px] leading-relaxed text-ink-faint ${ready ? "mt-3" : ""}`}>
        <span className="font-semibold text-ink-muted">{COMPANY.name}</span>
        {` 대표 ${COMPANY.ceo}`}
        <br />
        {`사업자등록번호 ${COMPANY.registrationNumber}`}
        <br />
        {COMPANY.address}
        <br />
        {`개인정보 보호책임자 ${COMPANY.privacyOfficer} · `}
        <a href={`mailto:${COMPANY.email}`} className="underline">
          {COMPANY.email}
        </a>
      </address>
    </footer>
  );
}
