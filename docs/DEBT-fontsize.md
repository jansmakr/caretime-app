# 미정리 부채 — 글자 크기 (원칙 2)

기준 시각: 2026-09-29. 근거: [UI-PRINCIPLES.md](UI-PRINCIPLES.md) 원칙 2.

> 본문 16px, 핵심 정보 18px 이상. 13px 이하를 새로 만들지 마라.

이 문서는 **그 턴을 시작할 때 저장소를 다시 훑지 않게 하려고** 남긴 목록이다.
숫자만 남기지 않는 이유는, 일괄 치환으로 끝나는 일이 아니고 파일마다
줄바꿈·카드 높이를 눈으로 확인해야 하기 때문이다(원칙 4 와 충돌 가능).

## 규모

| 크기 | 곳 |
|---|---|
| `text-[10px]` | 2 |
| `text-[11px]` | 5 |
| `text-[12px]` | 22 |
| `text-xs` (=12px) | 2 |
| `text-[13px]` | 52 |
| **합계** | **83** |

`text-sm`(14px)은 0곳이다 — 이 저장소는 Tailwind 기본 단계 대신 px 를 직접 쓴다.
그래서 치환 대상이 클래스 이름 하나로 모이지 않는다.

## 먼저 볼 것 — 공용 컴포넌트

한 곳을 고치면 여러 화면이 같이 움직인다. 여기서 시작하면 파급을 한 번에 본다.

| 파일 | 크기 | 줄 |
|---|---|---|
| `src/components/common/LiveInfoNotice.tsx` | `text-[13px]` | 17 |
| `src/components/common/PartnerCta.tsx` | `text-[10px]` | 19 |
| `src/components/common/PartnerCta.tsx` | `text-xs (12px)` | 16 |
| `src/components/common/SourceBadge.tsx` | `text-[13px]` | 47 |
| `src/components/common/StatusPill.tsx` | `text-[13px]` | 13 |
| `src/components/layout/BottomNav.tsx` | `text-[11px]` | 64 |

## 전체 목록

| 파일 | 크기 | 줄 | 곳 |
|---|---|---|---|
| `src/app/(consumer)/more/page.tsx` | `text-[12px]` | 19 | 1 |
| `src/app/(consumer)/search/page.tsx` | `text-[13px]` | 75 | 1 |
| `src/app/partner/capabilities/page.tsx` | `text-[12px]` | 48 | 1 |
| `src/app/partner/capabilities/page.tsx` | `text-[13px]` | 33, 66 | 2 |
| `src/app/partner/incoming/page.tsx` | `text-[13px]` | 29 | 1 |
| `src/app/partner/page.tsx` | `text-[13px]` | 31 | 1 |
| `src/components/chat/ChatComposer.tsx` | `text-[11px]` | 123 | 1 |
| `src/components/chat/ChatFilterBar.tsx` | `text-[12px]` | 56, 76, 94 | 3 |
| `src/components/chat/ChatRoom.tsx` | `text-[12px]` | 124 | 1 |
| `src/components/chat/ChatRoom.tsx` | `text-[13px]` | 92, 131, 193 | 3 |
| `src/components/common/LiveInfoNotice.tsx` | `text-[13px]` | 17 | 1 |
| `src/components/common/PartnerCta.tsx` | `text-[10px]` | 19 | 1 |
| `src/components/common/PartnerCta.tsx` | `text-xs (12px)` | 16 | 1 |
| `src/components/common/SourceBadge.tsx` | `text-[13px]` | 47 | 1 |
| `src/components/common/StatusPill.tsx` | `text-[13px]` | 13 | 1 |
| `src/components/home/DiscoveryForm.tsx` | `text-[12px]` | 102, 118 | 2 |
| `src/components/home/DiscoveryForm.tsx` | `text-[13px]` | 84, 204 | 2 |
| `src/components/home/LiveTalkBanner.tsx` | `text-[12px]` | 100 | 1 |
| `src/components/home/LiveTalkBanner.tsx` | `text-[13px]` | 74 | 1 |
| `src/components/hospital/HospitalDetail.tsx` | `text-[12px]` | 242, 253 | 2 |
| `src/components/hospital/HospitalDetail.tsx` | `text-[13px]` | 207, 221 | 2 |
| `src/components/hospital/ReportFeed.tsx` | `text-[12px]` | 57, 87 | 2 |
| `src/components/hospital/ReportFeed.tsx` | `text-[13px]` | 35 | 1 |
| `src/components/hospital/ReportForm.tsx` | `text-[11px]` | 112 | 1 |
| `src/components/hospital/ReportForm.tsx` | `text-[13px]` | 178 | 1 |
| `src/components/hospital/ReportTargetPicker.tsx` | `text-[12px]` | 106, 121, 139, 158, 183, 208 | 6 |
| `src/components/hospital/ReportTargetPicker.tsx` | `text-[13px]` | 80, 91, 98, 215, 220 | 5 |
| `src/components/layout/BottomNav.tsx` | `text-[11px]` | 64 | 1 |
| `src/components/partner/ContactStatusCard.tsx` | `text-[13px]` | 34 | 1 |
| `src/components/partner/PartnerGate.tsx` | `text-[13px]` | 87, 94, 95 | 3 |
| `src/components/partner/PartnerHeader.tsx` | `text-[11px]` | 34 | 1 |
| `src/components/partner/PartnerHeader.tsx` | `text-[13px]` | 44 | 1 |
| `src/components/partner/PartnerJoin.tsx` | `text-[10px]` | 116 | 1 |
| `src/components/partner/PartnerJoin.tsx` | `text-[11px]` | 148 | 1 |
| `src/components/partner/PartnerJoin.tsx` | `text-[12px]` | 266 | 1 |
| `src/components/partner/PartnerJoin.tsx` | `text-[13px]` | 73, 86, 162, 207, 319 | 5 |
| `src/components/partner/PartnerJoin.tsx` | `text-xs (12px)` | 115 | 1 |
| `src/components/partner/PartnerSignInForm.tsx` | `text-[13px]` | 39, 50 | 2 |
| `src/components/partner/TodayHoursCard.tsx` | `text-[12px]` | 74 | 1 |
| `src/components/partner/TodayHoursCard.tsx` | `text-[13px]` | 51, 60, 70, 87 | 4 |
| `src/components/partner/TodayStatusCard.tsx` | `text-[13px]` | 64, 87, 90 | 3 |
| `src/components/partner/WaitingCard.tsx` | `text-[13px]` | 19 | 1 |
| `src/components/search/AdmissionBlock.tsx` | `text-[13px]` | 27 | 1 |
| `src/components/search/ConditionBar.tsx` | `text-[12px]` | 234 | 1 |
| `src/components/search/ConditionBar.tsx` | `text-[13px]` | 71, 81, 126, 135, 158, 187, 201 | 7 |
| `src/components/search/HospitalCard.tsx` | `text-[13px]` | 111 | 1 |

## 이 턴을 시작할 때

1. 공용 컴포넌트(위 표) 먼저. 고친 뒤 홈·검색·상세·파트너 네 화면을 실제로 본다.
2. 배지·보조 라벨은 크기를 올리면 줄바꿈이 생긴다. 줄이 늘어나면 원칙 4 위반이므로
   글자를 키우는 대신 **문구를 줄이거나 항목을 접는다.**
3. 12px 이하(31곳)와 13px(52곳)은 성격이 다르다. 12px 이하는 읽기 자체가 어려워
   먼저 올린다. 13px 는 본문 승격(16px) 대상과 보조 라벨 유지 대상을 나눠야 한다.
4. 끝나면 이 문서를 지우고 원칙 2 의 "미정리 부채" 항목도 지운다.
