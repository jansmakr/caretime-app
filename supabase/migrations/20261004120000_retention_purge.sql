-- ============================================================
-- 실제로 지운다.
--
-- 지금까지 도는 것은 **공개 중단**뿐이었다(field_reports.public_until, 공개 뷰가 거른다).
-- 보관 기간은 features/p0/retention.ts 에 '제안값'으로만 있었고 아무것도 지우지 않았다.
-- 즉 사실은 영구 보존이다. 방침에 "N일 후 삭제"라고 쓰면 그 자체가 위반이 된다.
--
-- 개인정보는 목적을 다하면 지우는 것이 원칙이고, "현장 상황"은 몇 시간 뒤면 목적을
-- 다한 정보다. 1년 전 "지금 대기 세 명"을 들고 있을 이유가 없다.
--
-- ── 방침에 쓸 숫자와 코드가 갈라지지 않게 ─────────────────────
-- 기간을 코드에 흩지 않고 retention_policy 표 한 곳에 둔다. 삭제 함수가 그 표를 읽고,
-- TS 쪽(features/p0/retention.ts)도 같은 값을 들고 있는지 테스트가 비교한다.
-- 갈라지면 테스트가 깨진다 — 문서와 코드가 어긋난 채로 배포되지 않는다.
-- ============================================================

-- ── 1. 세션을 지울 수 있게 만든다 (지금은 못 지운다) ──────────
/*
 * field_report_reactions.guest_id 가 `on delete set null` 인데 컬럼이 NOT NULL 이다.
 * 세션을 지우려 하면 NOT NULL 위반으로 **삭제 자체가 실패한다.** 그대로 두면
 * 세션 정리가 영원히 안 돈다.
 *
 * cascade 로 바꾼다. 반응은 글에 딸린 집계값이고 공개되는 것은 익명 합계뿐이다.
 * 세션이 30일 비활성이면 그 반응이 달린 글은 공개 기간(24시간)을 한참 지났다 —
 * 카운트가 줄어도 보이는 곳이 없다.
 *
 * guest_id 를 nullable 로 바꾸는 길도 있었지만 그러면 기본키
 * (report_id, key, guest_id)에 NULL 이 들어가 중복 방지가 깨진다. 더 단순한 쪽을 골랐다.
 */
alter table public.field_report_reactions
  drop constraint field_report_reactions_guest_id_fkey,
  add constraint field_report_reactions_guest_id_fkey
    foreign key (guest_id) references public.guest_sessions (id) on delete cascade;

/*
 * hospital_requests.guest_id 는 cascade 였다. 세션을 지우면 요청까지 사라진다 —
 * 요청은 "어느 지역을 먼저 넣어야 하나"의 유일한 근거이고 1년 두기로 했다.
 * 글과 같은 방식으로 연결만 끊는다.
 */
alter table public.hospital_requests
  alter column guest_id drop not null,
  drop constraint hospital_requests_guest_id_fkey,
  add constraint hospital_requests_guest_id_fkey
    foreign key (guest_id) references public.guest_sessions (id) on delete set null;

/*
 * field_reports.guest_id 는 이미 set null 이다. 글은 남고 연결만 끊긴다 — 그게 맞다.
 * 글은 그 자체로 다른 보호자에게 쓸모가 있고, 누가 썼는지는 그 쓸모와 무관하다.
 */

-- ── 2. 기간을 한 곳에 둔다 ──────────────────────────────────
create table public.retention_policy (
  subject text primary key,
  /** 기준 시각으로부터 며칠 뒤 지우는가. */
  keep_days integer not null check (keep_days between 1 and 3650),
  /** 무엇을 기준으로 세는가. 방침 문구에 그대로 쓸 수 있게 적는다. */
  basis text not null,
  note text not null
);

/*
 * 공개 읽기 정책을 만들지 않는다. 방침 페이지에서 보여 주고 싶어지면 그때 따로 연다 —
 * 지금 열 이유가 없고, 공개 범위를 넓히는 일은 따로 판단할 일이다.
 */
alter table public.retention_policy enable row level security;

insert into public.retention_policy (subject, keep_days, basis, note) values
  (
    'field_reports', 30, '작성 시각',
    '공개는 24시간. 그 뒤로도 30일 보관한다 — 신고·이의 제기를 처리할 기간이다. ' ||
    '처리 중인 신고가 걸린 글은 그 신고가 끝날 때까지 지우지 않는다.'
  ),
  (
    'guest_sessions', 30, '마지막 접속 시각',
    '세션이 지워지면 그 세션이 쓴 글은 남고 연결(guest_id)만 끊긴다. ' ||
    '글은 그 자체로 다른 보호자에게 쓸모가 있고 누가 썼는지는 그 쓸모와 무관하다.'
  ),
  (
    'observations', 7, '만료 시각(expires_at)',
    '집계 목적이 끝나면 지운다. 공개 집계는 15분까지만 유효하다. ' ||
    '현장톡 반응(field_report_reactions)은 글에 딸려 있어 글과 함께 지워진다.'
  ),
  (
    'hospital_requests', 365, '접수 시각',
    '다음에 어느 지역을 넣을지 판단하는 근거다. 영구는 아니다 — 1년 전 요청은 ' ||
    '그 지역 사정이 바뀌었을 수 있어 근거로 쓰지 않는다.'
  ),
  (
    'reports', 365, '접수 시각',
    '반복 신고자 판단에 필요하다. 조치 기록(moderation_actions)도 같이 둔다 — ' ||
    '신고만 남고 무엇을 했는지가 사라지면 기록이 아니다.'
  );

-- ── 3. 지우는 함수 ──────────────────────────────────────────
/*
 * 읽기 시점 판정과 어긋나지 않는다.
 *
 * 공개 여부는 지금도 읽는 순간에 정한다(public_until > now(), isExpired). 이 함수는
 * **이미 보이지 않는 것을 지우는** 일만 한다. 그래서 이것이 하루 멈춰도 사용자에게
 * 보이는 것은 바뀌지 않는다 — 크론 실패가 사고가 아니라 지연이다.
 * 그게 처음부터의 원칙이었다: 만료를 스케줄러에 맡기지 않는다.
 *
 * 한 번에 지우는 양에 상한을 둔다. 쌓인 것이 많을 때 한 트랜잭션이 표를 오래 잠그면
 * 그 시간에 글을 쓰려던 사람이 실패한다. 남은 것은 다음 실행이 지운다.
 */
create function public.purge_expired(p_limit integer default 5000)
/*
 * 돌려주는 컬럼 이름에 purged_ 를 붙인다. 그냥 subject 로 두면 retention_policy.subject
 * 와 이름이 겹쳐 함수 안의 where 절이 "ambiguous" 로 실패한다 — 실제로 겪었다.
 */
returns table (purged_subject text, purged_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer;
  v_count integer;
begin
  -- ── 현장톡 글 ──
  select keep_days into v_days from retention_policy where retention_policy.subject = 'field_reports';
  with doomed as (
    select f.id
      from field_reports f
     where f.created_at < now() - make_interval(days => v_days)
       /*
        * 처리 중인 신고가 걸린 글은 남긴다. 분쟁 중에 증거가 사라지면 복구할지
        * 판단할 근거가 없어진다. 신고가 끝나면(RESOLVED·DISMISSED) 다음 실행이 지운다.
        */
       and not exists (
         select 1 from reports r
          where r.target_type = 'post'
            and r.target_id = f.id
            and r.state in ('OPEN', 'REVIEWING')
       )
     limit p_limit
  )
  delete from field_reports where id in (select id from doomed);
  get diagnostics v_count = row_count;
  return query select 'field_reports'::text, v_count;

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
   * 같은 기간이므로 함께 지우는 것이 맞다.
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
   * 깨진다. 그래서 created_at 이 아니라 last_seen_at 을 본다.
   *
   * 이 삭제가 글의 guest_id 를 null 로 만든다(set null). 글은 남는다.
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

/*
 * 아무에게도 실행 권한을 주지 않는다. 크론(postgres)과 service_role 만 부른다.
 * anon 이 부를 수 있으면 남의 글을 지우는 버튼이 생긴다.
 */
revoke all on function public.purge_expired(integer) from public, anon, authenticated;

-- ── 4. 언제 도는가 ──────────────────────────────────────────
/*
 * pg_cron 을 쓴다. Vercel Cron 과 비교해서 고른 이유:
 *   · 앱 배포·네트워크·함수 타임아웃에 의존하지 않는다. DB 안에서 돈다.
 *   · 삭제는 DB 작업이고, 그것을 하려고 HTTP 왕복을 만들 이유가 없다.
 *   · 앱이 안 떠 있어도 돈다.
 *
 * 새벽 4시(KST). 사람이 가장 적게 쓰는 시각이다 — 야간 진료 문의가 끝난 뒤다.
 * pg_cron 은 UTC 로 돈다. 19:00 UTC = 04:00 KST.
 *
 * 로컬에서는 확장이 없을 수 있다. 그때는 스케줄만 건너뛰고 함수는 그대로 쓴다 —
 * 테스트는 함수를 직접 부른다(크론 없이도 검증된다).
 */
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule(
      'purge-expired',
      '0 19 * * *',
      $cron$select public.purge_expired();$cron$
    );
  else
    raise notice 'pg_cron 이 없습니다. 스케줄을 걸지 않았습니다 — purge_expired() 는 그대로 쓸 수 있습니다.';
  end if;
exception
  when others then
    -- 확장을 만들 권한이 없는 환경(로컬 등). 함수는 이미 만들어졌다.
    raise notice 'pg_cron 스케줄 등록 실패: %. purge_expired() 를 직접 호출하세요.', sqlerrm;
end $$;
