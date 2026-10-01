-- ============================================================
-- 목록에 없는 병원을 알려 달라는 요청.
--
-- 보호자가 병원 이름을 자유롭게 적어 **글에 붙이는** 길은 만들지 않는다. 세 가지가 깨진다.
--   1. 같은 병원이 여러 이름으로 쌓인다 — "로뎀", "로뎀소아", "마곡 로뎀소아청소년과".
--      현장톡이 그 이름마다 쪼개져 글이 흩어진다. 한 방에 모여야 쓸모가 있다.
--   2. 없는 병원에 대한 글이 올라가고, 다른 보호자가 그걸 찾아 나선다.
--      밤에 헛걸음을 만드는 것이 이 서비스가 없애려는 바로 그것이다.
--   3. 아무 병원이나 지목할 수 있게 된다. 지금은 목록에 있는 곳만 고를 수 있어
--      범위가 통제된다.
--
-- 그래서 요청은 **글이 아니다.** 공개되지 않고 운영자만 본다.
-- 이 표에는 공개 읽기 정책을 만들지 않는다.
--
-- ── 요청한 사람이 지금 할 수 있는 것 ──────────────────────────
-- 요청만 받고 끝내면 "나중에 다시 오세요"가 된다. 야간에 급한 사람에게 그건 나쁜 답이다.
-- 현장톡 글은 hospital_id 가 null 이어도 올라간다(migration 20260929). 그래서 요청을
-- 받은 뒤 **지역 현장톡으로 보낸다** — "마곡동인데 지금 문 연 소아과 아시는 분?" 은
-- 병원을 지목하지 않는 글이고, 빈 방의 첫 글로 가장 자연스럽다.
-- 그 안내는 화면에 있다(components/chat/HospitalRequestForm).
-- ============================================================

create table public.hospital_requests (
  id uuid primary key default gen_random_uuid(),
  /** 보호자가 적은 병원 이름. 정규화하지 않는다 — 운영자가 원문을 봐야 찾을 수 있다. */
  name text not null check (char_length(trim(name)) between 2 and 60),
  /*
   * 대략 위치. 동 이름 정도다. 상세 주소를 요구하지 않는다 —
   * 급한 사람에게 주소를 받아 적게 하는 것은 비용이 크고, 운영자가 찾는 데는 동이면 된다.
   */
  sido text check (char_length(sido) <= 20),
  sigungu text check (char_length(sigungu) <= 30),
  area_hint text check (char_length(area_hint) <= 60),

  /** 누가 요청했는가. 제한을 세기 위한 것이고 공개되지 않는다. */
  guest_id uuid not null references public.guest_sessions (id) on delete cascade,

  created_at timestamptz not null default now(),
  /*
   * 처리 상태. 운영자가 콘솔에서 바꾼다.
   *   OPEN      아직 안 봄
   *   ADDED     목록에 넣었다
   *   NOT_FOUND 찾을 수 없었다 (이름이 모호하거나 폐업)
   *   DUPLICATE 이미 목록에 있었다
   */
  state text not null default 'OPEN'
    check (state in ('OPEN', 'ADDED', 'NOT_FOUND', 'DUPLICATE')),
  /** 목록에 넣은 경우 그 병원. 같은 요청이 또 오면 바로 답할 수 있다. */
  resolved_hospital_id text references public.hospitals (id) on delete set null,
  reviewed_at timestamptz,

  -- 시군구만 있고 시도가 없으면 어디인지 알 수 없다. field_reports 와 같은 규칙이다.
  constraint hospital_requests_region check (sigungu is null or sido is not null)
);

create index hospital_requests_queue on public.hospital_requests (state, created_at);
create index hospital_requests_by_guest on public.hospital_requests (guest_id, created_at desc);

/*
 * 같은 사람이 같은 병원을 여러 번 요청해도 한 건이다. 이름 표기가 조금 달라도
 * 같은 요청으로 보려면 정규화가 필요한데, 그러면 운영자가 볼 원문이 사라진다.
 * 그래서 **원문 그대로 유일성을 건다** — 표기까지 같을 때만 중복이다.
 * 느슨하게 막지 않는 이유: 요청이 두 건 쌓이는 것은 운영자가 한 번 더 읽는 비용이고,
 * 원문을 잃는 것은 병원을 못 찾는 비용이다. 뒤쪽이 크다.
 */
create unique index hospital_requests_unique_per_guest
  on public.hospital_requests (guest_id, name, coalesce(sigungu, ''));

-- ── RLS ─────────────────────────────────────────────────────
alter table public.hospital_requests enable row level security;

/*
 * 정책을 하나도 만들지 않는다.
 *
 * 읽기: 요청은 글이 아니다. 공개되면 "저 병원이 목록에 없다"는 사실이 공개되고,
 *       보호자가 적은 동 이름이 함께 노출된다.
 * 쓰기: 서버 라우트만 한다(service_role). anon 에게 열면 제한을 세는 세션을
 *       스스로 만들 수 있게 되고, 그러면 제한이 제한이 아니다.
 *
 * 운영자는 콘솔에서 본다. /admin 은 만들지 않는다.
 */

-- ============================================================
-- 운영자용 — 콘솔에서 쓰는 질의
--
-- 새 요청 보기 (같은 병원을 몇 명이 찾는지 함께):
--   select name, sido, sigungu, area_hint, count(*) as 요청수, min(created_at) as 처음
--     from hospital_requests
--    where state = 'OPEN'
--    group by name, sido, sigungu, area_hint
--    order by 요청수 desc, 처음;
--
-- 목록에 넣은 뒤:
--   update hospital_requests
--      set state = 'ADDED', resolved_hospital_id = '<병원 id>', reviewed_at = now()
--    where state = 'OPEN' and name = '<적힌 이름>';
--
-- 찾을 수 없었던 경우:
--   update hospital_requests set state = 'NOT_FOUND', reviewed_at = now() where id = '<요청 id>';
--
-- ⚠️ 요청을 지우지 않는다. 지우면 "몇 명이 이 병원을 찾았는지"가 사라지고,
--    어느 지역을 먼저 넣어야 하는지 판단할 근거를 잃는다.
-- ============================================================
