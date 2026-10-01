import { notFound } from "next/navigation";
import { HospitalDetail } from "@/components/hospital/HospitalDetail";
import { fetchFieldReports } from "@/features/chat/repository";
import { fetchHospitalView } from "@/features/hospitals/repository";
import { getHospital } from "@/features/hospitals/service";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * 병원 상세 (서버). 요청마다 최신 값을 읽어 첫 화면을 그리고, 이후 갱신은 Realtime 이 맡는다.
 * Supabase 설정이 없으면 Mock 으로 동작하고 구독하지 않는다.
 *
 * 현장톡 글도 여기서 읽어 넘긴다. 브라우저에서만 읽으면 처음 그려지는 것은 언제나
 * 빈 목록이고, 글이 적은 출시 직후에 그 한 순간이 "아무 말도 없는 병원"으로 읽힌다.
 * 글 조회가 실패해도 화면은 연다 — 목록이 비는 것이 화면 전체가 막히는 것보다 낫다.
 */
export default async function HospitalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const now = new Date();
  const hospital = isSupabaseConfigured
    ? await fetchHospitalView(createServerSupabase(), id, now)
    : getHospital(id);
  if (!hospital) notFound();

  const talk = isSupabaseConfigured
    ? await fetchFieldReports(createServerSupabase(), { hospitalId: id }).then(
        (messages) => ({ messages, failed: false }),
        () => ({ messages: [], failed: true }),
      )
    : { messages: [], failed: false };

  return (
    <HospitalDetail
      initial={hospital}
      renderedAt={now.toISOString()}
      realtime={isSupabaseConfigured}
      initialMessages={talk.messages}
      messagesLoadFailed={talk.failed}
    />
  );
}
