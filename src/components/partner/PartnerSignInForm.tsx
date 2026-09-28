"use client";

import Link from "next/link";
import { useState } from "react";
import { usePartner } from "@/features/partner/PartnerProvider";

/**
 * 병원 관리자 로그인 폼.
 *
 * 가입 화면을 만들지 않는다. 계정은 운영자가 콘솔에서 수동 발급한다(README 2단계).
 * 비밀번호 재설정도 여기 두지 않는다 — 운영 창구를 거치게 한다.
 *
 * 로그인 성공 뒤의 이동은 PartnerGate 가 맡는다. 여기서 router.push 하지 않는다.
 * 소속이 여러 곳이면 선택 화면, 한 곳이면 대시보드, 없으면 안내로 갈라지기 때문이다.
 */
export function PartnerSignInForm() {
  const { signIn } = usePartner();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(await signIn(email.trim(), password));
    setPending(false);
  };

  return (
    <main className="px-4 pt-8">
      <form onSubmit={submit} className="ct-card p-6">
        <h2 className="text-[22px] font-extrabold">의료기관 파트너 로그인</h2>
        <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-faint">
          계정은 CareTime 운영팀이 의료기관별로 발급합니다.
        </p>

        <label className="mt-6 block">
          <span className="text-[13px] font-medium text-ink-faint">이메일</span>
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="ct-field mt-1.5 h-14"
          />
        </label>
        <label className="mt-3 block">
          <span className="text-[13px] font-medium text-ink-faint">비밀번호</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="ct-field mt-1.5 h-14"
          />
        </label>

        {error && (
          <p role="alert" className="mt-3 text-[14px] font-medium text-limited">
            {error}
          </p>
        )}

        <button type="submit" disabled={pending} className="ct-primary mt-6">
          {pending ? "확인 중…" : "로그인"}
        </button>
      </form>

      <Link
        href="/partner"
        className="mx-auto mt-4 flex w-fit items-center gap-1.5 rounded-pill px-3 py-2 text-[13.5px] font-semibold text-ink-faint active:bg-surface"
      >
        ‹ 계정이 없나요? 무료 참여 안내
      </Link>
    </main>
  );
}
