-- ============================================================
-- 글을 쌓는다. 지우지 않고, 24시간 뒤에 감추지도 않는다.
--
-- 왜 바꾸는가: "로뎀 밤 10시까지" 같은 동네 정보는 몇 년 뒤에도 유효하다. 지금 구조는
-- 그 글을 24시간 뒤에 목록에서 빼고(public_until) 30일 뒤에 지웠다. 카페처럼 쌓아
-- 두면 뒤에 오는 보호자가 찾아 읽을 수 있다.
--
-- ⚠️ **자동 삭제를 끄는 것만으로는 쌓이지 않는다.** 공개 뷰가 `public_until > now()`
--    로 걸러서, 지우지 않아도 하루 뒤에는 보이지 않았다. 그래서 둘을 함께 끈다.
--    운영 글이 0건인 지금이 바꿀 수 있는 유일한 때다 — 이미 "24시간 공개"로 받은
--    글이 있으면 나중에 넓히는 것은 수집 당시의 약속을 바꾸는 일이 된다.
--
-- 지우는 길은 그대로 남는다. **자동 삭제만 끈다.**
--   · 본인 삭제 (DELETE /api/field-reports/[id] → visibility = REMOVED)
--   · 신고 자동 격리 (트리거)
--   · 세션·요청·신고·조치·관찰의 보관 기간과 크론
-- ============================================================

-- ── 1. 본문 길이 1000자 ─────────────────────────────────────
/*
 * 음성 입력을 쓰기 때문이다. 키보드 마이크로 말하면 300자는 말하다 잘린다.
 * 화면에도 남은 글자 수를 보여 준다(ChatComposer).
 */
alter table public.field_reports
  drop constraint field_reports_body_check,
  add constraint field_reports_body_check check (char_length(body) between 1 and 1000);

-- ── 2. 공개 기간을 없앤다 ───────────────────────────────────
/*
 * 컬럼을 지우지 않는다. nullable 로 바꾸고 default 를 뗀다.
 *   null       = 기간 제한 없음 (지금 모든 글)
 *   값이 있음  = 그 시각까지만 공개
 * 2차에 "지금 상황" 글처럼 짧게만 공개하고 싶은 종류가 생기면 그때 값을 넣는다.
 * 지우면 그 선택지가 사라지고, 되살리려면 또 migration 을 쓴다.
 */
alter table public.field_reports
  alter column public_until drop default,
  alter column public_until drop not null;

update public.field_reports set public_until = null where public_until is not null;

/*
 * 공개 뷰 둘이 같은 조건을 들고 있었다. 둘 다 고친다 — 한쪽만 고치면 글은 보이는데
 * 반응 수는 0으로 보이는 상태가 된다.
 */
create or replace view public.field_reports_public as
  select
    r.id,
    r.category,
    r.topic,
    r.body,
    r.sido,
    r.sigungu,
    r.hospital_id,
    r.hospital_name,
    r.handle,
    r.created_at
  from public.field_reports r
  where r.visibility not in ('QUARANTINED', 'REMOVED')
    and (r.public_until is null or r.public_until > now());

create or replace view public.field_report_reaction_counts as
  select
    x.report_id,
    x.key,
    count(*)::integer as count
  from public.field_report_reactions x
  join public.field_reports r on r.id = x.report_id
  where r.visibility not in ('QUARANTINED', 'REMOVED')
    and (r.public_until is null or r.public_until > now())
  group by x.report_id, x.key;

-- ── 3. broadcast 도 같은 판정을 쓴다 ────────────────────────
/*
 * 전에는 `public_until <= now()` 면 내보내지 않았다. 지금은 그 값이 null 이라
 * 그 가지가 영원히 참이 아니지만, 값이 있는 글이 생기면 뜻이 달라진다.
 * 뷰와 같은 식으로 맞춘다 — 두 곳이 갈라지면 "목록엔 없는데 실시간으로 뜨는 글"이 생긴다.
 */
create or replace function public.broadcast_field_report() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- 격리·삭제된 글은 내보내지 않는다. 이미 받은 쪽에는 사라졌다고 알린다.
  if new.visibility in ('QUARANTINED', 'REMOVED') then
    perform realtime.send(
      jsonb_build_object('id', new.id),
      'field_report_removed',
      'field-reports',
      true
    );
    return null;
  end if;

  if new.public_until is not null and new.public_until <= now() then
    return null;
  end if;

  perform realtime.send(
    jsonb_build_object(
      'id', new.id,
      'category', new.category,
      'topic', new.topic,
      'body', new.body,
      'sido', new.sido,
      'sigungu', new.sigungu,
      'hospital_id', new.hospital_id,
      'hospital_name', new.hospital_name,
      'handle', new.handle,
      'created_at', new.created_at
    ),
    'field_report',
    'field-reports',
    true
  );
  return null;
end $$;

-- ── 4. 서버가 지역·기간으로 거를 수 있게 ───────────────────
/*
 * 목록을 서버 쿼리로 옮긴다. 전에는 최신 100건을 받아 브라우저가 걸렀다 — 글이 쌓이면
 * **"내 구 보기"가 그 100건 밖의 글을 못 본다.** 강서구 글이 안 보이는 날이 온다.
 *
 * 글에 붙는 지역은 '글쓴이의 구'다. 그래서 거르는 조건은 sigungu 하나이고, 기존
 * (sido, sigungu, created_at) 인덱스는 선두 컬럼이 sido 라 쓰이지 않는다.
 */
/*
 * 전국 최신순은 20260929 가 만든 field_reports_recent (created_at desc, id desc) 가
 * 이미 받는다. 같은 이름으로 또 만들려다 파일 전체가 롤백됐다 — 이름이 겹치면
 * CLI 가 migration 하나를 통째로 되돌린다. 새로 필요한 것은 구 하나다.
 */
create index field_reports_sigungu_recent on public.field_reports (sigungu, created_at desc);

-- ── 5. 글의 자동 삭제를 끈다 ───────────────────────────────
/*
 * 기간 표에서 행을 뺀다. 표가 단일 소스이므로 여기서 빠지면 삭제 함수도 함께 멈춘다.
 * TS 쪽 사본(features/p0/retention.RETENTION_DAYS)에서도 뺀다 — 비교 테스트가 둘을
 * 묶고 있어서 한쪽만 빼면 깨진다.
 *
 * 다른 표의 기간은 그대로다. 세션 30일 · 요청 1년 · 신고 1년 · 조치 1년 · 관찰 7일.
 */
delete from public.retention_policy where subject = 'field_reports';

create or replace function public.purge_expired(p_limit integer default 5000)
returns table (purged_subject text, purged_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer;
  v_count integer;
begin
  /*
   * 현장톡 글은 지우지 않는다(migration 20261007). 쌓아 두는 것이 이 서비스의 값이다.
   * 지우는 길은 본인 삭제와 신고 격리로 남아 있고, 그 둘은 사람이 누른다.
   */

  -- ── 관찰(PRD 표. 현재 미사용) ──
  select keep_days into v_days from retention_policy where retention_policy.subject = 'observations';
  with doomed as (
    select o.id from observations o
     where o.expires_at < now() - make_interval(days => v_days)
     limit p_limit
  )
  delete from observations where id in (select id from doomed);
  get diagnostics v_count = row_count;
  return query select 'observations'::text, v_count;

  -- ── 의료기관 추가 요청 ──
  select keep_days into v_days from retention_policy where retention_policy.subject = 'hospital_requests';
  with doomed as (
    select h.id from hospital_requests h
     where h.created_at < now() - make_interval(days => v_days)
     limit p_limit
  )
  delete from hospital_requests where id in (select id from doomed);
  get diagnostics v_count = row_count;
  return query select 'hospital_requests'::text, v_count;

  -- ── 신고와 조치 기록 ──
  /*
   * 조치 기록을 먼저 지운다. reports 를 지우면 moderation_actions.report_id 가
   * set null 이 되어 "어느 신고로 내렸는지"를 잃은 기록이 남는다.
   */
  select keep_days into v_days from retention_policy where retention_policy.subject = 'reports';
  delete from moderation_actions
   where created_at < now() - make_interval(days => v_days);
  get diagnostics v_count = row_count;
  return query select 'moderation_actions'::text, v_count;

  with doomed as (
    select r.id from reports r
     where r.created_at < now() - make_interval(days => v_days)
       and r.state in ('RESOLVED', 'DISMISSED')
     limit p_limit
  )
  delete from reports where id in (select id from doomed);
  get diagnostics v_count = row_count;
  return query select 'reports'::text, v_count;

  -- ── 게스트 세션 ──
  /*
   * 마지막 접속 기준이다. 쓰는 사람의 세션을 끊으면 별명이 바뀌고 "아까 그 사람"이
   * 깨진다. 이 삭제가 글의 guest_id 를 null 로 만든다(set null). 글은 남는다 —
   * 이제는 기간 때문에도 지워지지 않는다.
   */
  select keep_days into v_days from retention_policy where retention_policy.subject = 'guest_sessions';
  with doomed as (
    select g.id from guest_sessions g
     where g.last_seen_at < now() - make_interval(days => v_days)
     limit p_limit
  )
  delete from guest_sessions where id in (select id from doomed);
  get diagnostics v_count = row_count;
  return query select 'guest_sessions'::text, v_count;
end $$;

revoke all on function public.purge_expired(integer) from public, anon, authenticated;
