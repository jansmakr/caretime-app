# 운영 DB 적용 순서

**사람이 보고 실행하는 문서다.** 명령어를 그대로 복사해 쓸 수 있게 적었다.

지금 migration 5개가 로컬에만 있다. 1차 출시 직전에 올린다 —
지금 올리면 공공데이터 작업 중에 또 바뀐다.

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

### ⚠️ 4와 5는 **쌍이다**

`20260930` 이 `20260929` 가 만든 `field_report_reactions` 를 **비우고**(`delete from`)
컬럼을 바꾼다(`reactor_key` → `guest_id`).

- **4만 적용하면**: anon 이 현장톡에 직접 쓸 수 있는 상태로 남는다. rate limit 도,
  게스트 세션도 없다. anon 키는 브라우저 번들에 들어가는 공개 값이므로, 이 상태로
  배포하면 누구나 제한 없이 글을 넣을 수 있다.
- **둘 사이에 멈추면 안 된다.** 한 번에 이어서 적용한다.

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
```

## 적용 직후 해야 하는 것

1. **환경변수.** `SUPABASE_SERVICE_ROLE_KEY` 가 서버에 있어야 쓰기 라우트가 돈다.
   `NEXT_PUBLIC_` 접두사를 붙이면 안 된다 — 브라우저로 새면 RLS 가 무의미해진다.
2. **`NEXT_PUBLIC_DEMO_CONTENT` 는 설정하지 않거나 `0`.** 가짜 병원·가짜 제보가 켜진다.
3. **`NEXT_PUBLIC_FIELD_TALK_LIVE`** 는 기본 켜짐이다. 문제가 생기면 `0` 으로 재배포 없이
   쓰기만 닫을 수 있다.
4. 제한값을 조이려면 `GUEST_LIMIT_POSTS` 등 (`docs/OPEN-QUESTIONS.md` 2번).

## 되돌리기

**migration 을 되돌리는 스크립트는 없다.** 되돌리려면 손으로 drop 해야 하고,
그 사이에 들어온 글이 사라진다.

그래서 적용 전 확인(맨 위)을 건너뛰지 않는다. 로컬에서 `db reset` 이 처음부터
깨끗하게 돌지 않으면 운영에 올리지 않는다.
