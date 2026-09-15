"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSearchSession } from "@/features/search-session/SearchSessionProvider";
import { QUICK_PICKS } from "@/features/search-session/types";
import { CALL_IS_SUREST, NOT_A_BOOKING } from "@/lib/copy";

/**
 * 홈은 설명서 없이 쓸 수 있어야 한다. (기획안 6항)
 * Primary CTA 는 '진료정보 찾기' 하나뿐이고, 실시간 진입은 작은 보조 링크로 둔다.
 *
 * 검색 결과로 넘어갈 때 입력 내용을 query string 에 싣지 않는다.
 * 세션은 SearchSessionProvider 가 들고 있고 /search 는 빈 경로다.
 */
export function HomeSearchForm() {
  const [text, setText] = useState("");
  const { start, startFromPick } = useSearchSession();
  const router = useRouter();

  function submitText() {
    if (!text.trim()) return;
    start(text);
    router.push("/search");
  }

  function submitPick(pick: (typeof QUICK_PICKS)[number]) {
    startFromPick({
      bodyPartId: pick.bodyPartId,
      situationId: "situationId" in pick ? pick.situationId : null,
    });
    router.push("/search");
  }

  return (
    <div className="mt-5">
      <label htmlFor="situation" className="sr-only">
        상황 설명
      </label>
      <textarea
        id="situation"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="5살 아이 이마가 찢어졌어요..."
        className="w-full resize-none rounded-card border border-line bg-surface p-4
                   text-[16px] leading-relaxed placeholder:text-ink-faint
                   focus:border-blue focus:outline-none"
      />

      <div className="mt-3 grid grid-cols-2 gap-2">
        {QUICK_PICKS.map((pick) => (
          <button
            key={pick.id}
            type="button"
            onClick={() => submitPick(pick)}
            className="h-[46px] rounded-card border border-line bg-surface text-[15px]
                       transition-colors active:bg-canvas"
          >
            {pick.label}
          </button>
        ))}
      </div>

      <button type="button" onClick={submitText} disabled={!text.trim()} className="ct-primary mt-4">
        진료정보 찾기
      </button>

      <Link
        href="/live"
        className="mt-4 flex items-center justify-center gap-1.5 py-2 text-[14px] text-ink-muted"
      >
        <span className="h-[6px] w-[6px] rounded-full bg-confirmed" aria-hidden />
        실시간 진료상황 보기
      </Link>

      <p className="mt-6 text-center text-[13px] leading-relaxed text-ink-faint">
        {NOT_A_BOOKING}
        <br />
        {CALL_IS_SUREST}
      </p>
    </div>
  );
}
