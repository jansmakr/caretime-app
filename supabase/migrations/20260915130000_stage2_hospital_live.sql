-- ─────────────────────────────────────────────────────────────
-- CareTime 2단계 — 병원 기본정보 · 진료기능 · 병원 직접입력 상태
--
-- 설계 규칙 (src/features/hospitals/types.ts 와 1:1)
--  ① 정보 계층을 테이블 단계에서 섞지 않는다.
--     공공(hospitals) / 진료기능(hospital_capabilities) / 병원 직접확인(live·hours·contact·waiting)
--  ② 병원 테이블에 결제·제휴 컬럼을 두지 않는다. (Release Blocker 8)
--  ③ 병원 직접입력 테이블은 소속 병원 계정만 쓸 수 있다. 보호자(anon)는 읽기만. (Release Blocker 1)
--  ④ 확인시각(verified_at)은 클라이언트가 보낸 값을 믿지 않고 DB 시각으로 찍는다.
--  ⑤ 만료시각은 확인시각 + 24시간을 넘을 수 없다. 오래된 상태가 현재처럼 남지 않게. (Release Blocker 2)
--  ⑥ 현재 대기와 내원예정은 테이블부터 분리한다. 내원예정은 5단계에서 별도 테이블로 붙는다.
-- ─────────────────────────────────────────────────────────────

-- ── 타입 ─────────────────────────────────────────────────────
create type public.info_source as enum ('hospital', 'public', 'operator', 'user');
create type public.live_status_code as enum ('normal', 'partial', 'paused', 'difficult');
create type public.limit_reason_code as enum (
  'staff', 'specialist_absent', 'in_procedure', 'emergency', 'crowded', 'equipment', 'space', 'custom'
);
create type public.contact_status_code as enum ('available', 'busy', 'difficult', 'prefer_app');
create type public.waiting_level as enum ('light', 'normal', 'crowded', 'very_crowded', 'check_needed');
create type public.capability_group as enum ('facial', 'hand', 'burn', 'other');
create type public.mapping_status as enum ('standard', 'mapped', 'pending');
create type public.member_role as enum ('owner', 'staff');

-- ── 진료일 ───────────────────────────────────────────────────
-- 야간 진료가 자정을 넘기므로 진료일은 KST 05:00 에 바뀐다. (src/lib/kst.ts 와 같은 규칙)
create function public.kst_service_date(ts timestamptz)
returns date
language sql
immutable
set search_path = ''
as $$
  select ((ts at time zone 'Asia/Seoul') - interval '5 hours')::date
$$;

-- ── 표준 진료기능 ───────────────────────────────────────────
create table public.capabilities (
  id text primary key,
  label text not null,
  "group" public.capability_group not null
);

-- ── 병원 기본정보 (공공 계층) ───────────────────────────────
-- 병원 계정은 이 테이블을 수정할 수 없다. 공공데이터 동기화(8단계)·운영자만 쓴다.
create table public.hospitals (
  id text primary key,
  hpid text not null unique,
  name text not null,
  address text not null,
  tel text not null,
  lat double precision not null,
  lng double precision not null,
  synced_at timestamptz not null default now(),
  -- 참여 의료기관 여부. 정렬에 쓰지 않는다.
  is_participating boolean not null default false,
  -- 평소 진료시간 (KST 벽시계). close <= open 이면 자정을 넘긴다.
  regular_open time,
  regular_close time,
  regular_hours_source public.info_source not null default 'public',
  regular_hours_verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint hospitals_regular_hours_pair check ((regular_open is null) = (regular_close is null)),
  constraint hospitals_regular_hours_source check (regular_hours_source <> 'user')
);

-- ── 병원 진료기능 (하이브리드: 표준 + 직접입력) ─────────────
create table public.hospital_capabilities (
  id uuid primary key default gen_random_uuid(),
  hospital_id text not null references public.hospitals (id) on delete cascade,
  capability_id text references public.capabilities (id),
  custom_label text check (char_length(custom_label) <= 40),
  mapping_status public.mapping_status not null,
  age_min smallint check (age_min between 0 and 120),
  age_max smallint check (age_max between 0 and 120),
  age_note text check (char_length(age_note) <= 40),
  sort_order smallint not null default 0,
  constraint hospital_capabilities_label check (capability_id is not null or custom_label is not null),
  -- 검토 대기 항목은 표준 매핑이 없어야 검색 매칭에서 빠진다.
  constraint hospital_capabilities_pending check (mapping_status <> 'pending' or capability_id is null),
  constraint hospital_capabilities_age_range check (age_min is null or age_max is null or age_min <= age_max)
);
create index hospital_capabilities_hospital on public.hospital_capabilities (hospital_id, sort_order);

-- ── 병원 계정 소속 ──────────────────────────────────────────
-- 운영자가 대시보드(service role)에서만 추가한다. 스스로 가입해 병원을 고를 수 없다.
create table public.hospital_members (
  hospital_id text not null references public.hospitals (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'staff',
  created_at timestamptz not null default now(),
  primary key (hospital_id, user_id)
);
create index hospital_members_user on public.hospital_members (user_id);

-- ── 병원 직접확인: 진료상태 ─────────────────────────────────
-- 병원 전체(capability_id null) 또는 진료기능별 1행. 현재값만 두고 이력은 hospital_update_log 에 쌓는다.
-- 누가 바꿨는지(actor)는 이 테이블에 두지 않는다. 보호자에게 공개되는 테이블이라 직원 id 가 새면 안 된다.
create table public.hospital_live_status (
  id uuid primary key default gen_random_uuid(),
  hospital_id text not null references public.hospitals (id) on delete cascade,
  capability_id text references public.capabilities (id),
  status public.live_status_code not null,
  reason_code public.limit_reason_code,
  custom_reason text check (char_length(custom_reason) <= 60),
  detail_text text check (char_length(detail_text) <= 120),
  starts_at timestamptz,
  expected_resume_at timestamptz,
  recheck_at timestamptz,
  verified_by public.info_source not null,
  verified_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint hospital_live_status_scope unique nulls not distinct (hospital_id, capability_id),
  constraint hospital_live_status_verifier check (verified_by in ('hospital', 'operator')),
  constraint hospital_live_status_ttl check (
    expires_at > verified_at and expires_at <= verified_at + interval '24 hours'
  ),
  constraint hospital_live_status_reason check (status <> 'normal' or reason_code is null)
);

-- ── 병원 직접확인: 오늘 진료시간 · 내원 마감 ────────────────
-- 진료일별 1행. "오늘만" 값이 다음 날로 넘어가지 않는 것을 키(service_date)로 보장한다.
create table public.hospital_daily_hours (
  hospital_id text not null references public.hospitals (id) on delete cascade,
  service_date date not null,
  today_close_at timestamptz,
  last_admission_at timestamptz,
  admission_confirmed boolean not null default false,
  today_note text check (char_length(today_note) <= 80),
  verified_by public.info_source not null default 'hospital',
  verified_at timestamptz not null default now(),
  primary key (hospital_id, service_date),
  constraint hospital_daily_hours_verifier check (verified_by in ('hospital', 'operator')),
  -- 확인되지 않은 마감 시각은 저장하지 않는다. (lib/hours.ts)
  constraint hospital_daily_hours_admission check (admission_confirmed = (last_admission_at is not null)),
  constraint hospital_daily_hours_order check (
    last_admission_at is null or today_close_at is null or last_admission_at <= today_close_at
  )
);

-- ── 병원 직접확인: 전화 상태 ────────────────────────────────
create table public.hospital_contact_status (
  hospital_id text primary key references public.hospitals (id) on delete cascade,
  status public.contact_status_code not null,
  custom_note text check (char_length(custom_note) <= 60),
  verified_at timestamptz not null default now()
);

-- ── 병원 직접확인: 현재 대기 ────────────────────────────────
-- 내원예정 인원을 더하는 컬럼을 두지 않는다. (기획안 26항)
create table public.hospital_waiting_status (
  hospital_id text primary key references public.hospitals (id) on delete cascade,
  level public.waiting_level not null default 'normal',
  headcount smallint check (headcount between 0 and 999),
  verified_at timestamptz not null default now()
);

-- ── 변경 이력 (7단계 Audit 의 바탕) ─────────────────────────
-- 병원이 무엇을 언제 바꿨는지 남긴다. "어제와 동일"도 여기서 어제 마지막 값을 읽는다.
create table public.hospital_update_log (
  id bigint generated always as identity primary key,
  hospital_id text not null references public.hospitals (id) on delete cascade,
  table_name text not null,
  row_data jsonb not null,
  actor uuid,
  service_date date not null,
  created_at timestamptz not null default now()
);
create index hospital_update_log_lookup
  on public.hospital_update_log (hospital_id, table_name, service_date desc, id desc);

-- ── 권한 판정 ───────────────────────────────────────────────
-- security definer: hospital_members 의 RLS 를 거치지 않고 소속만 확인한다.
create function public.is_hospital_member(p_hospital_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.hospital_members m
    where m.hospital_id = p_hospital_id
      and m.user_id = (select auth.uid())
  )
$$;

-- ── 쓰기 직전: 확인시각을 DB 시각으로 ───────────────────────
-- 로그인한 병원 계정의 쓰기에만 적용한다. 운영자(service role)·시드는 auth.uid() 가 없어 값을 유지한다.
create function public.stamp_hospital_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    new.verified_at := now();
    if tg_table_name in ('hospital_live_status', 'hospital_daily_hours') then
      new.verified_by := 'hospital';
    end if;
  end if;
  return new;
end
$$;

-- ── 쓰기 직후: 이력 남기기 ──────────────────────────────────
create function public.log_hospital_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.hospital_update_log (hospital_id, table_name, row_data, actor, service_date)
  values (
    new.hospital_id,
    tg_table_name,
    to_jsonb(new),
    (select auth.uid()),
    public.kst_service_date(new.verified_at)
  );
  return new;
end
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'hospital_live_status', 'hospital_daily_hours', 'hospital_contact_status', 'hospital_waiting_status'
  ] loop
    execute format(
      'create trigger stamp_write before insert or update on public.%I
         for each row execute function public.stamp_hospital_write()', t);
    execute format(
      'create trigger log_write after insert or update on public.%I
         for each row execute function public.log_hospital_write()', t);
  end loop;
end
$$;

-- ── RLS ─────────────────────────────────────────────────────
alter table public.capabilities enable row level security;
alter table public.hospitals enable row level security;
alter table public.hospital_capabilities enable row level security;
alter table public.hospital_members enable row level security;
alter table public.hospital_live_status enable row level security;
alter table public.hospital_daily_hours enable row level security;
alter table public.hospital_contact_status enable row level security;
alter table public.hospital_waiting_status enable row level security;
alter table public.hospital_update_log enable row level security;

-- 공개 읽기: 보호자 화면이 쓰는 정보. 건강정보가 없는 테이블만 공개한다.
create policy "public read" on public.capabilities for select to anon, authenticated using (true);
create policy "public read" on public.hospitals for select to anon, authenticated using (true);
create policy "public read" on public.hospital_capabilities for select to anon, authenticated using (true);
create policy "public read" on public.hospital_live_status for select to anon, authenticated using (true);
create policy "public read" on public.hospital_daily_hours for select to anon, authenticated using (true);
create policy "public read" on public.hospital_contact_status for select to anon, authenticated using (true);
create policy "public read" on public.hospital_waiting_status for select to anon, authenticated using (true);

-- 병원 계정: 자기 소속 확인 · 소속 병원의 직접입력 테이블 쓰기 · 소속 병원 이력 읽기
create policy "own membership" on public.hospital_members
  for select to authenticated using (user_id = (select auth.uid()));

create policy "member read" on public.hospital_update_log
  for select to authenticated using (public.is_hospital_member(hospital_id));

do $$
declare
  t text;
begin
  foreach t in array array[
    'hospital_live_status', 'hospital_daily_hours', 'hospital_contact_status', 'hospital_waiting_status'
  ] loop
    execute format(
      'create policy "member insert" on public.%I for insert to authenticated
         with check (public.is_hospital_member(hospital_id))', t);
    execute format(
      'create policy "member update" on public.%I for update to authenticated
         using (public.is_hospital_member(hospital_id))
         with check (public.is_hospital_member(hospital_id))', t);
  end loop;
end
$$;

-- RLS 가 막더라도 anon 에는 쓰기 권한 자체를 주지 않는다. 삭제는 누구에게도 열지 않는다.
revoke insert, update, delete, truncate on all tables in schema public from anon;
revoke delete, truncate on all tables in schema public from authenticated;
revoke insert, update on public.capabilities, public.hospitals, public.hospital_capabilities,
  public.hospital_members, public.hospital_update_log from authenticated;
revoke execute on function public.is_hospital_member(text) from anon;

-- ── Realtime ────────────────────────────────────────────────
-- 보호자 화면(/hospital/[id])이 구독하는 테이블. RLS 공개 읽기 정책을 그대로 따른다.
alter publication supabase_realtime add table
  public.hospital_live_status,
  public.hospital_daily_hours,
  public.hospital_contact_status,
  public.hospital_waiting_status;
