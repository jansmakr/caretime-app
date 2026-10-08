# CareTime P0 차이표 (PRD_UX v1.0 §14 0단계)

작성일: 2026-09-27 · 기준 문서: `CareTime_PRD_UX_v1.0.md` · 기준 커밋: `03979ab` (main)

PRD §16 실행 지시에 따라 **기존 저장소를 먼저 읽고** 작성한 차이표다.
판정은 네 가지만 쓴다: **있음** / **수정 필요** / **없음** / **미검증**.
문서가 있다는 이유로 '있음'을 주지 않는다. 코드에서 확인한 것만 '있음'이다.

---

## 0. 저장소 사실 확인 (값은 적지 않는다)

| 항목 | 확인 결과 |
|---|---|
| repo 지침 파일 | `AGENTS.md` · `CLAUDE.md` · `.cursorrules` **없음**. `README.md`가 사실상의 구현 계약 문서이며 설계 규칙 12개가 절로 정리되어 있다. PRD §16이 가정한 지침 파일 대신 이것을 읽었다. |
| 프레임워크 | Next.js 15.5.25 App Router · React 19 · TypeScript 5.7 · Tailwind 3.4. `next.config.mjs`는 `reactStrictMode`만 설정. |
| 서버 API | **없음.** `src/app/api` 디렉터리가 존재하지 않는다. 브라우저가 `@supabase/supabase-js`로 DB에 직접 접근한다. |
| Auth | Supabase Auth 이메일/비밀번호. 보호자용(`getPublicBrowserSupabase`, 세션 저장 안 함)과 파트너용(`getBrowserSupabase`, 세션 저장) 클라이언트를 **분리**해 둠. |
| DB | Supabase Postgres. migration 1개: `20260915130000_stage2_hospital_live.sql`. 테이블 9개 + enum 8개 + RLS + 트리거. |
| 권한 | RLS. 공개 읽기 정책 + `is_hospital_member()` (security definer) 기반 member insert/update. **delete 정책 없음**(의도). |
| 실시간 | 브라우저가 4개 테이블을 anon 권한으로 `postgres_changes` 직접 구독. outbox/공개 DTO 계층 없음. |
| 배포 설정 | `vercel.json` · `.github/` **없음**. 배포 구성이 저장소에 없어 **미검증**. |
| 환경변수 이름 | `.env.example`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_MAP_PROVIDER`, `NEXT_PUBLIC_KAKAO_MAP_KEY`, `NEXT_PUBLIC_KAKAO_REST_API_KEY`, `NEXT_PUBLIC_NAVER_MAP_KEY`, `DATA_GO_KR_SERVICE_KEY` |
| 로컬에 실제로 설정된 것 | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` 뿐. **`SUPABASE_SERVICE_ROLE_KEY`는 비어 있다** → 서버 권한 쓰기(게스트 글·격리·운영 조치)를 지금 구현·검증할 수 없다. |
| supabase CLI | 2.101.0 설치됨, 프로젝트 linked. **migration을 push하지 않았다**(PRD §16 "운영 환경에 검증 없이 배포하지 마라"). |

---

## 1. 라우트 계약 차이 (PRD §1)

`caretime.kr`이 이미 배포·공유되고 있으므로 경로 변경은 **깨지는 변경**이다. 임의로 바꾸지 않고 표로 남긴다.

| PRD 경로 | 현재 저장소 | 판정 |
|---|---|---|
| `/` 지역·카테고리·최신 현황 | `/` (상황 입력 + 라이브 피드). **지역 선택·`[내 주변]`·카테고리 3분할이 홈에 없다.** | 수정 필요 |
| `/hospitals/:id` | **`/hospital/[id]`** (단수) | 수정 필요 — 경로명 불일치 |
| (병원 목록) | `/search` (Search Session 기반, 증상 입력 전제) | 수정 필요 — PRD는 지역·카테고리 탐색 |
| `/chat?hospital=:id&category=laceration` | `/chat` (쿼리 없음, 화면 안 필터) | 수정 필요 — 쿼리 계약 없음 |
| `/partner` 무료 참여 안내·신청 | `/partner` (비로그인 시 안내+신청, 로그인 시 대시보드) | 있음 (부분) |
| `/partner/application/:token` | 없음 | 없음 |
| `/partner/login` | 없음 (`/partner` 안에서 토글) | 수정 필요 |
| `/partner/dashboard` | `/partner` 가 겸함 | 수정 필요 |
| `/partner/team`, `/partner/billing` | 없음 | 없음 (P1) |
| `/admin/applications`, `/admin/reports` | 없음 | 없음 |
| `/guide`, `/guide/products` | 없음 | 없음 (P2 플래그) |
| `/policies/privacy|terms|community` | 없음 | 없음 — **P0 출시 차단 항목** |
| `/api/v1/*` (§10 전체) | **없음** | 없음 |

부수: `/live`(5단계 자리표시자), `/more`, `/partner/capabilities`, `/partner/incoming`은 PRD에 없는 기존 화면이다. 삭제 대상으로 보지 않고 유지한다.

---

## 2. 기능별 차이표

### §2 홈

| PRD 기능 | 판정 | 근거 / 필요한 일 |
|---|---|---|
| §2.1-1 지역 선택(시·구), `[내 주변]` | 없음 | 홈에 지역 개념이 없다. `features/reports/regions.ts`에 시/도 목록·주소 파서가 있어 재사용 가능. |
| §2.1-2 상단 안전 줄 + `[119 전화]` | 수정 필요 | `EmergencyCallout`(119 확인 시트)은 있음. **"현장톡 답변을 기다리지 말고 119" 안전 줄 문구는 없음.** |
| §2.1-3 열상/화상/기타 3분할 | 수정 필요 | 칩은 `features/chat/templates.ts`·`reports/templates.ts`에 있으나 **홈 탐색 필터가 아니라 작성 분류**다. |
| §2.1-4 공식/제보 구분 + 절대·상대 시각 | 수정 필요 | `SourceBadge`(4출처) + `formatAgo`/`formatMomentAgo` 있음. **절대 시각 동시 표기는 없음**(상대 시각만). |
| §2.1-5 병원 카드 | 수정 필요 | `HospitalCard` 있음. 거리·상태·전화 있음. **선택 항목별 공식 상태·최근 제보 요약이 카드에 없다.** |
| §2.2 정렬 규칙 (유효 가능 → 미확인 → 마감) | 없음 | 현재 정렬은 `distanceKm` 단일축(`service.ts`). PRD는 4단 그룹 + 안정 정렬. **구독 등급 배제는 이미 구조적으로 보장됨**(결제 필드 자체가 없음). |
| §2.2 빈 상태 / 통신 실패 | 수정 필요 | `/search`에 빈 상태·에러 카드 있음. **"연결 끊김 · 마지막 수신" 표기와 만료 후 배지 제거는 없음.** |
| §2.2 시드·가짜 제보 운영 노출 금지 | 수정 필요 | 현재 데모 제보/대화가 **운영 빌드에도 렌더된다**(`DemoNotice`로 고지 중). PRD는 운영 환경 노출 금지 → 환경 분기 필요. |
| §2.2 성능 목표 (p75 LCP 2.5s) | 미검증 | 측정 도구·계측 없음. |

### §3 현장톡

| PRD 기능 | 판정 | 근거 / 필요한 일 |
|---|---|---|
| §3.1 서버 guest 세션(256비트 토큰, DB엔 해시만, HttpOnly 쿠키) | **없음** | 현재 닉네임을 `localStorage`에 두고 **서버 세션이 전혀 없다.** |
| §3.1 CSRF·Origin 검사 | 없음 | 쓰기 경로가 서버에 없다. |
| §3.1 닉네임 규칙(허용목록 형용사+동물/자연+4자리, 금지어) | 수정 필요 | `features/chat/nickname.ts` 있으나 형식이 다르다(`강서구맘`). **금지어 검사·서버 발급 없음.** |
| §3.1 room_alias (hospital+date+guest HMAC) | 없음 | 병원 간 활동 연결 축소 장치 없음. |
| §3.1 클라이언트 제한(30초/2초) | 수정 필요 | 5초 쿨다운만 있음(PRD는 글 30초·리액션 2초). |
| §3.1 **서버 제한**(30초/시간10/일30, 리액션 10초5/시간60, 신고 시간5) | **없음** | 전부 클라이언트. PRD가 명시적으로 금지한 형태. |
| §3.1 429 + `retry_after_seconds` | 없음 | |
| §3.2 작성 플로우(병원→카테고리→관찰/질문→템플릿→메모→게시) | 수정 필요 | 카테고리→템플릿→본문은 있음. **관찰/질문 구분, 병원 선택 단계, 첫 작성 동의가 없다.** |
| §3.2 첫 작성 1회 안전 안내 + 정책 버전 동의 | 없음 | `consent_events` 없음. **P0 출시 차단 항목.** |
| §3.2 개인정보 검출 차단 | 없음 | 안내 문구만 있음(`개인을 알 수 있는 정보는 적지 마세요`). 서버 검출 없음. |
| §3.3 템플릿 15개(L01–O05) | 수정 필요 | 현재 카테고리별 1개씩 총 3개(질문형). **ID 체계·관찰/질문 구분·선택지 필수 검증 없음.** |
| §3.4 리액션 = 병원×카테고리×시점 관찰 | 수정 필요 | 버튼 3개와 라벨은 PRD와 일치. **그러나 글 단위 공감으로 붙어 있다.** metric/value, 15분 만료, 활성 유일 제약, 원자적 교체 없음. |
| §3.4 낙관적 갱신 + 서버 version 교체 + 실패 원복 | 없음 | 서버가 없어 낙관적 갱신 개념이 성립하지 않음. |
| §3.4 aria-live 집계 낭독 | 수정 필요 | 리액션 숫자에 `aria-live` 없음(대기 인원 stepper에는 있음). |
| §3.4 공식·제보 충돌 배너 | **없음** | PRD 핵심 안전 장치. |
| §3.5 cursor pagination 20건 | 없음 | 전체를 메모리에서 렌더. |
| §3.5 "새 제보 3건" 버튼 / 스크롤 고정 | 없음 | |
| §3.5 관찰 30분·공개 24시간·서버 동일 정책 | 없음 | |

### §4 공유·OG

| PRD 기능 | 판정 | 근거 |
|---|---|---|
| OS 공유 / 링크 복사 fallback | **있음** | `features/chat/share.ts` — `navigator.share` → clipboard → textarea 3단. `AbortError` 처리까지. |
| 공유 문구 포맷 | 수정 필요 | 현재 `[케어타임 실시간 현장] {병원명/지역} - {카테고리} 최신 현황 확인하기`. PRD는 4줄 포맷 + 전화 확인 문구. |
| 공유 URL `?category=` | 수정 필요 | 현재 `/hospital/{id}` (카테고리 없음). |
| 카카오톡 공식 SDK | 없음 | 키 미설정. |
| 맘카페 "문구+링크 복사" | 수정 필요 | 복사는 되지만 전용 버튼·안내 없음. |
| OG 서버 렌더링(1200×630) | **없음** | `og:*` 메타 없음. `metadata`에 title/description만. |
| OG에 '현재 접수 가능' 박제 금지 | 있음(해당 없음) | OG 자체가 없어 위반 없음. 구현 시 유지. |

### §5–6 병원 도구

| PRD 기능 | 판정 | 근거 |
|---|---|---|
| §5.1 신청 폼(기관명·주소·대표전화·식별자·담당자·연락처·대상·증빙·동의) | 수정 필요 | `PartnerJoin` 5필드(기관명·지역·담당자·연락처·진료분야). **기관 식별자·증빙 업로드·약관 동의 버전 기록 없음.** |
| §5.1 신청 상태 머신 DRAFT→…→APPROVED/REJECTED | 없음 | `partner_applications` 테이블 없음. 현재 신청은 **브라우저 메모리**. |
| §5.1 private 증빙 저장·MIME·악성 검사·5분 서명 URL | 없음 | Storage 미사용. |
| §5.2 초대 수락 → OWNER 부여 | 없음 | 운영자가 SQL로 `hospital_members` 직접 삽입(README 4항). |
| §5.2 역할 OWNER/EDITOR/VIEWER | 수정 필요 | 현재 `member_role` enum = `owner|staff`. **VIEWER 없음, EDITOR 명칭 다름.** |
| §5.2 관리자 세션 12h/30m·재인증·MFA | 없음 | Supabase 기본 세션 그대로. |
| §6.1 항목별 `[접수 가능]`/`[마감]` + 15/30/60분 | 수정 필요 | `TodayStatusCard`/`ChoiceGroup`로 상태 토글 있음. **유효시간 선택 UI 없음**(TTL은 진료 종료까지). |
| §6.1 5초 되돌리기 | 없음 | |
| §6.1 대기 버킷 `미확인/30분 이내/30~60/60분 이상` | 수정 필요 | 현재 `waiting_level` 5단 + headcount 숫자. **버킷 계약 불일치.** |
| §6.2 status `AVAILABLE/CLOSED/PAUSED/UNKNOWN` | 수정 필요 | 현재 `live_status_code` = `normal/partial/paused/difficult`. **enum 불일치.** |
| §6.2 EXPIRED는 `now >= valid_until` 파생 | **있음** | `lib/freshness.ts` `isExpired()`를 읽는 시점마다 호출. README 2항이 같은 규칙을 이미 명문화. |
| §6.2 AVAILABLE 기본 30분·최대 60분 | 수정 필요 | 현재 제약은 `expires_at <= verified_at + 24h`. **PRD보다 훨씬 느슨하다.** |
| §6.2 재개 시각이 자동 AVAILABLE로 바뀌지 않음 | **있음** | `describeStatus()`가 "재개 예정 시각 지남 · 재확인 필요"로만 표시. README 2항. |
| §6.2 전체 마감 트랜잭션 | 없음 | |
| §6.2 version 기반 compare-and-swap · 409 | **없음** | 현재는 낙관적 갱신 + `verified_at` 최신값 비교(`mergeFresher`). **동시 편집 충돌을 감지하지 못하고 조용히 덮어쓴다.** |
| §6.2 만료 5분 전 안내 | 없음 | |
| §6.3 공지 ≤80자·≤12시간·정책 검사 | 수정 필요 | `hospital_daily_hours.today_note` (80자) 있음. **유효시간·moderation_state·금지어 검사 없음.** |
| §6.3 공식/제보 시각 구분 배지 | **있음** | `SourceBadge` — 색 + 점 모양 + 텍스트 3중 표기. 툴팁 문구는 없음. |
| §6.3 결제로 배지 부여/제거 금지 | **있음** | 결제 필드가 스키마에 없다. |

### §7 법률·안전·신고

| PRD 기능 | 판정 | 근거 |
|---|---|---|
| §7.2 고지 6개 배치 | 수정 필요 | `lib/copy.ts`에 3개(`NOT_A_BOOKING`·`CALL_IS_SUREST`·`USER_REPORT_DISCLAIMER`) + `VISIT_INTENT_DISCLAIMER`. **전화 CTA 인접 고지·배지 설명·참여 안내 문구 없음.** |
| §7.3 신고 사유 6종·대상별 ID | **없음** | 신고 UI·테이블 모두 없음. |
| §7.3 자동 격리(QUARANTINED)·이의신청 | 없음 | |
| §7.3 상태 머신 VISIBLE→…→REMOVED | 없음 | |
| §7.3 비공개 audit 기록 | 수정 필요 | `hospital_update_log`는 병원 입력용. 신고·조치용 없음. |
| §7.4 보관·삭제 스케줄 | 없음 | 만료 정리 job 없음(읽기 시점 판정만). |

### §9–11 기술

| PRD 기능 | 판정 | 근거 |
|---|---|---|
| §9 Web → 서버 API → DB → outbox → 공개 이벤트 | **없음** | 현재 Web → DB 직접. **보호자 브라우저가 테이블을 직접 구독**한다(PRD가 금지한 형태). |
| §9.1 신규 테이블 12종 | 없음 | `guest_sessions`·`posts`·`observations`·`reports`·`moderation_actions`·`consent_events`·`outbox_events`·`idempotency_keys`·`partner_applications`·`notices`·`service_statuses`·`status_events`·`product_links` 전부 없음. |
| §9.1 hospitals.id UUID | 수정 필요 | 현재 **`text`** (`h_001`). additive 유지 필요 — 교체하면 기존 공유 링크가 깨진다. |
| §9.2 상태 파생 단일 함수 | 수정 필요 | `lib/freshness.ts`가 그 역할이지만 **PRD 계약(UNVERIFIED·wait_bucket·conflict)을 담지 않는다.** |
| §9.2 CDN 캐시 ≤15초·개인정보 no-store | 미검증 | 캐시 헤더 설정 없음. |
| §10 API 계약 21개 | 없음 | |
| §10 멱등성(`Idempotency-Key`) | 없음 | |
| §11 SSE·outbox·snapshot 수렴 | 수정 필요 | Realtime 재연결 시 전체 재조회 + `mergeFresher`로 수렴하는 장치는 **있음**(README 8항). 그러나 공개 DTO·event_id·version 계약은 없음. |
| §11 폴링 fallback·heartbeat | 수정 필요 | 끊김 표시(`LiveIndicator`)는 있음. 폴링 fallback 없음. |
| §11 기능 플래그 4종 OFF | 없음 | 플래그 체계 없음. 현재 결제·커머스·내원공유 기능 자체가 없어 **사실상 OFF**. |
| §11 분석 허용목록 | 없음 | 분석 코드 자체가 없다(= 건강정보 이력 구축 위험 없음). |

---

## 3. 이미 PRD와 일치하는 것 (재사용, 다시 만들지 않는다)

PRD §16이 "기존 코드를 재사용하라"고 했으므로 명시한다.

1. **읽기 시점 만료 판정** — `lib/freshness.ts`. §6.2·§9.2의 핵심 규칙이 이미 구조로 강제돼 있다.
2. **출처 분리** — 타입 단계 분리 + `SourceBadge` 3중 표기. §6.3·§13 `OfficialBadge`의 바탕.
3. **재개 예정 시각의 자동 전환 금지** — §6.2 그대로.
4. **정렬에 결제·제휴 접근 경로 없음** — §2.2·§7.1의 구조적 보장.
5. **KST 단일 지점** — `lib/kst.ts`. §9.1 "UTC 저장·Asia/Seoul 표시"와 호환.
6. **공유 3단 fallback** — `features/chat/share.ts`. §4 요구를 이미 만족.
7. **보호자/파트너 Supabase 클라이언트 분리** — §9 "직원 채널 분리"의 바탕.
8. **RLS + `is_hospital_member()` + delete 정책 부재** — §11 ACL의 바탕. 역할 enum만 확장하면 된다.
9. **대기 인원 `null`("확인 못 함") ≠ `0`** — §6.1 `wait_bucket: UNKNOWN`과 같은 사고.
10. **템플릿이 답을 미리 채우지 않음** — §3.3 "선택값 없이 대괄호가 남으면 게시 불가"와 같은 원칙.

---

## 4. P0 구현 순서 제안 (실제 파일 경로)

의존성 순서다. 각 단계는 앞 단계 없이는 검증할 수 없다.

### 0단계 — 계약 모듈 (DB 없이 검증 가능) ← **이번에 구현**
```
src/features/p0/status.ts        §6.2·§9.2 상태·만료·충돌 파생 (순수)
src/features/p0/templates.ts     §3.3 템플릿 15개 + 선택지 검증
src/features/p0/observations.ts  §3.4 metric/value·15분·활성 유일 키
src/features/p0/nickname.ts      §3.1 허용목록 닉네임 + 금지어 + room_alias
src/features/p0/limits.ts        §3.1 서버 제한값 + §10 오류 코드·retry_after
src/features/p0/retention.ts     §7.4 보관 기간 상수
src/features/p0/flags.ts         §11 기능 플래그 (전부 OFF)
```

### 1단계 — additive migration (작성만, push는 승인 후)
```
supabase/migrations/2026xxxx_p0_official_status.sql
supabase/migrations/2026xxxx_p0_guest_content.sql
supabase/migrations/2026xxxx_p0_moderation.sql
```
`hospitals.id`는 `text` 유지. 기존 테이블 **삭제·컬럼 제거 없음**. 신규 enum·테이블만 추가하고,
`service_statuses`는 기존 `hospital_live_status`와 **병존**시킨 뒤 읽기 경로를 순차 전환한다.

### 2단계 — 서버 API 계층 (`SUPABASE_SERVICE_ROLE_KEY` 필요)
```
src/app/api/v1/guest-sessions/route.ts
src/app/api/v1/posts/route.ts, [id]/route.ts
src/app/api/v1/hospitals/[id]/observations/[metric]/route.ts
src/app/api/v1/reports/route.ts
src/app/api/v1/events/route.ts                (SSE)
src/app/api/v1/partner/statuses/[serviceId]/route.ts
src/lib/api/{envelope,csrf,rateLimit,idempotency,serviceRole}.ts
```

### 3단계 — UI 전환
홈 지역·카테고리 탐색 · `/hospitals/:id` 경로 · 충돌 배너 · 관찰/질문 구분 · cursor 피드 · OG.

### 4단계 — 운영
`/admin/*` 콘솔 · 신고 큐 · 격리·복구 · 보관 삭제 job · `/policies/*`.

---

## 5. P0 출시 차단 항목 (코드로 해결되지 않는 것)

PRD §15가 "중대 항목은 공개 출시 보류"로 둔 것들이다. 현재 전부 미해결이다.

1. **법률 검토** — 의료법 §27·§56, 개인정보 보호법 §23·§22의2. 코드 테스트로 대체 불가(§16).
2. **`/policies/*` 3종 문서** — 정책 버전이 없으면 §3.2 동의 기록이 성립하지 않는다.
3. **운영 인력** — §7.3 신고 SLA. 24시간 대응이 없으면 `free_text_enabled` OFF 유지.
4. **`SUPABASE_SERVICE_ROLE_KEY` 발급·보관 경로** — 서버 API의 전제.
5. **리전·국외이전 확인** — §7.1. 현재 Supabase 리전 **미검증**.
6. **배포 구성** — `vercel.json`·CI 없음. 릴리스 절차 **미검증**.
