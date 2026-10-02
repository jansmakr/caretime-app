# 운영 DB 적용 순서

**사람이 보고 실행하는 문서다.** 명령어를 그대로 복사해 쓸 수 있게 적었다.

지금 migration 10개가 로컬에만 있다. 1차 출시 직전에 올린다.

## 적용 전 확인

```bash
# 1. 로컬에서 처음부터 다시 돌아가는지
supabase db reset
npm run seed:localuser
npm run build
npm run test
npm run test:realtime

# 2. 로컬 스키마가 migration 파일과 같은지 (차이가 있으면 멈춘다)
supabase db diff
# → "No schema changes found" 가 아니면 적용하지 않는다
```

## 순서

| # | 파일 | 무엇을 하는가 |
|---|---|---|
| 1 | `20260915130000_stage2_hospital_live.sql` | 병원 직접입력 4개 표 (이미 운영에 있을 수 있음) |
| 2 | `20260926120000_service_statuses.sql` | 항목별 공식 상태 + 보호자 공개 뷰 2개 |
| 3 | `20260927120000_p0_contract.sql` | PRD 계약 표 (posts·observations·reports·moderation) |
| 4 | **`20260929120000_field_reports.sql`** | 현장톡 글·반응 + broadcast |
| 5 | **`20260930120000_guest_writes.sql`** | 쓰기를 서버 전용으로 + 게스트 세션 연결 |
| 6 | `20261001120000_report_autoquarantine.sql` | 신고 → 즉시 격리 |
| 7 | `20261002120000_hospital_requests.sql` | 목록에 없는 병원 요청 (비공개) |
| 8 | `20261004120000_retention_purge.sql` | 보관 기간 표 + 실제 삭제 + pg_cron 04:00 KST |
| 9 | `20261005120000_stale_reports_and_purge_health.sql` | 미처리 신고 90일 자동 종결 + 크론 상태 조회 |
| 10 | `20261006120000_reporter_unlink.sql` | 신고한 사람의 세션을 지울 수 있게 (제약 완화) |

### ⚠️ 4와 5는 **쌍이다**

`20260930` 이 `20260929` 가 만든 `field_report_reactions` 를 **비우고**(`delete from`)
컬럼을 바꾼다(`reactor_key` → `guest_id`).

- **4만 적용하면**: anon 이 현장톡에 직접 쓸 수 있는 상태로 남는다. rate limit 도,
  게스트 세션도 없다. anon 키는 브라우저 번들에 들어가는 공개 값이므로, 이 상태로
  배포하면 누구나 제한 없이 글을 넣을 수 있다.
- **둘 사이에 멈추면 안 된다.** 한 번에 이어서 적용한다.

### 8·9 는 pg_cron 이 필요하다

둘 다 `pg_available_extensions` 를 보고 없으면 **스케줄만 건너뛴다**(함수는 생긴다).
운영에서 건너뛰어지면 삭제가 돌지 않는다. 적용 후 확인에 그 질의가 있다.

9번은 8번이 만든 `retention_policy` 에 행을 넣으므로 8번 뒤에 와야 한다.
타임스탬프 순서가 이미 그렇다.

### `20261001` 은 마지막이다

`reports` 표(3번)와 `field_reports`(4번)가 모두 있어야 트리거가 걸린다.
먼저 적용하면 없는 표를 참조해서 실패한다.

## 적용

Supabase CLI 가 타임스탬프 순서대로 적용한다. 따로 지정하지 않는다.

```bash
# 어느 프로젝트에 올리는지 먼저 확인한다
supabase projects list
supabase link --project-ref <운영 프로젝트 ref>

# 적용 전에 무엇이 올라가는지 본다
supabase db push --dry-run

# 올린다
supabase db push
```

`db push` 는 아직 적용되지 않은 migration 을 타임스탬프 순으로 전부 올린다.
위 표의 4·5가 그 안에서 연달아 돌므로 둘 사이에 멈추지 않는다.

## 적용 후 확인

```bash
# 스키마가 기대한 모양인지
supabase db diff --linked
# → "No schema changes found"

# 뷰·정책·트리거가 실제로 생겼는지 (Studio SQL 또는 psql)
```

```sql
-- 공개 뷰 4개
select table_name from information_schema.views where table_schema='public' order by 1;
-- → field_report_reaction_counts, field_reports_public,
--    hospital_services_public, observation_counts, posts_public, service_statuses_public

-- anon 이 쓸 수 있는 표가 없어야 한다 (insert 정책 0건)
select tablename, policyname, cmd from pg_policies
 where schemaname='public' and cmd='INSERT' and roles::text like '%anon%';
-- → 0행

-- 신고 자동 격리 트리거
select tgname from pg_trigger where not tgisinternal
   and tgrelid = 'public.reports'::regclass;
-- → quarantine_on_report

-- 삭제·종결 크론이 등록됐는가. **이것을 건너뛰면 삭제가 안 도는 것을 알 수 없다.**
select * from public.purge_health();
-- → purge-expired       | t | 0 19 * * * | ...
--    close-stale-reports | t | 0 18 * * * | ...
-- scheduled 가 f 이거나 행이 없으면 pg_cron 이 없는 것이다. 그러면 방침에 적은
-- 보관 기간이 지켜지지 않는다 — 올린 뒤 바로 본다.

-- 신고자 연결을 끊을 수 있는가. 못 끊으면 세션 삭제가 실패하고, 그러면 그날의
-- 삭제가 전부 멈춘다(증상 없음). 10번 migration 이 올라갔는지 보는 질의다.
select pg_get_constraintdef(oid) from pg_constraint where conname='reports_single_reporter';
-- → CHECK ((NOT ((reporter_guest_id IS NOT NULL) AND (reporter_user_id IS NOT NULL))))
--   '<>' (정확히 하나)가 보이면 아직 안 올라간 것이다.

-- 보관 기간 표가 코드와 같은가 (테스트가 보지만 운영에서도 한 번 본다)
select subject, keep_days from public.retention_policy order by subject;
-- → field_reports 30 / guest_sessions 30 / hospital_requests 365 /
--    observations 7 / reports 365 / reports_unreviewed 90
```

## 배포 리전 — `icn1` (서울)

`vercel.json` 에 박아 뒀다.

```json
{ "regions": ["icn1"] }
```

왜 고정하는가:

1. **지연.** 정하지 않으면 Vercel 기본값 `iad1`(미국 동부)이고, 한국 이용자의 요청이
   태평양을 왕복한다. 야간에 급한 사람이 쓰는 서비스에서 수백 ms 가 붙는다.
2. **방침 문구가 달라진다.** 처리 위탁 칸에 실제 리전을 적어야 하고, 미국이면
   개인정보 국외 이전 고지가 따라온다. 국내에 두면 그 조항이 필요 없다.
   (Supabase 도 `ap-northeast-2` 서울이다 — 둘을 같은 나라에 둔다.)

무료 요금제에서 함수 리전은 **하나만** 고를 수 있다. 하나이므로 통과해야 하지만,
`vercel deploy` 가 리전 때문에 거부되면 그 메시지를 그대로 보고한다.

⚠️ 한 가지는 법무 판단이다: **"리전이 국내"와 "수탁자가 해외 법인"은 다른 문제다.**
저장·처리는 서울에서 일어나지만 Vercel Inc.·Supabase Inc. 는 미국 법인이다.
위탁 고지에 법인명을 적는 것과, 국외 이전 조항이 필요한지는 따로 판단해야 한다.

## 적용 직후 해야 하는 것

1. **환경변수.** `SUPABASE_SERVICE_ROLE_KEY` 가 서버에 있어야 쓰기 라우트가 돈다.
   `NEXT_PUBLIC_` 접두사를 붙이면 안 된다 — 브라우저로 새면 RLS 가 무의미해진다.
2. **`NEXT_PUBLIC_DEMO_CONTENT` 는 설정하지 않거나 `0`.** 가짜 병원·가짜 제보가 켜진다.
3. **`NEXT_PUBLIC_FIELD_TALK_LIVE`** 는 기본 켜짐이다. 문제가 생기면 `0` 으로 재배포 없이
   쓰기만 닫을 수 있다.
4. 제한값을 조이려면 `GUEST_LIMIT_POSTS` 등 (`docs/OPEN-QUESTIONS.md` 2번).
5. **`select * from public.purge_health();`** 를 다음 날 한 번 더 본다.
   `last_run_at` 이 비어 있으면 크론이 등록만 되고 돌지 않은 것이다.

## 되돌리기

**migration 을 되돌리는 스크립트는 없다.** 되돌리려면 손으로 drop 해야 하고,
그 사이에 들어온 글이 사라진다.

그래서 적용 전 확인(맨 위)을 건너뛰지 않는다. 로컬에서 `db reset` 이 처음부터
깨끗하게 돌지 않으면 운영에 올리지 않는다.
