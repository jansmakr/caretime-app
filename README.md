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

## 테스트

묶음이 둘이고 **전제가 다릅니다.**

```bash
npm run test            # 빠른 묶음. 순수 로직 + 로컬 DB HTTP 조회 (약 5초)
npm run test:realtime   # 느린 묶음. 웹소켓·서버 응답 본문 (약 30초)
```

`npm run test` 는 `supabase start` 로 로컬 스택이 떠 있어야 합니다.

`npm run test:realtime` 은 **그 위에 `npm run build` 가 먼저 돌아 있어야 합니다.**
미들웨어 테스트가 실제로 서버를 띄워 응답 본문을 봅니다 — "화면이 가려지는가"가 아니라
"본문이 없는가"를 확인하는 것이 그 테스트의 목적이라 빌드된 서버가 필요합니다.

순서:

```bash
supabase start
npm run seed:localuser   # db reset 뒤에는 다시
npm run build
npm run test
npm run test:realtime
```

빌드를 잊고 돌리면 테스트가 그 이유를 말하고 실패합니다. "테스트가 깨졌다"로 읽지 마세요.

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

### 9. 보호자 제보는 병원 확인 정보로 승격되지 않는다

`src/features/reports/` · `src/components/hospital/Report*.tsx`

병원 상세에 보호자 실시간 제보(피드 + 작성 폼)가 있습니다. 여기서 들어온 값은
**계층 ④(병원 직접확인)로 올라갈 길이 없습니다.**

- `UserReport.source`는 `"user"` 리터럴입니다. 인자로 받지 않으므로 다른 출처로 저장될 수 없습니다.
- `features/reports`는 `hospital_live_status` 등 병원 상태를 쓰는 함수를 import하지 않습니다.
  (8단계 CI lint 룰 1번이 검사할 경로를 애초에 만들지 않았습니다)
- 피드의 모든 항목에 `SourceBadge source="user"`(비어 있는 점선 원 · "사용자 공유 · 미확인")가 붙고,
  병원 확인 카드와 **다른 카드**에 들어갑니다. 한 면에 섞으면 보호자가 둘을 구분하지 못합니다. (12항)
- 면책 문구(`LiveInfoNotice`)는 **읽는 자리와 쓰는 자리 양쪽에 고정**입니다. 접는 컨트롤이 없습니다.
  문장은 `lib/copy.ts`의 `USER_REPORT_DISCLAIMER` 한 곳에만 있습니다.

입력 설계에서 지킨 것:

- **세지 않은 것과 0명은 다른 사실** — 대기 인원 Stepper의 기본값은 `null`("확인 못 함")이고,
  0명에서 `−`를 누르면 다시 `null`로 돌아갑니다. 추정값을 기본값으로 넣지 않습니다.
- **템플릿은 질문만 채운다** — 카테고리 칩(열상 / 화상 / 기타)을 누르면 확인할 항목이 줄로 채워지지만
  답은 비어 있습니다. 예시 답을 미리 넣으면 확인하지 않은 내용이 그대로 올라갑니다.
  줄이 하나도 채워지지 않으면 등록을 막습니다(`isTemplateUnfilled`).
- **잘못 누른 칩이 글을 지우지 않는다** — 본문이 비어 있거나 직전 템플릿 그대로일 때만 교체합니다
  (`shouldReplaceBody`).
- **수기 입력 병원은 끝까지 `hospitalId`가 없다** — 목록에 없는 의료기관은 이름이 **정확히** 같은
  제보끼리만 함께 보입니다. 비슷한 이름을 같은 병원으로 묶지 않습니다(오연결은 되돌릴 수 없습니다).

> 지금 제보는 브라우저 메모리에만 쌓입니다(새로고침하면 사라지고, 화면이 그 사실을 문장으로 알립니다).
> 저장소는 `subscribe`/`getSnapshot` 모양이라 6단계에서 화면 코드를 고치지 않고 Supabase 테이블로 교체합니다.
> 데모 제보 3건은 `renderedAt`을 기준으로 만드는 순수 함수라 서버·브라우저가 같은 값을 만듭니다
> (상대시각에서 hydration이 어긋나지 않게).

### 10. 현장톡은 병원 상세에 묶이지 않는다

`src/app/(consumer)/chat/page.tsx` · `src/features/chat/` · `src/components/chat/`

같은 사용자 공유 계층인데도 제보 피드와 화면을 따로 둔 이유는 **방향이 다르기 때문**입니다.
제보는 다녀온 사람이 남기는 기록이고, 현장톡은 지금 묻고 답하는 대화입니다. 대화를 병원 상세
안에 묶으면 질문이 병원 1곳에 갇혀서 아무도 답하지 않습니다.

- **지역·병원 필터는 좁히는 방향으로만** — 필터에 값이 있으면 그 값과 같은 글만 남습니다.
  지역을 특정하지 않은 글은 '전체'에서만 보입니다. 관련 있어 보이는 글을 임의로 끌어오면
  "이 병원 이야기"인 줄 알고 읽게 됩니다.
- **없는 지역은 고를 수 없다** — 시/도 목록은 실제 의료기관 주소에서 뽑습니다(`sidoOptions`).
  고를 수는 있는데 결과가 0건인 조합을 만들지 않습니다.
- **빈 목록은 이유를 말한다** — 필터 때문인지 글이 없는 건지 구분해서 안내하고, 필터가 걸려
  있으면 '전체 보기'를 같이 냅니다. 목록 건수도 `2 / 5건`으로 표기합니다.
- **보낸 글은 보고 있던 방으로 간다** — 입력창의 범위는 현재 필터를 따라갑니다. 강서구를 보다가
  보낸 글이 다른 지역에 붙으면 답이 오지 않습니다.
- **작성자는 익명 표시명뿐** — `강서구맘` · `야간지킴이` 형태로 이 브라우저에서만 만듭니다(→ 12항).
  계정(카카오 로그인)은 6단계입니다.
- 퀵 템플릿은 제보와 같은 3분할(열상 · 화상 · 기타)이고 라벨도 같은 표를 읽지만, 문구는
  **질문형**입니다("· 지금 봉합 가능한가요?"). 답을 미리 채우지 않는 규칙은 같습니다.

하단 메뉴가 3개에서 4개로 늘었습니다. 규칙의 뜻은 개수가 아니라 "보호자 화면과 병원·관리자
화면을 섞지 않는다"이므로 보호자용 대화방은 여기에 둡니다. 5개가 되려 할 때는 먼저 무엇을
뺄지 정합니다.

### 12. 초기 활성화 3종은 "쓰기 전에 읽히는" 순서로 둔다

`components/home/HomeLiveFeed.tsx` · `features/chat/{nickname,reactions,share}.ts`

야간에 이 앱을 처음 여는 사람에게 필요한 건 검색 결과보다 방금 다녀온 보호자의 한 줄입니다.
그래서 라이브 피드를 검색 바 바로 아래(`#live-feed`)에 둡니다.

**① 원터치 등록 — 로그인 없이**

- 닉네임은 첫 글을 쓸 때 만들어 `localStorage` 에 둡니다(`caretime.chat.nickname`).
  저장소를 못 쓰는 환경(시크릿 모드)에서도 죽지 않고 메모리에만 남습니다.
- **지역 이름은 실제로 아는 경우에만 붙입니다.** `영등포지킴이` 같은 닉네임은 읽는 사람에게
  "영등포에 있는 사람"으로 읽힙니다. 무작위로 지역을 붙이면 근거 없는 지역 신뢰도를 만들어
  냅니다. 보호자가 직접 고른 지역이 있으면 그것을 쓰고(`강서구맘`), 없으면 시간대 낱말을
  씁니다(`야간지킴이`). 지역을 추측해서 채우지 않는 규칙은 화면 전체에서 같습니다.
- 스팸 방지는 5초 쿨다운입니다(`CHAT_COOLDOWN_MS`). 판정을 화면에 맡기지 않고 store 에
  두었습니다 — 홈과 `/chat` 두 곳에서 보낼 수 있으므로 한쪽에서 잠근 것이 다른 쪽에 통해야
  합니다. 서버 차단·신고(Moderation)는 7단계입니다.

**② 원클릭 빠른 반응**

`[대기 3명 이하 👍] [선생님 계심 🩺] [접수 마감됨 ⚠️]` 세 개로 고정합니다. 늘리면 "무엇을
누르는 버튼인지" 고민하는 시간이 생기고 그 순간 원클릭이 아니게 됩니다.

- 한 브라우저가 같은 반응을 **한 번만** 올립니다. 다시 누르면 내려갑니다. 연타로 부풀릴 수
  있으면 그 숫자는 아무 뜻이 없어집니다.
- 숫자를 크게 쓰지 않습니다. 보호자들의 체감이지 병원이 센 값이 아니며, 같은 카드에
  `사용자 공유 · 미확인` 배지가 붙어 있습니다. `HospitalWaitingStatus` 로 올라가는 경로는 없습니다.

**③ 공유 카드**

`navigator.share` → 클립보드 → 임시 textarea 순으로 내려갑니다. 어느 환경에서도 "아무 일도
일어나지 않는" 결과가 나오지 않게 단계를 둡니다. 사용자가 공유 시트를 닫은 것(`AbortError`)은
실패로 보지 않습니다 — 취소는 취소입니다.

- 문구는 `[케어타임 실시간 현장] {병원명/지역} - {카테고리} 최신 현황 확인하기` 로 끝냅니다.
  **지금 값을 복사해 나르지 않습니다.** 링크는 몇 시간 뒤에도 열리는데 그때 상황은 이미 다르므로,
  "지금 진료 가능" 같은 확정적인 말을 공유 텍스트에 넣지 않고 보러 오게 합니다.
- 병원이 특정된 글은 그 병원 상세로 보냅니다. 거기에 의료기관이 확인한 정보와 제보가 함께 있습니다.

> 홈과 `/chat` 은 요청 시각을 읽으므로 `force-dynamic` 입니다. 정적 생성하면 빌드 때 찍힌
> 시각이 박혀 배포 직후 "3시간 전"부터 시작합니다.

### 11. 무료 입점 안내가 /partner 의 첫 화면이다

`src/components/partner/PartnerJoin.tsx` · `src/features/partner-apply/`

보호자 화면 헤더의 `[무료] 의료기관 참여`를 누르면 로그인 폼이 아니라 입점 안내가 나옵니다.
계정은 운영팀이 발급하므로(2단계: Allow new users to sign up을 끕니다) 처음 온 의료기관에는
넣을 아이디가 없습니다. 이미 계정이 있는 병원은 작은 링크로 로그인 폼으로 넘어갑니다.

- **"무료" 바로 아래에 "검색 순서에 영향 없음"을 같이 적습니다.** 무료를 앞세운 자리에서
  노출·정렬을 약속하면 그때부터 정렬축이 하나가 아니게 됩니다. (Release Blocker 8)
- **받지 않는 것: 사업자번호 · 요양기관번호 · 결제수단.** 심사·정산 항목을 받기 시작하면
  "돈 낸 병원"을 구분할 데이터가 생깁니다. 신청서는 운영팀이 연락할 수 있을 만큼만 받습니다
  (병원명 · 지역 · 담당자명 · 연락처 · 주요 진료분야).
- **연락처 검증은 형식을 촘촘히 막지 않습니다** — 숫자나 `@`가 있는지만 봅니다. 내선·담당
  시간 메모처럼 실제로 연락 가능한 표기를 거절하지 않으려는 것입니다.
- **담당자명·연락처는 보호자 화면에 나오지 않습니다.** 메모리에만 두고 로그로 내보내지 않습니다.
- **"공식 병원 인증 뱃지 무료 발급"은 출처 표시를 뜻합니다.** 참여하면 직접 입력한 정보에
  `🟢 의료기관 직접확인` 배지가 붙습니다. 안내 화면에서 실제 `SourceBadge` 를 그대로 보여주고,
  같은 카드 안에 **"진료 수준을 평가하거나 인증하지 않으며, 뱃지가 노출 순서를 바꾸지도 않습니다"**를
  적었습니다. '인증'이 진료 품질 보증으로 읽히면 CareTime 이 하지 않는 일을 약속하게 됩니다.

> 접수 테이블과 알림은 아직 없습니다. 그래서 접수 화면이 보낸 내용을 되돌려 보여주고,
> **"지금은 이 브라우저에만 저장됩니다"**를 명시합니다. 테이블이 생기면 `submitApplication`
> 안쪽만 바뀝니다.

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
      page.tsx                  홈 (상황 입력 + 라이브 피드 · 원터치 등록)
      search/page.tsx           검색 결과
      hospital/[id]/page.tsx    병원 상세
      chat/page.tsx             실시간 현장톡 (오픈 대화방 · 지역/병원 필터)
      live/page.tsx             실시간 (5단계 자리)
      more/page.tsx             더보기 (7단계 자리)
    partner/                    병원 파트너 화면 (상단 헤더 탭)
      page.tsx                  오늘 상태 · 진료시간 · 전화 · 대기 · 내원예정 카운터
                                (비로그인: 무료 입점 안내 + 참여 신청 폼)
      incoming/page.tsx         내원예정 목록
      capabilities/page.tsx     등록 진료기능
  components/
    common/   SourceBadge · StatusPill · DemoNotice · EmergencyCallout · PartnerCta · LiveInfoNotice · Toast
    layout/   AppHeader · BottomNav
    home/     HomeSearchForm · HomeLiveFeed(라이브 피드 · 원터치 등록)
    search/   HospitalCard
    chat/     ChatRoom · ChatComposer · ChatFilterBar · ChatReactions · ShareButton
    partner/  PartnerHeader · PartnerGate(진입 조건) · PartnerJoin(입점 안내·신청) · ChoiceGroup · 상태/시간/전화/대기 카드 · IncomingCounter
    hospital/ HospitalDetail (실시간 구독 화면) · ReportFeed · ReportForm · ReportTargetPicker · WaitingStepper
  features/
    search-session/  types · extract(규칙 파서) · SearchSessionProvider
    hospitals/       types · labels · mock · service · rows(DB↔도메인) · repository · realtime · useHospitalLive
    reports/         types · templates(카테고리 가이드) · regions · directory(자동완성) · service · store · seed · useReportFeed
    chat/            types · templates(질문형 퀵 템플릿) · service(필터 규칙) · reactions · nickname · share · store · seed · useChatRoom
    partner-apply/   types · service(신청 검증) · store
    partner/         types · service(입력 규칙) · mock · supabaseBackend · PartnerProvider
  lib/
    freshness.ts     신선도·만료 판정 (단일 지점)
    relativeTime.ts  '방금 전 / 10분 전' (제보·현장톡 공용 단일 지점)
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
| 6 | Realtime Feed · 현장톡(/chat) — 화면·입력 규칙 ✅ / 저장·공유 테이블은 남음 · 카카오 로그인 · Moderation |
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
