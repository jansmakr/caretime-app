"use client";

import { usePartner } from "@/features/partner/PartnerProvider";

/**
 * 소속 기관 선택.
 *
 * 겸직 직원(여러 기관 소속)에게만 보인다. 한 곳이면 이 화면을 거치지 않는다.
 * 첫 행을 임의로 골라 진입하지 않는 이유: 잘못된 기관의 접수 상태를 바꾸는 사고가
 * 조용히 일어난다. 어느 기관인지 본인이 확인하고 들어가게 한다.
 *
 * 목록은 RLS("own membership")가 본인 행만 돌려준 결과다. 타인의 소속은 들어오지 않는다.
 */
export function HospitalChooser() {
  const { memberships, selectHospital, signOut } = usePartner();

  return (
    <main className="px-4 pt-8">
      <section className="ct-card p-6">
        <h2 className="text-[21px] font-extrabold">어느 의료기관으로 들어갈까요?</h2>
        <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-muted">
          소속된 의료기관이 {memberships.length}곳입니다. 지금 상태를 입력할 곳을 골라 주세요.
        </p>

        <ul className="mt-5 space-y-2">
          {memberships.map((m) => (
            <li key={m.hospitalId}>
              <button
                type="button"
                onClick={() => selectHospital(m.hospitalId)}
                className="flex min-h-[56px] w-full items-center justify-between gap-3 rounded-field bg-fill px-4 py-3 text-left transition active:scale-[0.99] active:brightness-95"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[16px] font-bold">{m.hospitalName}</span>
                  <span className="mt-0.5 block text-[12.5px] text-ink-faint">
                    {m.role === "owner" ? "대표 계정" : "직원 계정"}
                  </span>
                </span>
                <span aria-hidden className="shrink-0 text-[18px] text-ink-faint">
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => void signOut()}
          className="mx-auto mt-5 flex w-fit rounded-pill px-3 py-2 text-[13.5px] font-semibold text-ink-faint active:bg-fill"
        >
          다른 계정으로 로그인
        </button>
      </section>
    </main>
  );
}
