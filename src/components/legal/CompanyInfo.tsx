import { COMPANY } from "@/features/legal/company";

/**
 * 사업자 정보. **더보기(/more) 안에만 둔다.**
 *
 * 전에는 모든 보호자 화면 맨 아래에 있었다. 네 줄짜리 주소·등록번호가 홈의 아래
 * 절반을 차지했는데, 밤에 아이를 안고 들어온 사람에게 그 네 줄은 읽을 것이 아니다
 * (원칙 4·10).
 *
 * ── 첫 화면에서 빼도 되는가 ─────────────────────────────────
 * 전자상거래법의 초기화면 표시 의무는 **재화·용역을 파는 곳**에 걸린다. CareTime 은
 * 팔지 않는다. 그래서 사업자 정보는 찾을 수 있는 곳에 있으면 된다.
 *
 * 반대로 **개인정보 처리방침 링크는 첫 화면에 남긴다** — 개인정보보호법 제30조 2항의
 * "쉽게 확인할 수 있도록"이 거기에 걸린다(components/legal/LegalFooter).
 * 두 의무를 같은 것으로 묶어 함께 옮기면 한쪽이 깨진다.
 *
 * 값은 features/legal/company 한 곳에서 읽는다. 약관·방침 본문도 같은 값을 토큰
 * (`{{상호}}` 등)으로 읽으므로 주소나 보호책임자가 바뀌면 한 곳만 고치면 된다.
 */
export function CompanyInfo() {
  return (
    <section className="ct-card p-5">
      <h2 className="ct-section-title">사업자 정보</h2>
      {/*
        줄을 나눠 적는다 — 한 줄로 이으면 좁은 화면에서 끊어 읽기 어렵다.
        전화번호를 적지 않는다. 운영 문의는 이메일로 받는다(응급은 119 다).

        dl + sr-only 라벨로 짜다가 되돌렸다. 라벨을 숨긴 채 값 앞에 또 적으니
        화면에는 한 번, 스크린리더에는 두 번 읽혔다. 띄워서 읽고 찾았다.
      */}
      <address className="mt-2 not-italic text-[14px] leading-relaxed text-ink-muted">
        <span className="font-semibold text-ink">{COMPANY.name}</span>
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
    </section>
  );
}
