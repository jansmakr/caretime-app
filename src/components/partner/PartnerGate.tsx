"use client";

import { useState } from "react";
import { PartnerLoading } from "@/components/partner/PartnerLoading";
import { usePartner } from "@/features/partner/PartnerProvider";

/**
 * 파트너 화면 진입 조건.
 * 로그인하지 않았거나 병원에 연결되지 않은 계정에는 입력 화면 자체를 그리지 않는다.
 * 실제 차단은 DB(RLS)가 하고, 이 컴포넌트는 헛입력을 막는 안내 역할이다.
 */
export function PartnerGate({ children }: { children: React.ReactNode }) {
  const { phase, notice, dismissNotice, connection, source, signOut } = usePartner();

  if (phase === "loading") return <PartnerLoading />;
  if (phase === "signed_out") return <PartnerSignIn />;

  if (phase === "no_membership" || phase === "error") {
    return (
      <main className="px-4 py-8">
        <div className="ct-card p-6 text-center">
          <p className="text-[16px] font-semibold">
            {phase === "no_membership" ? "연결된 의료기관이 없는 계정입니다." : "파트너 화면을 열 수 없습니다."}
          </p>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
            {phase === "no_membership"
              ? "CareTime 운영팀이 계정을 의료기관에 연결한 뒤에 사용할 수 있습니다."
              : (notice ?? "잠시 후 다시 시도해 주세요.")}
          </p>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => window.location.reload()} className="ct-secondary">
              다시 시도
            </button>
            <button type="button" onClick={() => void signOut()} className="ct-secondary">
              로그아웃
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <>
      {source === "supabase" && connection === "offline" && (
        <p className="border-b border-line bg-[#FDF2E4] px-4 py-2 text-[13px] text-[#9C5C13]">
          실시간 연결이 끊겼습니다. 다른 기기에서 바꾼 값이 바로 보이지 않을 수 있습니다. 재연결되면 자동으로
          다시 불러옵니다.
        </p>
      )}
      {notice && (
        <div role="alert" className="flex items-start gap-3 border-b border-line bg-[#FBEBEA] px-4 py-2.5">
          <p className="flex-1 text-[13px] leading-relaxed text-[#93302B]">{notice}</p>
          <button type="button" onClick={dismissNotice} className="text-[13px] font-medium text-[#93302B]">
            닫기
          </button>
        </div>
      )}
      {children}
    </>
  );
}

function PartnerSignIn() {
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
    <main className="px-4 py-8">
      <form onSubmit={submit} className="ct-card p-5">
        <h2 className="text-[18px] font-semibold">의료기관 파트너 로그인</h2>
        <p className="mt-1.5 text-[14px] leading-relaxed text-ink-muted">
          계정은 CareTime 운영팀이 의료기관별로 발급합니다.
        </p>

        <label className="mt-4 block">
          <span className="text-[13px] text-ink-muted">이메일</span>
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 h-[48px] w-full rounded-card border border-line bg-surface px-3 text-[16px]"
          />
        </label>
        <label className="mt-3 block">
          <span className="text-[13px] text-ink-muted">비밀번호</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 h-[48px] w-full rounded-card border border-line bg-surface px-3 text-[16px]"
          />
        </label>

        {error && (
          <p role="alert" className="mt-3 text-[14px] text-limited">
            {error}
          </p>
        )}

        <button type="submit" disabled={pending} className="ct-primary mt-4">
          {pending ? "확인 중…" : "로그인"}
        </button>
      </form>
    </main>
  );
}
