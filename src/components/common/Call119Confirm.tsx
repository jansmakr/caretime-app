"use client";

/**
 * "119에 전화할까요?" 확인 시트. **119 로 가는 버튼은 전부 이것을 거친다.**
 *
 * 머리띠의 119 버튼(EmergencyCallout)에만 있던 확인 단계를 떼어 냈다(2026-10-18).
 * 케타 말풍선·진단 확인 창에도 119 버튼이 생겼는데, 그쪽만 바로 걸리면 같은 119 가
 * 자리에 따라 다르게 동작한다. 손이 떨리는 사람에게 그 차이는 오발신이다.
 *
 * 다른 시트 위에 열릴 수 있다(진단 확인 창). 그래서 z 를 한 칸 높게 둔다.
 */
export function Call119Confirm({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label="119 전화 확인"
      onClick={onClose}
    >
      <div
        className="w-full max-w-app rounded-t-[28px] bg-surface px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" aria-hidden />
        <p className="text-[20px] font-bold">119에 전화할까요?</p>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">
          응급 상황이라고 판단되면 지금 바로 연락하세요. CareTime은 응급 여부를 판단하지
          않습니다.
        </p>
        <a href="tel:119" className="ct-primary mt-5 bg-limited active:bg-limited-ink">
          119 전화 걸기
        </a>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 flex h-12 w-full items-center justify-center rounded-field text-[15px] font-semibold text-ink-muted active:bg-fill"
        >
          닫기
        </button>
      </div>
    </div>
  );
}
