# CareTime — 1단계 (모바일 UI · Search Session · 병원 결과 · 병원 상세)

지금 필요한 진료정보를 빠르게.

CareTime은 AI 진단앱도, 병원 추천앱도, 예약중개 서비스도 아닙니다.
사용자가 말한 사실을 검색조건으로 구조화하고, **정보의 출처와 확인시각을 구분해서**
보여주는 의료정보 내비게이션입니다.

---

## 실행

```bash
npm install
npm run dev     # http://localhost:3000  (병원 화면: /partner)
npm run build   # 프로덕션 빌드
npm run typecheck
```

Node.js 18.18 이상이 필요합니다. `.env.local` 없이 실행하면 Mock 데이터로 동작합니다.
Supabase 연결은 아래 「2단계 — Supabase 연결」을 따르세요.

---

## ⚠️ Mock 정책

**이 단계의 모든 의료기관 데이터는 가상입니다.**

- 병원명은 전부 "가상○○의원" 형태이며 실제 기관을 식별할 수 없습니다.
- 전화번호는 `02-000-000X`, 좌표는 임의값입니다.
- 화면 상단의 노란 배너(`DemoNotice`)가 항상 떠 있습니다.
  **실데이터 연동 전까지 이 배너를 끄지 마세요.**
- 실제 연동 지점은 `src/features/hospitals/service.ts`이며, 8단계에서
  공공데이터 어댑터로 교체합니다.

---

## 이 코드가 지키고 있는 것

기획안의 원칙을 주석이 아니라 **구조로** 강제한 지점들입니다.
리뷰할 때 여기부터 보시면 됩니다.

### 1. 정보 계층이 타입 단계에서 섞이지 않는다

`src/features/hospitals/types.ts`

`PublicHospitalData`(공공) / `HospitalCapability`(진료기능) / `HospitalLiveStatus`(병원 직접확인)
는 서로 다른 타입이고, 하나로 병합되지 않습니다. 모든 상태값에 `verifiedBy`와 `verifiedAt`이
붙어 있어서 출처를 잃은 정보가 화면에 나올 수 없습니다.

화면에서는 `SourceBadge`가 이 구분을 담당합니다. 색만으로 구분하지 않고
**색 + 점 모양 + 텍스트** 세 가지를 동시에 씁니다(색각이상·야간 저조도 대응).
사용자 공유 정보만 점이 비어 있는 점선 원입니다.

### 2. 오래된 상태는 현재처럼 보이지 않는다 (Release Blocker 2)

`src/lib/freshness.ts`

만료 처리를 스케줄러에만 맡기지 않습니다. 크론이 한 번 실패하면 그대로 블로커가 되기 때문에,
**읽는 시점마다** `isExpired()`로 판정합니다. `expectedResumeAt`이 지나도 자동으로 `normal`로
바꾸지 않고 "재개 예정 시각 지남 · 재확인 필요"로만 표시합니다.

Mock 데이터의 `h_004`(가상새봄정형외과의원)가 이 케이스입니다.
`status: "normal"`인데 `expiresAt`이 지나서, 화면에는 "현재 상태 확인 필요"로만 나옵니다.

### 3. 건강정보가 URL에 실리지 않는다 (Release Blocker 5)

`src/features/search-session/SearchSessionProvider.tsx`

`/search?age=5&part=forehead` 같은 경로를 만들면 Referer 헤더, 서버 액세스 로그,
Analytics에 아동 건강정보가 그대로 남습니다. 그래서 `/search`는 **파라미터가 없는 경로**이고,
세션은 `sessionStorage`에만 있습니다(탭을 닫으면 사라짐).

2단계에서 `care_sessions` 테이블로 옮길 때도 user profile에 영구 저장하지 않습니다.

### 4. AI가 의료판단을 만들 자리가 없다 (Release Blocker 7)

`src/features/search-session/types.ts`의 `ExtractedFacts`

이 타입에는 판단·권고를 담을 필드가 아예 없습니다. 나이·부위·상황·지혈여부만 있습니다.
프롬프트로 막는 게 아니라 스키마로 막습니다.

그리고 1단계의 추출기(`extract.ts`)는 **외부 LLM을 호출하지 않는 규칙기반 파서**입니다.
아동 건강정보를 해외 API로 보내면 국외이전 동의가 별도로 필요해지고, 현재 MVP 진료영역
(소아 안면열상 / 수부외상 / 화상)에서는 사전 매칭만으로 대부분 커버되기 때문입니다.
못 잡은 값은 추측해서 채우지 않고 `missing`으로 남긴 뒤 **한 번에 하나씩** 되묻습니다.

> LLM 폴백을 붙일 경우, 폴백이 실행되는 그 시점에 국외이전 동의를 받아야 합니다.

### 5. 정렬은 거리 단일축이다 (Release Blocker 8)

`src/features/hospitals/service.ts`

`.sort((a, b) => a.distanceKm - b.distanceKm)` 하나뿐입니다.
병원 객체에 결제·제휴 필드가 없고, 이 모듈은 관련 모듈을 import하지도 않습니다.
나중에 SaaS를 유료화해도 "돈 낸 병원이 위로 간다"가 코드상 불가능합니다.

### 6. 현재 대기와 내원예정을 합산하지 않는다

`describeWaitingForUser()` / `describeIncomingForUser()`가 분리되어 있습니다.
그리고 사용자 화면에서는 내원예정 인원이 5명 미만이면 **아예 표시하지 않습니다**
(`INCOMING_DISPLAY_THRESHOLD`). 소수 인원일 때 숫자를 그대로 보여주면 같은 대기실의
보호자끼리 서로를 특정할 수 있기 때문입니다. 병원 화면에서는 정확한 숫자를 그대로 씁니다.

### 7. 병원 파트너 화면(/partner)은 보호자 화면과 섞이지 않는다

`src/app/partner/` · `src/features/partner/`

- **레이아웃 분리** — 보호자 화면은 `(consumer)` 라우트 그룹에만 하단 메뉴와 Search Session이 있습니다.
  `/partner`는 상단 헤더 탭(오늘 상태 · 내원예정 · 진료기능)만 쓰고, 건강정보 세션에 접근하지 않습니다.
  `noindex` 처리되어 있습니다.
- **입력값은 기존 계층 타입 그대로** — 병원이 누르는 값은 `HospitalLiveStatus` / `HospitalHours` /
  `HospitalContactStatus` / `HospitalWaitingStatus`를 그대로 씁니다. 입력 규칙은
  `features/partner/service.ts`의 순수 함수(`(state, now) → state`)라 2단계 서버 액션으로 그대로 옮깁니다.
- **"어제와 동일"** — 어제 확인한 상태·사유·내원 마감을 그대로 다시 쓰고 `verifiedAt`만 지금으로 갱신합니다.
  "오늘만" 값(단축 종료)은 이어받지 않습니다. 상태 유효시간은 오늘 진료 종료까지입니다.
- **내원 마감은 저장해야 확정** — "종료 1시간 전"은 입력칸을 채우는 제안일 뿐입니다.
  진료 시작보다 이른 시각은 자정을 넘긴 다음 날로 해석합니다(야간 00:30 종료 등).
- **대기와 내원예정은 다른 카드** — 합계를 만드는 함수 자체가 없습니다. 내원예정 10/30/60분 카운터는
  목록(`IncomingVisit[]`)에서 매번 계산하므로 카운터와 목록 숫자가 어긋나지 않습니다.
  예정시각이 30분 넘게 지난 건은 집계에서 뺍니다(`INCOMING_OVERDUE_GRACE_MINUTES`).
- **내원예정에 개인정보 없음** — `CT-XXXX` 임시코드와 보호자가 입력한 사실(나이·부위·상황·지혈여부)만 보여줍니다.

> Supabase 설정이 없으면 데모 병원(`h_001`) 고정·로그인 없음·브라우저 메모리 저장으로 동작합니다.

### 8. 병원 입력은 DB 가 권한과 시각을 확정한다 (2단계)

`supabase/migrations/` · `src/features/hospitals/{rows,repository,realtime}.ts` · `src/features/partner/supabaseBackend.ts`

- **테이블도 계층별로 분리** — `hospitals`(공공) / `hospital_capabilities`(진료기능) /
  `hospital_live_status` · `hospital_daily_hours` · `hospital_contact_status` · `hospital_waiting_status`(병원 직접확인).
  대기 테이블에는 내원예정을 더할 컬럼이 없습니다.
- **쓰기는 소속 병원 계정만 (Release Blocker 1)** — RLS가 `hospital_members`로 판정합니다. anon에는 쓰기 권한 자체가 없고,
  삭제는 누구에게도 열려 있지 않습니다. 병원 계정도 기본정보·진료기능은 수정할 수 없습니다.
- **확인시각은 DB 시각** — 트리거가 `verified_at = now()`, `verified_by = 'hospital'`로 덮어씁니다. 클라이언트 시계를 믿지 않습니다.
- **만료는 최대 24시간** — `expires_at <= verified_at + 24h` 제약. 어제 누른 상태가 오늘 현재처럼 남지 않습니다.
- **진료일은 KST 05:00에 바뀝니다** — `hospital_daily_hours`는 `(hospital_id, service_date)` 키라 "오늘만" 값이 다음 날로 넘어가지 않습니다.
  앱(`lib/kst.ts`)과 DB(`kst_service_date()`)가 같은 규칙을 씁니다. 모든 시각은 Asia/Seoul로 포맷해 Vercel(UTC) 서버 렌더와 브라우저가 같은 시각을 보여줍니다.
- **변경 이력** — 모든 병원 입력이 `hospital_update_log`에 작성자와 함께 쌓입니다(소속 병원만 열람). "어제와 동일"은 여기서 마지막 진료일의 상태를 읽습니다.
  직원 id는 보호자에게 공개되는 상태 테이블에 두지 않습니다.
- **실시간** — 보호자 병원 상세는 서버에서 최신값으로 렌더한 뒤 4개 테이블을 Realtime으로 구독합니다.
  연결·재연결 때마다 전체를 다시 읽어 끊긴 사이의 변경을 놓치지 않고, 끊기면 "실시간 끊김"을 표시합니다.
  파트너 화면도 같은 채널을 구독해 원장님·당직자 기기끼리 동기화됩니다(내 저장의 메아리·늦게 온 옛 이벤트는 무시).

---

## 2단계 — Supabase 연결

1. **스키마·시드 적용**
   ```bash
   supabase login
   supabase link --project-ref <프로젝트 ref>
   supabase db push --include-seed   # 시드는 가상 병원 5곳(데모)입니다
   ```
2. **환경변수** — `.env.local`(로컬)과 Vercel(Production·Preview)에 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`를 넣습니다.
   Vercel은 값을 바꾼 뒤 재배포해야 반영됩니다(`NEXT_PUBLIC_*`은 빌드 때 들어갑니다).
3. **Auth 설정** — 대시보드 Authentication → Sign In / Providers에서 **Allow new users to sign up을 끕니다.**
   계정은 운영자가 Users → Add user로 만듭니다. (가입을 열어 둬도 소속이 없으면 쓰기는 RLS가 막지만, 불필요한 계정이 생기지 않게 합니다)
4. **병원 계정 연결** — SQL Editor에서:
   ```sql
   insert into public.hospital_members (hospital_id, user_id, role)
   select 'h_001', id, 'owner' from auth.users where email = '원장님@병원.kr';
   ```

---

## 디렉터리

```
src/
  app/
    (consumer)/                 보호자 화면 (하단 메뉴 · Search Session)
      page.tsx                  홈 (상황 입력)
      search/page.tsx           검색 결과
      hospital/[id]/page.tsx    병원 상세
      live/page.tsx             실시간 (5단계 자리)
      more/page.tsx             더보기 (7단계 자리)
    partner/                    병원 파트너 화면 (상단 헤더 탭)
      page.tsx                  오늘 상태 · 진료시간 · 전화 · 대기 · 내원예정 카운터
      incoming/page.tsx         내원예정 목록
      capabilities/page.tsx     등록 진료기능
  components/
    common/   SourceBadge · StatusPill · DemoNotice · EmergencyCallout
    layout/   AppHeader · BottomNav
    home/     HomeSearchForm
    search/   HospitalCard
    partner/  PartnerHeader · PartnerGate(로그인) · ChoiceGroup · 상태/시간/전화/대기 카드 · IncomingCounter
    hospital/ HospitalDetail (실시간 구독 화면)
  features/
    search-session/  types · extract(규칙 파서) · SearchSessionProvider
    hospitals/       types · labels · mock · service · rows(DB↔도메인) · repository · realtime · useHospitalLive
    partner/         types · service(입력 규칙) · mock · supabaseBackend · PartnerProvider
  lib/
    freshness.ts     신선도·만료 판정 (단일 지점)
    kst.ts           KST·진료일 (단일 지점)
    supabase/        config · browser · server
supabase/
  migrations/        스키마 · RLS · 트리거 · Realtime
  seed.sql           가상 병원 5곳 (데모)
```

기능을 한 파일에 몰아넣지 않았습니다. 화면은 `app/`, 표현은 `components/`,
도메인 규칙은 `features/`와 `lib/`에 있습니다.

---

## 아직 없는 것 (의도적)

기획안 55항 제외 목록은 전부 들어있지 않습니다. 추가로 다음 단계에서 붙습니다.

| 단계 | 내용 |
|---|---|
| 2 | ✅ Supabase 스키마 · RLS · /partner 저장 · 병원 상세 Realtime (Capability 관리 화면은 남음) |
| 3 | **실제 병원 1곳 파일럿** — "어제와 동일" 1클릭이 성립하는지 검증 |
| 4 | Live Status 입력 · 전화상태 · 자동만료 |
| 5 | Visit Intent · ETA · 유입 집계 |
| 6 | Realtime Feed · 카카오 로그인 · Moderation |
| 7 | Admin · Audit · Abuse Prevention |
| 8 | 공공데이터 어댑터 · 지도 어댑터 · 카페 요약 · SEO · PWA |

### 8단계에 넣을 CI lint 룰 (Release Blocker 자동검사)

코드로 검사 가능한 4개입니다. 커밋마다 자동 차단합니다.

1. 사용자 입력이 `hospital_live_status`에 write 하는 경로가 존재하는가
2. 검색 정렬 모듈이 결제·제휴 테이블을 조인하는가
3. URL·query string에 건강정보 키워드가 들어가는가
4. AI 출력 타입에 판단 문자열 필드가 추가되었는가

---

## 확인 필요 (코드 밖)

- 상표 선출원 조사
- 네이버 카페 묶음명 '나이트케어' → CareTime 변경
- 공공데이터포털 개발계정 신청 (응급의료정보 조회 V4 / 전국 병·의원 찾기 / 명절 비상 진료기관)
  — 개발계정은 일 호출 한도가 낮으므로 **배치 동기화 + DB 캐시**가 전제입니다.
- 내원예정 기능 오픈 전, 아동 건강정보의 **제3자(의료기관) 제공 동의 UI** 설계
