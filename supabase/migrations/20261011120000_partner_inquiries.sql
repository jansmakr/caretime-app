-- ============================================================
-- 의료기관 사전 신청.
--
-- ⚠️ **운영 DB 에 아직 적용하지 않았다.** 사용자가 dry-run 을 본 뒤 따로 지시한다.
--    (2026-10-11 지시) 적용 순서는 docs/DEPLOY-order.md 의 표를 함께 고친 뒤에 돈다.
--
-- ── 이 표가 다른 표와 다른 점: **개인정보가 들어온다** ────────
-- 지금까지 CareTime 이 저장하는 것은 글 내용과 서버가 만든 별명뿐이었다. 여기에는
-- 병원 담당자가 **스스로 적은 연락처**가 들어온다. 성격이 다르므로 다르게 다룬다.
--
--   · 공개 뷰를 만들지 않는다. anon 이 읽을 수 있는 경로가 없다.
--   · RLS 를 켜고 **정책을 하나도 만들지 않는다.** service_role 만 읽는다.
--     (정책이 없으면 anon·authenticated 는 0행을 본다)
--   · 보관 기간을 둔다. 다른 표와 같은 방식으로 retention_policy 에 적고
--     purge_expired() 가 지운다 — 기간을 코드에 흩지 않는다.
--
-- ── 동의 기록을 행에 같이 남긴다 ─────────────────────────────
-- 화면에서 동의 체크 없이는 제출되지 않는다. 그런데 화면의 체크는 **증거가 아니다** —
-- 화면을 거치지 않는 요청이 있을 수 있고, 나중에 "동의한 적 없다"는 말에 보여 줄
-- 것이 있어야 한다. 그래서 동의 여부를 열로 받고, 체크가 false 면 DB 가 거절한다.
-- 서버도 따로 본다(api/partner-inquiries) — 두 겹으로 막는다.
--
-- ── 왜 partner_applications 를 쓰지 않는가 ───────────────────
-- 그 표(20260927)는 **입점 심사**용이다. 상태 머신(DRAFT→APPROVED)과 증빙 경로가
-- 붙어 있고 로그인한 사용자를 전제한다. 지금 받는 것은 심사가 아니라 "나중에
-- 알려 달라"는 한 줄이고, 로그인이 없다. 둘을 한 표에 넣으면 심사 상태가 비어 있는
-- 행이 쌓여 어느 쪽도 읽을 수 없게 된다.
-- ============================================================

create table public.partner_inquiries (
  id uuid primary key default gen_random_uuid(),

  /** 병원 이름. 담당자 이름이 들어올 수도 있다 — 구분해서 받지 않는다(칸을 늘리지 않는다). */
  hospital_name text not null check (char_length(trim(hospital_name)) between 2 and 60),

  /**
   * 연락처. 전화번호 또는 이메일. **형식을 검사하지 않는다.**
   * 적는 쪽이 받을 수 있는 수단을 적는 것이고, 우리가 모양을 정할 이유가 없다.
   * 개인정보 필터(features/p0/pii)를 **걸지 않는다** — 여기서는 연락처가 목적이다.
   */
  contact text not null check (char_length(trim(contact)) between 3 and 120),

  /** 한 줄 메시지. 선택이다. */
  message text check (char_length(message) <= 500),

  /**
   * 개인정보 수집·이용 동의. **false 면 행이 만들어지지 않는다.**
   * 체크 없이 들어오는 길을 DB 가 막는다 — 화면만 막으면 막은 것이 아니다.
   */
  consented boolean not null default false check (consented = true),

  /** 제한을 세기 위한 것. 공개되지 않는다. 글쓰기와 같은 게스트 세션이다. */
  guest_id uuid references public.guest_sessions (id) on delete set null,

  created_at timestamptz not null default now(),

  /** 운영자가 콘솔에서 바꾼다. NEW → CONTACTED → CLOSED. */
  state text not null default 'NEW' check (state in ('NEW', 'CONTACTED', 'CLOSED'))
);

/*
 * 같은 사람이 같은 병원 이름으로 두 번 넣는 것을 막는다. 실수로 두 번 누르는
 * 경우가 대부분이라 오류로 보지 않고 조용히 같은 결과를 준다(라우트에서 23505 처리).
 * guest_id 가 null 이 되면(세션 정리) 이 제약은 더 이상 걸리지 않는다 — 그래도 된다.
 */
create unique index partner_inquiries_once
  on public.partner_inquiries (guest_id, hospital_name)
  where guest_id is not null;

create index partner_inquiries_queue on public.partner_inquiries (state, created_at desc);

/*
 * **정책을 만들지 않는다.** RLS 만 켜면 anon·authenticated 는 0행을 본다.
 * 운영자는 service_role(콘솔)로 읽는다. 공개 뷰도 만들지 않는다 —
 * 여기 들어오는 것은 연락처다.
 */
alter table public.partner_inquiries enable row level security;

/*
 * 보관 기간 1년. hospital_requests 와 같다.
 *
 * 왜 1년인가: "2027년부터 시작"을 안내하려고 받는 값이다. 그 시점에 연락하려면
 * 그때까지 들고 있어야 하고, 그 뒤로는 들고 있을 근거가 없다. 1년이 지나도록
 * 연락하지 못했다면 그 연락처는 이미 낡았다.
 *
 * 기간은 이 표 한 곳에만 둔다. purge_expired() 가 읽어서 지운다.
 * TS 쪽 사본(features/p0/retention.RETENTION_DAYS)과 테스트가 비교한다.
 */
insert into public.retention_policy (subject, keep_days, basis, note) values (
  'partner_inquiries', 365, '접수 시각',
  '의료기관 사전 신청. 담당자가 스스로 적은 병원명·연락처가 들어 있다. ' ||
  '2027년 서비스 안내를 위해 받은 값이고, 그 뒤로는 들고 있을 근거가 없다. ' ||
  '공개 뷰가 없고 service_role 만 읽는다.'
);

/*
 * purge_expired() 에 블록을 하나 더한다. 함수를 통째로 다시 만든다 —
 * 부분 수정이 안 되는 자리라, 20261007 의 본문에 이 블록만 추가한 것이다.
 */
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
  -- 현장톡 글은 지우지 않는다(migration 20261007). 쌓아 두는 것이 이 서비스의 값이다.

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

  -- ── 의료기관 사전 신청 (이 migration 에서 더했다) ──
  /*
   * 연락처가 들어 있는 유일한 표다. 다른 것보다 먼저 지워도 될 만큼 급하지는
   * 않지만, 빠뜨리면 영영 남는다. 그래서 같은 함수 안에 둔다.
   */
  select keep_days into v_days from retention_policy where retention_policy.subject = 'partner_inquiries';
  with doomed as (
    select p.id from partner_inquiries p
     where p.created_at < now() - make_interval(days => v_days)
     limit p_limit
  )
  delete from partner_inquiries where id in (select id from doomed);
  get diagnostics v_count = row_count;
  return query select 'partner_inquiries'::text, v_count;

  -- ── 신고와 조치 기록 ──
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
