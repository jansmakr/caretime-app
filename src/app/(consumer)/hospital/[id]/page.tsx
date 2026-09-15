import { notFound } from "next/navigation";
import { HospitalDetail } from "@/components/hospital/HospitalDetail";
import { fetchHospitalView } from "@/features/hospitals/repository";
import { getHospital } from "@/features/hospitals/service";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * 병원 상세 (서버). 요청마다 최신 값을 읽어 첫 화면을 그리고, 이후 갱신은 Realtime 이 맡는다.
 * Supabase 설정이 없으면 Mock 으로 동작하고 구독하지 않는다.
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

  return (
    <HospitalDetail initial={hospital} renderedAt={now.toISOString()} realtime={isSupabaseConfigured} />
  );
}
