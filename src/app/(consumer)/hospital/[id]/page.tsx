import { notFound } from "next/navigation";
import { HospitalDetail } from "@/components/hospital/HospitalDetail";
import { fetchHospitalView } from "@/features/hospitals/repository";
import { getHospital } from "@/features/hospitals/service";
import { showHospitalDirectory } from "@/lib/demoContent";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * 병원 상세 (서버). 요청마다 최신 값을 읽어 첫 화면을 그리고, 이후 갱신은 Realtime 이 맡는다.
 * Supabase 설정이 없으면 Mock 으로 동작하고 구독하지 않는다.
 *
 * 현장톡은 이 화면에 없다. 1차에는 글을 병원이 아니라 구에 걸고, 방은 전국 하나다.
 */
export default async function HospitalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // 1차에는 닫혀 있다. (lib/demoContent.showHospitalDirectory)
  if (!showHospitalDirectory) notFound();

  const { id } = await params;
  const now = new Date();
  const hospital = isSupabaseConfigured
    ? await fetchHospitalView(createServerSupabase(), id, now)
    : getHospital(id);
  if (!hospital) notFound();

  return (
    <HospitalDetail
      initial={hospital}
      renderedAt={now.toISOString()}
      realtime={isSupabaseConfigured}
    />
  );
}
