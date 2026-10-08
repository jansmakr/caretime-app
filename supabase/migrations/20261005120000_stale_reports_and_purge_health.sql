-- ============================================================
-- 두 가지를 막는다.
--
-- ① 아무도 확인하지 않은 신고가 영원히 남는 것.
--    purge_expired() 는 신고를 state in ('RESOLVED','DISMISSED') 일 때만 지운다.
--    그래서 운영자가 보지 않은 신고는 1년이 지나도 남고, 그 신고가 걸린 글도 함께
--    남는다(분쟁 중 증거를 지키려고 만든 규칙이 반대로 작동한다).
--    방침에 "신고 1년"이라고 쓰면 미처리 건에서는 사실이 아니게 된다.
--
-- ② 크론이 조용히 멈춘 것을 아무도 모르는 것.
--    purge_expired() 는 테스트가 붙들고 있지만, "그 함수가 실제로 매일 불렸는가"는
--    아무도 보지 않았다. 멈춰도 화면은 그대로여서(공개 여부는 읽는 시점에 판정한다)
--    증상이 없다. 그래서 들여다보는 함수를 둔다.
-- ============================================================

-- ── ① 미처리 신고 자동 종결 ─────────────────────────────────
/*
 * 기간을 코드에 흩지 않는다. retention_policy 한 곳에 둔다 — 그래야 TS 상수와
 * 비교하는 테스트가 이 값도 붙든다(tests/retention.realtime.test.ts).
 *
 * keep_days 의 뜻이 이 줄에서만 다르다: '지우기까지'가 아니라 '자동 종결까지'다.
 * note 에 적어 둔다. 기간을 두 곳에 두는 것보다 한 곳에서 뜻을 적는 쪽을 골랐다.
 */
insert into public.retention_policy (subject, keep_days, basis, note) values (
  'reports_unreviewed', 90, '접수 시각',
  '삭제 기한이 아니라 자동 종결 기한이다. 90일 동안 사람이 확인하지 않은 신고는 ' ||
  'DISMISSED 로 바꾸고 moderation_actions 에 auto_dismiss_unreviewed 로 남긴다. ' ||
  '종결된 뒤에는 reports 의 보관 기간(1년)을 따라 지워진다.'
);

create function public.close_stale_reports(p_limit integer default 1000)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer;
  v_count integer;
begin
  select keep_days into v_days
    from retention_policy where retention_policy.subject = 'reports_unreviewed';

  with stale as (
    select r.id, r.target_type, r.target_id
      from reports r
     where r.state in ('OPEN', 'REVIEWING')
       and r.created_at < now() - make_interval(days => v_days)
     limit p_limit
  ),
  closed as (
    update reports set state = 'DISMISSED'
     where id in (select id from stale)
    returning id, target_type, target_id
  )
  /*
   * 왜 기록을 남기는가: "사람이 안 봐서 닫혔다"가 드러나야 한다. 그냥 state 만
   * 바꾸면 나중에 보면 누가 검토해서 기각한 것과 구분되지 않는다.
   * actor_id 는 null 이다 — 사람이 아니라 규칙이 닫았다. (자동 격리와 같은 방식)
   */
  insert into moderation_actions (report_id, target_type, target_id, action, reason_code, actor_id)
    select id, target_type, target_id, 'DISMISS', 'auto_dismiss_unreviewed', null
      from closed;

  get diagnostics v_count = row_count;

  /*
   * ── 격리는 풀지 않는다 ───────────────────────────────────
   * 푸는 쪽을 검토했고, 지금 구조에서는 **보호자에게 보이는 것이 달라지지 않는다.**
   * 현장톡 글의 공개 창은 24시간(public_until)이고 공개 뷰가 그것도 함께 본다.
   * 90일 뒤에 격리를 풀어도 그 글은 이미 공개 기간이 지나 목록에 돌아오지 않는다.
   * 게다가 종결되는 순간 purge_expired() 가 그 글을 지울 수 있게 된다(작성 30일 경과).
   *
   * 그래서 푸는 코드는 "오늘은 아무 효과가 없고, 공개 창이 긴 다른 글 종류가
   * 생기면 그때 조용히 되살리는" 규칙이 된다. 그런 규칙을 미리 심지 않는다.
   * 공개 범위를 넓히는 판단은 그것이 실제로 보이는 때에 따로 한다.
   */

  return coalesce(v_count, 0);
end $$;

revoke all on function public.close_stale_reports(integer) from public, anon, authenticated;

-- ── ② 크론이 도는지 들여다보는 함수 ─────────────────────────
/*
 * 운영에서 이 한 줄로 확인한다:  select * from public.purge_health();
 *
 * pg_cron 이 없는 환경(로컬 일부)에서도 터지지 않는다 — scheduled = false 로 답한다.
 * 삭제가 멈춘 것은 사고가 아니라 지연이지만(이미 보이지 않는 것을 지우는 일이다),
 * 방침에 "N일 후 삭제"라고 쓴 뒤로는 지연도 오래 두면 위반이 된다.
 */
create function public.purge_health()
returns table (
  job_name text,
  scheduled boolean,
  schedule text,
  last_run_at timestamptz,
  last_status text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select j.jobname::text,
           j.active,
           j.schedule::text,
           d.start_time,
           d.status::text
      from cron.job j
      left join lateral (
        select r.start_time, r.status
          from cron.job_run_details r
         where r.jobid = j.jobid
         order by r.start_time desc
         limit 1
      ) d on true
     where j.jobname in ('purge-expired', 'close-stale-reports');
exception
  when others then
    -- pg_cron 이 없거나 읽을 수 없는 환경.
    return query select 'pg_cron 없음'::text, false, null::text, null::timestamptz, null::text;
end $$;

revoke all on function public.purge_health() from public, anon, authenticated;

-- ── 언제 도는가 ─────────────────────────────────────────────
/*
 * 삭제(19:00 UTC = 04:00 KST)보다 한 시간 먼저 닫는다. 그래야 같은 밤에
 * '종결 → 삭제'가 이어진다. 순서가 어긋나도 하루 늦어질 뿐이다.
 */
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule(
      'close-stale-reports',
      '0 18 * * *',
      $cron$select public.close_stale_reports();$cron$
    );
  else
    raise notice 'pg_cron 이 없습니다. close_stale_reports() 를 직접 호출하세요.';
  end if;
exception
  when others then
    raise notice 'pg_cron 스케줄 등록 실패: %. close_stale_reports() 를 직접 호출하세요.', sqlerrm;
end $$;
