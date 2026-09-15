/** 상태를 브라우저에서 만드는 동안의 자리. 시각이 들어간 값을 서버에서 렌더하지 않는다. */
export function PartnerLoading() {
  return (
    <main className="space-y-3 px-4 py-4" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="ct-card h-32 animate-pulse bg-surface" />
      ))}
    </main>
  );
}
