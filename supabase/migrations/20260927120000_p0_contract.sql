-- ============================================================
-- P0 계약 테이블 (PRD_UX v1.0 §9.1)
--
-- ⚠️ 아직 적용하지 않았다. PRD §16 "운영 환경에 검증 없이 배포하지 마라".
--    적용 전 확인: 백업 시점, 롤백 절차, Supabase 리전(§7.1 국외이전 검토).
--
-- 원칙 (PRD §14 0단계): additive only.
--   - 기존 테이블을 drop·rename 하지 않는다.
--   - 기존 컬럼을 제거하거나 타입을 바꾸지 않는다.
--   - hospitals.id 는 현재 text('h_001')이며 그대로 참조한다.
--     PRD §9.1 은 UUID 를 적었지만, 바꾸면 이미 공유된 /hospital/{id} 링크가 깨진다.
--     UUID 전환이 필요해지면 별도 컬럼 추가 + 이중 조회 기간을 둔 뒤 정리한다.
--   - service_statuses 는 기존 hospital_live_status 와 **병존**한다.
--     읽기 경로를 순차 전환한 뒤에야 옛 테이블 정리를 검토한다.
-- ============================================================

-- ── enum ────────────────────────────────────────────────────

create type public.service_status_code as enum ('AVAILABLE', 'CLOSED', 'PAUSED', 'UNKNOWN');
create type public.wait_bucket as enum ('UNKNOWN', 'LE30', 'FROM30TO60', 'GE60');
create type public.verification_state as enum
  ('PENDING', 'UNDER_REVIEW', 'NEEDS_INFO', 'APPROVED', 'REJECTED');
create type public.application_state as enum
  ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'NEEDS_INFO', 'APPROVED', 'REJECTED');
create type public.post_category as enum ('laceration', 'burn', 'other');
create type public.post_kind as enum ('observation', 'question');
create type public.content_visibility as enum
  ('VISIBLE', 'FLAGGED', 'QUARANTINED', 'RESTORED', 'REMOVED');
create type public.observation_metric as enum ('queue', 'staff', 'reception');
create type public.report_reason as enum
  ('PRIVACY', 'SUSPECTED_FALSE', 'ABUSE', 'SPAM', 'DANGEROUS_ADVICE', 'OTHER');
create type public.report_state as enum ('OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED');
create type public.moderation_action as enum ('QUARANTINE', 'REMOVE', 'RESTORE', 'DISMISS');

-- ── 기관 심사 상태 (기존 hospitals 에 additive) ─────────────
--
-- default 를 두지 않는다. default 가 있으면 나중에 실제 병원을 넣을 때도 값을 안 쓰고
-- 지나가서 "심사하지 않은 병원이 조용히 PENDING 으로 들어오는" 일이 반복된다.
-- 삽입할 때 반드시 명시하게 하고, 기존 행은 여기서 한 번 명시적으로 채운다.
alter table public.hospitals
  add column if not exists verification_state public.verification_state,
  add column if not exists verified_at timestamptz,
  add column if not exists registry_key text;

-- 기존 시드 5행(hpid MOCK0001~0005)은 심사한 적이 없다. 명시적으로 PENDING 이다.
-- 승인 전에는 deriveOfficialStatus() 가 UNVERIFIED 로 내린다. (§9.2)
update public.hospitals set verification_state = 'PENDING' where verification_state is null;

alter table public.hospitals
  alter column verification_state set not null;

create unique index if not exists hospitals_registry_key_unique
  on public.hospitals (registry_key) where registry_key is not null;

-- ── 진료 항목 (PRD §9.1 hospital_services) ──────────────────
-- 기존 hospital_capabilities 와 병존한다. 이쪽은 PRD 의 category/service_code 계약이다.
create table public.hospital_services (
  id uuid primary key default gen_random_uuid(),
  hospital_id text not null references public.hospitals (id) on delete cascade,
  category public.post_category not null,
  service_code text not null,
  reported_age_min smallint,
  reported_age_max smallint,
  capability_note text check (char_length(capability_note) <= 120),
  profile_verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint hospital_services_code unique (hospital_id, service_code),
  constraint hospital_services_age check (
    reported_age_min is null or reported_age_max is null or reported_age_min <= reported_age_max
  )
);
create index hospital_services_lookup on public.hospital_services (hospital_id, category);

-- ── 항목별 공식 상태 (PRD §6.2 · §9.1 service_statuses) ─────
create table public.service_statuses (
  hospital_id text not null references public.hospitals (id) on delete cascade,
  service_id uuid not null references public.hospital_services (id) on delete cascade,
  status public.service_status_code not null,
  wait_bucket public.wait_bucket not null default 'UNKNOWN',
  reason_code text check (char_length(reason_code) <= 40),
  reopen_at timestamptz,
  valid_until timestamptz not null,
  updated_by uuid not null references auth.users (id),
  updated_at timestamptz not null default now(),
  -- 동시 편집 compare-and-swap 용. 조용히 덮어쓰지 않는다. (§6.2)
  version integer not null default 1,
  primary key (hospital_id, service_id),
  -- 다른 병원의 service_id 로 쓰는 것을 DB 가 막는다. (§9.1 composite FK 검증)
  constraint service_statuses_same_hospital
    foreign key (service_id, hospital_id)
    references public.hospital_services (id, hospital_id),
  -- AVAILABLE·PAUSED 는 최대 60분, CLOSED 는 최대 12시간. (§6.2)
  constraint service_statuses_ttl check (
    valid_until > updated_at
    and case
      when status = 'CLOSED' then valid_until <= updated_at + interval '12 hours'
      else valid_until <= updated_at + interval '60 minutes'
    end
  ),
  -- UNKNOWN 은 저장하는 값이 아니라 파생값이다. (§6.2 · features/p0/status.ts)
  constraint service_statuses_not_unknown check (status <> 'UNKNOWN')
);

-- service_id → (id, hospital_id) 복합 FK 를 위한 유니크
alter table public.hospital_services
  add constraint hospital_services_id_hospital unique (id, hospital_id);

-- ── 상태 변경 이력 (PRD §9.1 status_events) ─────────────────
create table public.status_events (
  id bigint generated always as identity primary key,
  hospital_id text not null references public.hospitals (id) on delete cascade,
  service_id uuid not null references public.hospital_services (id) on delete cascade,
  actor_user_id uuid references auth.users (id),
  old_json jsonb,
  new_json jsonb not null,
  version integer not null,
  created_at timestamptz not null default now()
);
create index status_events_lookup on public.status_events (hospital_id, created_at desc, id desc);

-- ── 공지 (PRD §6.3) ─────────────────────────────────────────
create table public.notices (
  id uuid primary key default gen_random_uuid(),
  hospital_id text not null references public.hospitals (id) on delete cascade,
  text text not null check (char_length(text) <= 80),
  valid_until timestamptz not null,
  moderation_state public.content_visibility not null default 'VISIBLE',
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  version integer not null default 1,
  constraint notices_ttl check (valid_until > created_at and valid_until <= created_at + interval '12 hours')
);
create index notices_active on public.notices (hospital_id, valid_until desc);

-- ── 기관 참여 신청 (PRD §5.1) ───────────────────────────────
create table public.partner_applications (
  id uuid primary key default gen_random_uuid(),
  hospital_id text references public.hospitals (id) on delete set null,
  applicant_user_id uuid references auth.users (id),
  institution_fields_json jsonb not null,
  -- 연락처는 공개하지 않는다. 암호화 저장 후 운영자만 복호화한다. (§5.1)
  contact_encrypted bytea,
  state public.application_state not null default 'DRAFT',
  -- private 버킷 경로만 둔다. 공개 URL 을 저장하지 않는다. (§5.1)
  evidence_path text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewer_id uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index partner_applications_queue on public.partner_applications (state, submitted_at);

-- ── 기관 권한 ─────────────────────────────────────────────
-- OWNER/EDITOR/VIEWER 3역할 테이블은 이 migration 에 넣지 않는다.
-- 기존 public.hospital_members(owner|staff)와 is_hospital_member() 를 그대로 쓴다.
-- 3역할이 실제로 필요해지는 시점에 별도 migration 으로 제안한다.

-- ── 비회원 세션 (PRD §3.1) ──────────────────────────────────
-- 원본 토큰을 저장하지 않는다. 해시만 둔다.
create table public.guest_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  policy_version text,
  nickname text not null
);
create index guest_sessions_expiry on public.guest_sessions (expires_at) where revoked_at is null;

-- ── 현장 글 (PRD §3.2 · §3.5 · §9.1 posts) ──────────────────
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  hospital_id text not null references public.hospitals (id) on delete cascade,
  category public.post_category not null,
  guest_id uuid not null references public.guest_sessions (id) on delete cascade,
  -- 병원 간 활동 연결을 줄이기 위한 방별 별칭. (§3.1)
  room_alias text not null,
  kind public.post_kind not null,
  template_id text not null,
  template_payload jsonb not null default '{}'::jsonb,
  body text check (char_length(body) <= 120),
  observed_at timestamptz,
  created_at timestamptz not null default now(),
  valid_until timestamptz,
  visibility public.content_visibility not null default 'VISIBLE',
  public_until timestamptz not null,
  purge_at timestamptz not null,
  version integer not null default 1,
  -- 관찰에는 관찰 시각이 반드시 있고, 질문에는 없다. (§3.2)
  constraint posts_observed check (
    (kind = 'observation' and observed_at is not null)
    or (kind = 'question' and observed_at is null)
  ),
  -- 관찰 시각이 미래일 수 없다.
  constraint posts_observed_not_future check (observed_at is null or observed_at <= created_at)
);
create index posts_feed on public.posts (hospital_id, category, created_at desc, id desc);
create index posts_purge on public.posts (purge_at);

-- ── 관찰(리액션) (PRD §3.4 · §9.1 observations) ─────────────
create table public.observations (
  id uuid primary key default gen_random_uuid(),
  hospital_id text not null references public.hospitals (id) on delete cascade,
  category public.post_category not null,
  guest_id uuid not null references public.guest_sessions (id) on delete cascade,
  metric public.observation_metric not null,
  value text not null,
  observed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  active boolean not null default true,
  quarantined boolean not null default false,
  version integer not null default 1,
  constraint observations_ttl check (expires_at > observed_at)
);

-- 활성 기록은 (병원, 카테고리, guest, metric) 조합당 1개.
-- features/p0/observations.ts 의 activeKey() 와 **같은 조합**이어야 한다.
-- 100건 동시 요청에도 중복이 생기지 않게 DB 가 보장한다. (PRD §14 2단계 테스트)
create unique index observations_active_unique
  on public.observations (hospital_id, category, guest_id, metric)
  where active;
create index observations_counting
  on public.observations (hospital_id, category, metric, expires_at)
  where active and not quarantined;

-- ── 신고·조치 (PRD §7.3) ────────────────────────────────────
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('post', 'observation', 'notice')),
  target_id uuid not null,
  reporter_guest_id uuid references public.guest_sessions (id) on delete set null,
  reporter_user_id uuid references auth.users (id) on delete set null,
  reason public.report_reason not null,
  detail text check (char_length(detail) <= 200),
  state public.report_state not null default 'OPEN',
  created_at timestamptz not null default now(),
  -- 신고자는 둘 중 하나만. (§9.1)
  constraint reports_single_reporter check (
    (reporter_guest_id is not null) <> (reporter_user_id is not null)
  )
);
-- 같은 주체의 같은 대상 신고는 1건. 중복은 200 idempotent 로 응답한다. (§7.3)
create unique index reports_unique_guest
  on public.reports (target_type, target_id, reporter_guest_id)
  where reporter_guest_id is not null;
create unique index reports_unique_user
  on public.reports (target_type, target_id, reporter_user_id)
  where reporter_user_id is not null;
create index reports_queue on public.reports (state, created_at);

create table public.moderation_actions (
  id bigint generated always as identity primary key,
  report_id uuid references public.reports (id) on delete set null,
  target_type text not null,
  target_id uuid not null,
  action public.moderation_action not null,
  reason_code text not null check (char_length(reason_code) <= 40),
  actor_id uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index moderation_actions_target on public.moderation_actions (target_type, target_id, created_at desc);

-- ── 동의 기록 (PRD §3.2 · §9.1 consent_events) ──────────────
create table public.consent_events (
  id uuid primary key default gen_random_uuid(),
  actor_type text not null check (actor_type in ('guest', 'user')),
  actor_id uuid not null,
  purpose text not null check (char_length(purpose) <= 60),
  policy_version text not null,
  accepted boolean not null,
  created_at timestamptz not null default now()
);
create index consent_events_actor on public.consent_events (actor_type, actor_id, created_at desc);

-- ── outbox · 멱등성 (PRD §9 · §10 · §11) ────────────────────
create table public.outbox_events (
  id bigint generated always as identity primary key,
  aggregate_key text not null,
  aggregate_version integer not null,
  event_type text not null,
  public_payload jsonb not null,
  created_at timestamptz not null default now(),
  published_at timestamptz
);
create index outbox_unpublished on public.outbox_events (created_at) where published_at is null;

create table public.idempotency_keys (
  actor_key text not null,
  key text not null,
  request_hash text not null,
  response_status integer not null,
  response_json jsonb not null,
  expires_at timestamptz not null,
  primary key (actor_key, key)
);
create index idempotency_expiry on public.idempotency_keys (expires_at);

-- ============================================================
-- RLS
--
-- 보호자 브라우저에는 **아무 것도 직접 읽히지 않는다.** 공개 조회는 서버 API 가
-- service_role 로 읽어 공개 DTO 만 내려보낸다. (PRD §9 "보호자에게 DB 테이블 원본을
-- 구독시키지 않는다")
-- 그래서 아래 테이블은 anon·authenticated 에 select 정책을 주지 않는다.
-- 정책이 없으면 RLS 가 전부 거절한다.
-- ============================================================

alter table public.hospital_services enable row level security;
alter table public.service_statuses enable row level security;
alter table public.status_events enable row level security;
alter table public.notices enable row level security;
alter table public.partner_applications enable row level security;
alter table public.guest_sessions enable row level security;
alter table public.posts enable row level security;
alter table public.observations enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.consent_events enable row level security;
alter table public.outbox_events enable row level security;
alter table public.idempotency_keys enable row level security;

-- 소속 판정은 기존 public.is_hospital_member() 를 그대로 쓴다. 새로 만들지 않는다.

-- 병원 직원: 자기 기관의 항목·상태·공지만. 권한 회수는 다음 요청부터 막힌다. (§5.2)
create policy "member read services" on public.hospital_services
  for select to authenticated
  using (public.is_hospital_member(hospital_id));

create policy "member read statuses" on public.service_statuses
  for select to authenticated
  using (public.is_hospital_member(hospital_id));

create policy "member write statuses" on public.service_statuses
  for insert to authenticated
  with check (public.is_hospital_member(hospital_id));

create policy "member update statuses" on public.service_statuses
  for update to authenticated
  using (public.is_hospital_member(hospital_id))
  with check (public.is_hospital_member(hospital_id));

create policy "member read notices" on public.notices
  for select to authenticated
  using (public.is_hospital_member(hospital_id));

create policy "member write notices" on public.notices
  for insert to authenticated
  with check (public.is_hospital_member(hospital_id));

create policy "own application" on public.partner_applications
  for select to authenticated using (applicant_user_id = auth.uid());

-- 이력·감사·신고 원문·증빙·세션·멱등성은 클라이언트에 어떤 정책도 주지 않는다.
-- service_role(서버)만 접근한다. delete 정책은 어느 테이블에도 만들지 않는다.

-- ============================================================
-- 비회원 공개 읽기 (PRD §3.1 "읽기는 세션 없이 허용한다")
--
-- 원본 테이블에 anon select 정책을 주지 않는다. RLS 는 행만 거르고 **열은 못 거른다** —
-- posts.guest_id / observations.guest_id 가 그대로 나간다. 세션 ID 가 공개 응답에
-- 나가면 안 된다는 제약이 우선이므로, 열을 고른 뷰로만 내보낸다.
--
-- 아래 뷰는 security_invoker 를 켜지 않는다(기본값). 뷰 소유자 권한으로 실행되어
-- 기반 테이블 RLS 를 우회하므로, 필터를 **뷰 안에서** 건다.
-- 쓰기는 여전히 서버 API 전용이다. anon insert/update 정책은 만들지 않는다.
-- ============================================================

-- 현장 글: 격리·삭제 행 제외, 공개 기간 내만. guest_id·room_alias 는 내보내지 않는다.
create view public.posts_public as
  select
    p.id,
    p.hospital_id,
    p.category,
    p.kind,
    p.template_id,
    p.template_payload,
    p.body,
    p.observed_at,
    p.created_at,
    p.valid_until
  from public.posts p
  where p.visibility not in ('QUARANTINED', 'REMOVED')
    and p.public_until > now();

-- 관찰(리액션): 집계만 내보낸다. 원본 행도, guest_id 도 나가지 않는다.
-- 15분 유효기간은 읽는 시점에 판정한다(expires_at > now()).
create view public.observation_counts as
  select
    o.hospital_id,
    o.category,
    o.metric,
    count(*)::int as count
  from public.observations o
  where o.active
    and not o.quarantined
    and o.expires_at > now()
  group by o.hospital_id, o.category, o.metric;

-- 뷰에만 읽기 권한을 준다. 기반 테이블에는 주지 않는다.
revoke all on public.posts_public from anon, authenticated;
revoke all on public.observation_counts from anon, authenticated;
grant select on public.posts_public to anon, authenticated;
grant select on public.observation_counts to anon, authenticated;
