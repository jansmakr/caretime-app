"use client";

import { LiveTalkBanner } from "@/components/home/LiveTalkBanner";
import { useDiscovery } from "@/features/discovery/DiscoveryProvider";
import { categoryLabelOf } from "@/features/discovery/types";

/**
 * 배너에 선택 조건을 이어 주는 얇은 래퍼.
 *
 * 넘기는 것은 **지역과 일반 카테고리뿐**이다.
 * 나이·소아 여부·방문 목적·후속 목적·좌표는 URL 로 나가지 않는다 —
 * `chatHref` 가 받는 키 자체에 그 값들이 없다.
 */
export function HomeLiveTalkBanner() {
  const { conditions } = useDiscovery();
  return (
    <LiveTalkBanner
      sido={conditions.region.sido}
      sigungu={conditions.region.sigungu}
      category={conditions.category}
      categoryLabel={categoryLabelOf(conditions.category)}
    />
  );
}
