# 답이 안 된 질문

턴을 시작할 때 확인한다. 실제 코드·스키마를 보고 답하고, 답하면 `[해결]`로 옮긴다.

추측으로 채우지 않는다. 확인하지 못한 것은 "확인하지 못함"이라고 적는다 —
모르는 것을 아는 것처럼 적으면 그 다음 판단이 전부 그 위에 쌓인다.

## [열림]

(없음)

## [해결]

### 1. 지역 단위 — 컬럼 이름과 형태. 시군구로 걸러 볼 수 있는가?

*확인: 2026-09-29, `field_reports` 스키마 + `ChatFilterBar` · `service.filterMessages`*

```
field_reports.sido    text  null 허용
field_reports.sigungu text  null 허용
constraint field_reports_region check (sigungu is null or sido is not null)
index field_reports_region_lookup on (sido, sigungu, created_at desc)
```

전부 null 이면 "지역을 특정하지 않은 글"이다. 시군구만 있고 시도가 없는 글은
저장되지 않는다 — 어디인지 알 수 없기 때문이다.

**필터는 동작한다.** `ChatFilterBar` 에 시도·시군구·병원 드롭다운이 있고
`filterMessages` 가 거른다. 단 **클라이언트 필터**다 — 서버가 준 최근 100건
(`FIELD_REPORT_PAGE`) 안에서만 거른다.

남은 일: 글이 늘면 서버 쿼리로 옮겨야 한다. 인덱스는 이미 있다.

### 2. rate limit 수치 — 몇 건인가? 환경변수로 뺐는가?

*확인: 2026-09-29, `features/p0/limits.ts` · `features/p0/serverLimits.ts`*

| 대상 | 창 | 허용 |
|---|---|---|
| 글 | 30초 | 1건 |
| 글 | 1시간 | 10건 |
| 글 | 24시간 | 30건 |
| 반응 | 10초 | 5건 |
| 반응 | 1시간 | 60건 |
| 신고 | 1시간 | 5건 |
| 같은 내용 재등록 | 10분 | 차단 |

PRD §3.1 표 그대로다. 분당 규칙은 따로 두지 않았다 — 30초 규칙이 그 자리를 한다.

**환경변수로 뺐다.** `GUEST_LIMIT_POSTS` · `GUEST_LIMIT_REACTIONS` ·
`GUEST_LIMIT_REPORTS` · `GUEST_LIMIT_DUPLICATE_MINUTES`.
형식은 `창초:건수` 를 쉼표로 이은 것(`30:1,3600:10,86400:30`).
`NEXT_PUBLIC_` 을 붙이지 않았다 — 브라우저가 한계를 알면 맞춰 쓰는 경로가 생긴다.

틀린 값이 들어오면 **전체를 버리고 기본값을 쓴다.** 반만 적용하지 않는다.
조용히 무제한이 되는 것이 가장 나쁜 실패다.

판정은 서버 라우트가 한다(`/api/field-reports`). 클라이언트 쿨다운(5초)은 남아 있지만
그것만으로는 아무것도 막지 못한다 — anon 키는 공개 값이라 화면을 거치지 않고 쓸 수 있다.

### 3. 저장 중인 항목 전부 + 보관 기간

*확인: 2026-09-29, `information_schema.columns` 직접 조회*

#### guest_sessions — 비회원 세션

| 컬럼 | 내용 |
|---|---|
| `id` | uuid |
| `token_hash` | 쿠키 토큰의 **SHA-256 해시**. 원본 토큰은 저장하지 않는다 |
| `nickname` | 서버가 만든 별명 (예: 차분한수달4821) |
| `created_at` · `last_seen_at` · `expires_at` | 시각 |
| `revoked_at` | 해지 시각 (null = 살아 있음) |
| `policy_version` | 동의한 약관 버전. **현재 항상 null** — 약관이 아직 없다 |

쿠키: `caretime_guest`, httpOnly · sameSite=lax · 운영에서 secure, 30일.
**쿠키를 쓰므로 쿠키 사용 고지 의무가 이미 발생했다.**

#### field_reports — 현장톡 글

| 컬럼 | 내용 |
|---|---|
| `id` · `category` · `topic` · `body` | 글 (본문 ≤300자) |
| `sido` · `sigungu` · `hospital_id` · `hospital_name` | 지역·병원 |
| `handle` | 별명 사본 |
| `guest_id` | 세션 FK. **공개 뷰에 나가지 않는다** |
| `created_at` · `visibility` · `public_until` · `version` | 운영값 |

#### field_report_reactions — 반응

`report_id` · `key` · `guest_id` · `created_at`

#### 담지 않는 것

이름 · 연락처 · 이메일 · 생년월일 · IP · 기기식별자 · 위치좌표 · 증상 · 나이.
로그인 개념 자체가 없다.

#### 보관 기간 — **제안값만 있고 실제 삭제는 돌지 않는다**

`features/p0/retention.ts` 의 제안값:

| 대상 | 공개 중단 | 삭제 |
|---|---|---|
| 현장 글 | 24시간 | 7일 |
| 리액션 | 15분(집계) | 24시간 |
| 비회원 세션 | — | 7일 |

DB 에서 실제로 도는 것은 **공개 중단뿐**이다(`public_until` 기본 24시간, 공개 뷰가 거른다).
`purge` 작업은 없다. 세션도 글도 지금은 영구 보존된다.

**개인정보처리방침에 이 차이를 반영해야 한다.** "7일 후 삭제"라고 쓰면 사실과 다르다.
실제 삭제를 붙이는 것은 6-a 이후 별도 작업이다.
