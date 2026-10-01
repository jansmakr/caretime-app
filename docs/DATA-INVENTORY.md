# 보관 항목

개인정보처리방침을 쓰는 데 쓰는 문서다. **실제 스키마를 조회해서 적었다**
(`information_schema.columns`, 2026-10-01 기준). 추측한 칸은 없다.

## ⚠️ 먼저 알아야 할 것 — 삭제가 돌지 않는다

`features/p0/retention.ts` 에 보관 기간 **제안값**이 있지만, 실제로 지우는 작업은 없다.
지금 도는 것은 **공개 중단**뿐이다(`field_reports.public_until` 기본 24시간, 공개 뷰가 거른다).

**방침에 "7일 후 삭제"라고 쓰면 사실과 다르다.** 세션도 글도 지금은 영구 보존된다.
실제 삭제를 붙이는 것은 별도 작업이다.

| 대상 | 공개 중단 (실제로 돎) | 삭제 (제안값, **안 돎**) |
|---|---|---|
| 현장톡 글 | 24시간 | 7일 |
| 리액션 | 15분(집계) | 24시간 |
| 비회원 세션 | — | 7일 |

---

## guest_sessions — 비회원 세션

쿠키 `caretime_guest` (httpOnly · sameSite=lax · 운영에서 secure · 30일)로만 오간다.
**쿠키를 쓰므로 쿠키 사용 고지 의무가 이미 발생했다.**

| 컬럼 | 무엇인가 | 보관 | 개인정보인가 |
|---|---|---|---|
| `id` | 세션 식별자 (uuid) | 영구 (삭제 미구현) | 간접 식별자 — 이 값으로 같은 사람의 글을 묶을 수 있다 |
| `token_hash` | 쿠키 토큰의 **SHA-256 해시**. 원본 토큰은 저장하지 않음 | 영구 | 간접 식별자 |
| `nickname` | 서버가 만든 별명 (예: 차분한수달4821) | 영구 | 아니다 — 무작위 조합, 실명 아님 |
| `created_at` · `last_seen_at` · `expires_at` | 시각 | 영구 | 아니다 |
| `revoked_at` | 해지 시각 | 영구 | 아니다 |
| `policy_version` | 동의한 약관 버전 | 영구 | 아니다. **현재 항상 null — 약관이 아직 없다** |

IP·기기식별자·User-Agent 를 저장하지 않는다.

## field_reports — 현장톡 글

| 컬럼 | 무엇인가 | 보관 | 개인정보인가 |
|---|---|---|---|
| `id` | 글 식별자 (uuid, 클라이언트 생성) | 영구 | 아니다 |
| `category` | 찢어진 상처 / 화상 / 그 밖 | 영구 | 아니다 |
| `topic` | '기타'일 때 주제 직접 입력 (≤30자) | 영구 | **이용자가 적는 자유 입력** |
| `body` | 본문 (≤300자) | 공개 24h / 영구 보존 | **이용자가 적는 자유 입력** |
| `sido` · `sigungu` | 어느 지역 이야기인가 | 영구 | 아니다 — 시군구 단위, 개인 위치가 아님 |
| `hospital_id` · `hospital_name` | 어느 병원 이야기인가 (null 가능) | 영구 | 아니다 |
| `handle` | 별명 사본 | 영구 | 아니다 |
| `guest_id` | 세션 FK. **공개 뷰에 나가지 않는다** | 영구 | 간접 식별자 |
| `created_at` | 작성 시각 | 영구 | 아니다 |
| `visibility` | VISIBLE / QUARANTINED / REMOVED | 영구 | 아니다 |
| `public_until` | 공개 종료 시각 (기본 +24h) | 영구 | 아니다 |
| `version` | 내부 값 | 영구 | 아니다 |

`body`·`topic` 은 자유 입력이라 이용자가 개인정보를 적을 수 있다.
게시 전에 **서버가 전화번호·주민등록번호 모양·이메일·카드번호 길이 숫자를 거른다**
(`features/p0/pii.ts`). 이름처럼 보이는 문자열은 거르지 않는다 — 한국어 이름은 일반
낱말과 구분되지 않아 멀쩡한 글이 계속 막힌다. 그건 안내와 신고로 다룬다.

공개 뷰(`field_reports_public`)가 내보내는 것: `id`·`category`·`topic`·`body`·
`sido`·`sigungu`·`hospital_id`·`hospital_name`·`handle`·`created_at`.
`guest_id`·`visibility`·`public_until`·`version` 은 나가지 않는다.

## field_report_reactions — 반응

| 컬럼 | 무엇인가 | 보관 | 개인정보인가 |
|---|---|---|---|
| `report_id` | 어느 글에 | 영구 | 아니다 |
| `key` | low_wait / doctor_present / closed | 영구 | 아니다 |
| `guest_id` | 누가 눌렀는가 | 영구 | 간접 식별자 |
| `created_at` | 시각 | 영구 | 아니다 |

공개 뷰(`field_report_reaction_counts`)는 **집계만** 내보낸다. `guest_id` 는 나가지 않는다.

## hospital_requests — 목록에 없는 병원 요청

**공개되지 않는다.** RLS 정책이 하나도 없고 운영자가 콘솔에서만 본다.

| 컬럼 | 무엇인가 | 보관 | 개인정보인가 |
|---|---|---|---|
| `id` | 요청 식별자 | 영구 | 아니다 |
| `name` | 이용자가 적은 병원 이름 (2~60자) | 영구 | **자유 입력** |
| `sido` · `sigungu` | 지역 | 영구 | 아니다 |
| `area_hint` | 대략 위치 (동 이름 정도, ≤60자) | 영구 | **자유 입력.** 동 단위이고 상세 주소를 요구하지 않는다 |
| `guest_id` | 누가 요청했는가 | 영구 | 간접 식별자 |
| `created_at` | 시각 | 영구 | 아니다 |
| `state` | OPEN / ADDED / NOT_FOUND / DUPLICATE | 영구 | 아니다 |
| `resolved_hospital_id` | 목록에 넣은 병원 | 영구 | 아니다 |
| `reviewed_at` | 처리 시각 | 영구 | 아니다 |

`name`·`area_hint` 에도 개인정보 필터를 건다 — 운영자만 보는 값이어도 담지 않는다.

## reports — 신고

**공개되지 않는다.** RLS 정책 없음.

| 컬럼 | 무엇인가 | 보관 | 개인정보인가 |
|---|---|---|---|
| `id` | 신고 식별자 | 영구 | 아니다 |
| `target_type` · `target_id` | 무엇을 신고했는가 | 영구 | 아니다 |
| `reporter_guest_id` | 비회원 신고자 | 영구 | 간접 식별자 |
| `reporter_user_id` | 로그인 신고자 (`auth.users`) | 영구 | **식별자.** 현재 쓰이지 않음 — 병원 계정만 로그인한다 |
| `reason` | PRIVACY / SUSPECTED_FALSE / ABUSE / SPAM / DANGEROUS_ADVICE / OTHER | 영구 | 아니다 |
| `detail` | 신고 상세 (≤200자) | 영구 | **자유 입력.** 현재 화면에서 받지 않는다 (이유만 고른다) |
| `state` | OPEN / REVIEWING / RESOLVED / DISMISSED | 영구 | 아니다 |
| `created_at` | 시각 | 영구 | 아니다 |

## moderation_actions — 조치 기록

| 컬럼 | 무엇인가 | 보관 | 개인정보인가 |
|---|---|---|---|
| `id` | 순번 | 영구 | 아니다 |
| `report_id` | 어느 신고로 | 영구 | 아니다 |
| `target_type` · `target_id` | 무엇에 | 영구 | 아니다 |
| `action` | QUARANTINE / REMOVE / RESTORE / DISMISS | 영구 | 아니다 |
| `reason_code` | 사유 코드 (`auto_on_report` 등) | 영구 | 아니다 |
| `actor_id` | 누가 조치했는가 (`auth.users`) | 영구 | **식별자.** 자동 격리는 null — 사람이 아니라 규칙이 내렸다 |
| `created_at` | 시각 | 영구 | 아니다 |

## observations — PRD 계약 표 (**아직 쓰이지 않음**)

`migration 20260927` 이 만든 표다. 현장톡 반응은 `field_report_reactions` 를 쓴다.
둘은 다른 것이다 — 이쪽은 병원 × 카테고리 × 시점이고, 저쪽은 글 하나에 달리는 반응이다.
**현재 0행이고 어느 코드도 쓰지 않는다.** 템플릿·리액션 구조를 PRD 대로 옮기는 턴에 쓰인다.

| 컬럼 | 무엇인가 | 개인정보인가 |
|---|---|---|
| `id` · `hospital_id` · `category` | 무엇에 대한 관찰인가 | 아니다 |
| `guest_id` | 누가 | 간접 식별자 |
| `metric` · `value` | queue / staff / reception + 값 | 아니다 |
| `observed_at` · `expires_at` | 시각 (15분 유효) | 아니다 |
| `active` · `quarantined` · `version` | 운영값 | 아니다 |

---

## 담지 않는 것

이름 · 연락처 · 이메일 · 생년월일 · 성별 · IP · 기기식별자 · User-Agent ·
위치좌표 · 증상 · 진단 · 나이.

보호자에게 **로그인이 없다.** `auth.users` 에는 병원 계정만 있다.

## 처리 위탁

Supabase (데이터베이스 · 인증 · 실시간). 저장 지역은 프로젝트 설정에 따른다 —
운영 프로젝트를 만들 때 확인해서 이 줄을 채워야 한다.
