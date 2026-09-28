-- ============================================================
-- 항목별 공식 상태 (PRD §6.1 "항목별 접수 토글" · §6.2 · §9.2)
--
-- ⚠️ 아직 적용하지 않았다. supabase start 로 띄운 로컬 인스턴스에서 먼저 돌린다.
--    적용 전 supabase db diff 로 스키마를 확인한다.
--
-- 왜 만드는가:
--   기존 public.hospital_live_status 는 **병원당 한 줄**이다(capability_id 는 있으나
--   운영에서는 병원 전체 한 행만 쓰고 있다). "봉합은 되고 화상은 안 된다"를 표현할 수 없다.
--   그 상태가 실제로 흔하므로 항목(service) 단위로 옮긴다.
--
-- 비파괴 원칙:
--   - hospital_live_status 를 drop 하지 않는다. 읽기 전용으로 남긴다.
--     쓰기 정책은 기존 migration 이 준 것이 그대로 남아 있으므로, 읽기 경로를 옮긴 뒤
--     별도 턴에서 쓰기 정책 회수를 검토한다(지금 회수하면 파트너 화면이 멈춘다).
--   - 기존 컬럼·테이블을 바꾸지 않는다. 추가만 한다.
--   - hospitals.id 는 text('h_001')이다. 그대로 참조한다.
--
-- 타임스탬프 주의 — 되돌리지 말 것:
--   p0_contract(0927)가 이 파일의 타입을 참조하므로 이름 순서상 먼저 돌아야 한다.
--   작성 순서와 번호가 다른 것은 의도다.
--   (둘 다 아직 어디에도 적용되지 않았으므로 번호 조정이 안전했다)
-- ============================================================

-- ── enum ────────────────────────────────────────────────────

/*
 * 5값이다. LIMITED 를 PAUSED 와 합치지 않는다.
 *   LIMITED : 문은 열려 있는데 특정 처치가 안 된다. 재개 시각 개념이 없다.
 *   PAUSED  : 지금 멈췄고 재개 예정 시각을 알릴 수 있다.
 * 기존 live_status_code(normal/partial/paused/difficult)와는 별개 타입이다.
 * 매핑은 src/features/p0/status.ts 와 아래 주석에 남긴다.
 *   normal → AVAILABLE · partial → LIMITED · paused → PAUSED · difficult → CLOSED
 * UNKNOWN 은 저장하지 않는다. 읽는 시점에 파생되는 값이다(만료·미게시·미승인).
 */
create type public.service_status_code as enum
  ('AVAILABLE', 'LIMITED', 'CLOSED', 'PAUSED', 'UNKNOWN');

/** 대기 시간. 임의의 정확한 분으로 바꾸지 않는다. (PRD §6.1) */
create type public.wait_bucket as enum ('UNKNOWN', 'LE30', 'FROM30TO60', 'GE60');

create type public.verification_state as enum
  ('PENDING', 'UNDER_REVIEW', 'NEEDS_INFO', 'APPROVED', 'REJECTED');

/*
 * 진료 항목 분류. 현장톡 글 분류(p0_contract 의 chat_topic)와 값이 같지만
 * **같은 타입으로 합치지 않는다.**
 *
 * 분리하는 근거는 앞으로 값이 갈라지기 때문이다.
 *   care_category : 병원이 실제로 하는 처치를 따라간다. 병원이 등록·토글하는 단위다.
 *   chat_topic    : 보호자가 쓰는 말을 따라간다. 글을 고르는 칩의 단위다.
 * 같이 움직일 이유가 없다. 한쪽이 늘어날 때 다른 쪽을 따라 늘리면 안 된다.
 *
 * 이름을 서로 다르게 둔 것도 그래서다 — 값이 같은 채로 이름까지 비슷하면
 * 반년 뒤 누가 복붙 실수로 보고 하나로 합친다.
 */
create type public.care_category as enum ('laceration', 'burn', 'other');

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

-- ── 진료 항목 ───────────────────────────────────────────────
-- 기존 hospital_capabilities(표준 진료기능)와 병존한다.
-- 이쪽은 "접수 토글의 단위"다. 카테고리 하나가 항목 하나다.
create table public.hospital_services (
  id uuid primary key default gen_random_uuid(),
  hospital_id text not null references public.hospitals (id) on delete cascade,
  category public.care_category not null,
  service_code text not null,
  -- 병원이 밝힌 연령 조건. 한쪽만 등록되면 '확인'으로 읽지 않는다.
  -- (판정은 src/features/discovery/match.ts ageState)
  reported_age_min smallint,
  reported_age_max smallint,
  capability_note text check (char_length(capability_note) <= 120),
  -- 이 프로필을 마지막으로 확인한 시각. 현재 의료진 구성과 다를 수 있음을 화면이 말한다.
  profile_verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint hospital_services_code unique (hospital_id, service_code),
  constraint hospital_services_age check (
    reported_age_min is null or reported_age_max is null or reported_age_min <= reported_age_max
  )
);
create index hospital_services_lookup on public.hospital_services (hospital_id, category);

-- 다른 병원의 service_id 로 쓰는 것을 DB 가 막기 위한 복합 유니크. (service_statuses FK 용)
alter table public.hospital_services
  add constraint hospital_services_id_hospital unique (id, hospital_id);

-- ── 항목별 공식 상태 ────────────────────────────────────────
create table public.service_statuses (
  hospital_id text not null references public.hospitals (id) on delete cascade,
  service_id uuid not null references public.hospital_services (id) on delete cascade,
  status public.service_status_code not null,
  wait_bucket public.wait_bucket not null default 'UNKNOWN',
  reason_code text check (char_length(reason_code) <= 40),
  -- 재개 예정 시각. PAUSED 에서만 화면에 나간다(showsReopenAt). 도달해도 자동 전환 없음.
  reopen_at timestamptz,
  valid_until timestamptz not null,
  updated_by uuid not null references auth.users (id),
  updated_at timestamptz not null default now(),
  -- 동시 편집 compare-and-swap 용. 다른 직원의 변경을 조용히 덮어쓰지 않는다. (§6.2)
  version integer not null default 1,
  primary key (hospital_id, service_id),
  -- service_id 가 같은 병원의 항목인지 DB 가 검증한다.
  constraint service_statuses_same_hospital
    foreign key (service_id, hospital_id)
    references public.hospital_services (id, hospital_id),
  /*
   * TTL. AVAILABLE·LIMITED·PAUSED 는 최대 60분, CLOSED 는 최대 12시간.
   * src/features/p0/status.ts 의 maxValidMinutesFor() 와 같은 값이어야 한다.
   * 한쪽만 바꾸면 화면이 허용한 값을 DB 가 거절한다.
   */
  constraint service_statuses_ttl check (
    valid_until > updated_at
    and case
      when status = 'CLOSED' then valid_until <= updated_at + interval '12 hours'
      else valid_until <= updated_at + interval '60 minutes'
    end
  ),
  -- UNKNOWN 은 파생값이다. 저장하지 않는다.
  constraint service_statuses_not_unknown check (status <> 'UNKNOWN')
);

/*
 * TTL 클램프 함수.
 *
 * 이번 이행에서는 쓰이지 않는다 — 아래에서 service_statuses 를 비워 두기 때문이다.
 * 나중에 옛 hospital_live_status 행을 옮기거나 외부 데이터를 들여올 때 쓴다.
 * 기존 expires_at 은 verified_at + 24h 까지 허용이라 그대로 넣으면 위 CHECK 에 걸린다.
 * 잘라서 넣되, 잘렸다는 사실은 호출하는 쪽이 reason_code 로 남긴다.
 */
create or replace function public.clamp_status_valid_until(
  p_status public.service_status_code,
  p_updated_at timestamptz,
  p_requested timestamptz
) returns timestamptz
language sql
immutable
as $$
  select least(
    p_requested,
    p_updated_at + case when p_status = 'CLOSED' then interval '12 hours' else interval '60 minutes' end
  );
$$;

-- ── 상태 변경 이력 ──────────────────────────────────────────
-- 누가·언제·무엇을 바꿨는지. 환자 본문은 담지 않는다. (PRD §7.4 감사 90일)
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

-- ============================================================
-- 시드 이행
--
-- hospital_services 행만 만든다. service_statuses 는 **비워 둔다.**
--
-- 이유: 기존 데이터는 병원당 한 줄이라 "이 항목이 어떤 상태인지"를 담고 있지 않다.
--       한 줄을 여러 항목에 복제하면 원래 없던 정보를 만들어 낸다. 그래서 옮기지 않는다.
--       비어 있으면 deriveOfficialStatus() 가 UNKNOWN(NEVER_SET)을 돌려주고,
--       화면은 "현재 상태 확인 필요"로 시작한다. 이게 사실에 맞다.
--       병원이 로그인해 한 번 누르면 그때부터 항목별 값이 생긴다.
-- ============================================================

-- 기존 hospital_capabilities 의 표준 진료기능 그룹을 카테고리로 접어 항목을 만든다.
--   facial · hand → laceration     (얼굴·두피·손 열상은 봉합 쪽이다)
--   burn          → burn
--   other         → other
-- 연령 조건은 그 카테고리 안에서 가장 넓은 범위를 가져온다. 좁히면 없는 제한을 만든다.
insert into public.hospital_services (hospital_id, category, service_code, reported_age_min, reported_age_max)
select
  hc.hospital_id,
  cat.category,
  cat.category::text as service_code,
  min(hc.age_min) as reported_age_min,
  max(hc.age_max) as reported_age_max
from public.hospital_capabilities hc
join public.capabilities c on c.id = hc.capability_id
cross join lateral (
  select case c."group"
    when 'facial' then 'laceration'::public.care_category
    when 'hand'   then 'laceration'::public.care_category
    when 'burn'   then 'burn'::public.care_category
    else               'other'::public.care_category
  end as category
) cat
where hc.capability_id is not null
group by hc.hospital_id, cat.category
on conflict (hospital_id, service_code) do nothing;

-- service_statuses 는 의도적으로 비어 있다. INSERT 하지 않는다.

-- ── 병원 대표 상태로 접는 규칙 (읽기 계층) ─────────────────
--
-- 화면은 아직 "병원의 상태는 하나"를 전제한다. 그래서 읽기 계층이 항목 목록을
-- 대표 하나로 접는다. 구현은 src/features/hospitals/serviceStatus.ts 다.
--
--   CLOSED > PAUSED > LIMITED > UNKNOWN > AVAILABLE
--
-- 가장 보수적인 항목으로 접는다. 좋은 쪽으로 접지 않는다.
-- 항목이 하나라도 CLOSED 면 대표는 CLOSED 다. 전부 AVAILABLE 일 때만 AVAILABLE 이다.
-- 미설정·만료(UNKNOWN)도 AVAILABLE 보다 앞이다.
--
-- 이유: 봉합=AVAILABLE / 화상=CLOSED 인 병원을 "지금 접수 가능"으로 접으면
--       화상 환자 보호자가 그걸 보고 야간에 출발한다. 헛걸음을 없애는 게 목적인데
--       접기 규칙이 헛걸음을 만든다. 검색에서 덜 보이는 손해보다 잘못 보내는 손해가 크다.
--
-- 이 규칙을 SQL 뷰로 옮기려는 사람에게: 만료 판정이 읽는 시점에 일어나야 하므로
-- now() 를 쓰는 뷰가 필요하다. 지금은 애플리케이션 계층에 두고 vitest 로 고정해 두었다.

-- ============================================================
-- RLS
--
-- 보호자 공개 읽기는 이 단계에서 열지 않는다. 읽기 경로를 rows.ts 로 옮기는 작업과 함께
-- 별도로 검토한다(지금 열면 검증되지 않은 공식 상태가 화면에 나갈 수 있다).
-- 병원 직원은 기존 public.is_hospital_member() 로 판정한다. 새 역할 테이블을 만들지 않는다.
-- delete 정책은 어느 테이블에도 만들지 않는다.
-- ============================================================

alter table public.hospital_services enable row level security;
alter table public.service_statuses enable row level security;
alter table public.status_events enable row level security;

create policy "member read services" on public.hospital_services
  for select to authenticated using (public.is_hospital_member(hospital_id));

create policy "member read statuses" on public.service_statuses
  for select to authenticated using (public.is_hospital_member(hospital_id));

create policy "member write statuses" on public.service_statuses
  for insert to authenticated with check (public.is_hospital_member(hospital_id));

create policy "member update statuses" on public.service_statuses
  for update to authenticated
  using (public.is_hospital_member(hospital_id))
  with check (public.is_hospital_member(hospital_id));

create policy "member read status events" on public.status_events
  for select to authenticated using (public.is_hospital_member(hospital_id));

-- status_events 는 트리거·서버만 쓴다. 클라이언트 insert 정책을 주지 않는다.

-- ============================================================
-- hospital_live_status 를 읽기 전용으로 남기는 방법에 대한 메모
--
-- 지금 회수하지 않는다. 파트너 화면(features/partner/supabaseBackend.ts)이 아직
-- 이 테이블에 쓰고 있고, 읽기 경로(rows.ts)도 여기를 본다.
-- 순서는 이렇다.
--   1) rows.ts / realtime.ts 를 service_statuses 로 옮긴다 (같은 턴의 코드 작업)
--   2) 파트너 쓰기를 service_statuses 로 옮긴다
--   3) 그 다음 턴에서 hospital_live_status 의 member insert/update 정책을 drop 한다
--      (select 정책은 남긴다 — 과거 값을 읽어야 할 일이 있다)
-- 2)까지 끝나기 전에 3)을 하면 병원이 상태를 저장할 수 없게 된다.
-- ============================================================
