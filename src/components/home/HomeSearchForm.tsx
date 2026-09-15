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
    <div className="mt-6">
      <label htmlFor="situation" className="sr-only">
        상황 설명
      </label>
      <textarea
        id="situation"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="5살 아이 이마가 찢어졌어요..."
        className="w-full resize-none rounded-card bg-surface p-5 text-[17px] leading-relaxed
                   placeholder:text-ink-faint transition focus:outline-none focus:ring-2 focus:ring-blue"
      />

      <div className="mt-3 grid grid-cols-3 gap-2">
        {QUICK_PICKS.map((pick) => (
          <button
            key={pick.id}
            type="button"
            onClick={() => submitPick(pick)}
            className="h-12 rounded-field bg-surface px-1 text-[14.5px] font-semibold text-ink
                       transition active:scale-[0.97] active:bg-fill"
          >
            {pick.label}
          </button>
        ))}
      </div>

      <button type="button" onClick={submitText} disabled={!text.trim()} className="ct-primary mt-5">
        진료정보 찾기
      </button>

      <Link
        href="/live"
        className="mx-auto mt-4 flex w-fit items-center gap-1.5 rounded-pill px-3 py-2 text-[14px] font-medium text-ink-muted active:bg-surface"
      >
        <span className="relative flex h-2 w-2" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-confirmed opacity-50" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-confirmed" />
        </span>
        실시간 진료상황 보기
      </Link>

      <p className="mt-8 text-center text-[12.5px] leading-relaxed text-ink-faint">
        {NOT_A_BOOKING}
        <br />
        {CALL_IS_SUREST}
      </p>
    </div>
  );
}
