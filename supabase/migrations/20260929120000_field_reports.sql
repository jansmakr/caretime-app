-- ============================================================
-- 현장톡을 서버에 둔다.
--
-- 지금까지 현장톡 글은 브라우저 메모리에만 있었다. 새로고침하면 사라지고, 다른 사람에게
-- 가지 않는다. 그 상태로는 "실시간 정보공유방"이 성립하지 않는다.
--
-- ── posts 표와의 관계 (읽는 사람이 헷갈리지 않게) ─────────────
--
-- migration 20260927 이 만든 public.posts 는 PRD 의 최종 계약 모양이다. 그 표는
-- hospital_id 가 not null 이고, guest_sessions 를 참조하며, template_id 를 요구한다.
-- 그 셋은 아직 없다 —
--   · 현장톡 글은 병원을 특정하지 않는 것이 많다(지역만 아는 글).
--   · 서버 게스트 세션은 다음 턴(4-a)에서 만든다.
--   · 템플릿 15개는 그다음 턴(5-b)이다.
-- 지금 posts 에 맞추려면 그 세 턴을 먼저 끝내야 하고, 그러면 1차 출시가 그만큼 미뤄진다.
--
-- 그래서 **오늘의 모양**으로 field_reports 를 만든다. posts 는 아직 아무도 쓰지 않고
-- 어느 환경에도 적용되지 않았다. 두 표를 합치는 일은 4-a·5-b 에서 이 표에 컬럼을 더하는
-- 방식으로 한다(guest_id, template_id). 그때 posts 를 정리한다.
--
-- ⚠️ 이 migration 을 운영에 적용하기 전에 4-a(서버 rate limit)가 먼저 끝나야 한다.
--    아래 anon insert 정책은 "누구나 쓸 수 있다"이고, 지금 막는 것은 길이와 모양뿐이다.
--    연타·도배를 세는 장치는 이 표에 없다.
-- ============================================================

create type public.reaction_key as enum ('low_wait', 'doctor_present', 'closed');

-- ── 글 ──────────────────────────────────────────────────────
create table public.field_reports (
  id uuid primary key default gen_random_uuid(),
  category public.chat_topic not null,
  /** "기타"에서만 쓰는 주제 직접 입력. */
  topic text check (char_length(topic) <= 30),
  body text not null check (char_length(body) between 1 and 300),

  /*
   * 어느 지역·어느 병원 이야기인가. 전부 null 이면 지역을 특정하지 않은 글이다.
   * 비어 있는 값을 추측해서 채우지 않는다 — 임의 기본 지역을 만들면 그 지역 사람에게
   * 자기 동네 이야기처럼 보인다.
   */
  sido text check (char_length(sido) <= 20),
  sigungu text check (char_length(sigungu) <= 30),
  hospital_id text references public.hospitals (id) on delete set null,
  /*
   * 병원 이름을 같이 둔다. 공공데이터에 없는 병원을 사용자가 직접 적는 경우가 있고,
   * 병원 행이 지워져도 글의 문맥은 남아야 한다.
   */
  hospital_name text check (char_length(hospital_name) <= 60),

  /** 익명 표시명. 이름·연락처가 아니다. 인증 수단도 아니다. */
  handle text not null check (char_length(handle) between 1 and 20),

  created_at timestamptz not null default now(),
  visibility public.content_visibility not null default 'VISIBLE',
  /** 공개 기간. 지나면 목록에서 빠진다. 만료 판정은 읽는 시점에 한다. */
  public_until timestamptz not null default now() + interval '24 hours',
  version integer not null default 1,

  -- 시군구만 있고 시도가 없으면 어디인지 알 수 없다. urlFilter 와 같은 규칙이다.
  constraint field_reports_region check (sigungu is null or sido is not null)
);

create index field_reports_recent on public.field_reports (created_at desc, id desc);
create index field_reports_region_lookup on public.field_reports (sido, sigungu, created_at desc);

-- ── 반응 ────────────────────────────────────────────────────
/*
 * 글 하나에 달리는 원클릭 반응이다. PRD §3.4 의 observations(병원 × 카테고리 × 시점)와는
 * **다른 것**이다. 그쪽은 5-b 에서 별도로 만든다. 지금 이 둘을 합치면 세는 대상이 바뀐다 —
 * "이 글에 공감한 사람"과 "지금 그 병원을 본 사람"은 같은 수가 아니다.
 */
create table public.field_report_reactions (
  report_id uuid not null references public.field_reports (id) on delete cascade,
  key public.reaction_key not null,
  /*
   * 누가 눌렀는가. 지금은 브라우저가 만든 값이다 — 지우면 다시 누를 수 있다.
   * 서버 게스트 세션(4-a)이 생기면 그 id 로 바꾼다. 그 전까지 이 값은
   * "같은 브라우저가 두 번 누르는 것"만 막는다. 그 이상을 이 컬럼에 기대하지 않는다.
   */
  reactor_key text not null check (char_length(reactor_key) between 8 and 64),
  created_at timestamptz not null default now(),
  primary key (report_id, key, reactor_key)
);

create index field_report_reactions_lookup on public.field_report_reactions (report_id, key);

-- ── 공개 읽기 ────────────────────────────────────────────────
/*
 * 원본 표를 anon 에게 열지 않는다. 컬럼을 명시한 뷰에만 select 를 준다.
 * service_statuses 에서와 같은 이유다 — 나중에 붙는 컬럼이 자동으로 공개되지 않게.
 *
 * 격리·삭제된 글과 공개 기간이 지난 글은 여기서 빠진다.
 */
create view public.field_reports_public as
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
    and r.public_until > now();

revoke all on public.field_reports_public from anon, authenticated;
grant select on public.field_reports_public to anon, authenticated;

/** 반응 수. 누가 눌렀는지는 내보내지 않는다. */
create view public.field_report_reaction_counts as
  select
    x.report_id,
    x.key,
    count(*)::integer as count
  from public.field_report_reactions x
  join public.field_reports r on r.id = x.report_id
  where r.visibility not in ('QUARANTINED', 'REMOVED')
    and r.public_until > now()
  group by x.report_id, x.key;

revoke all on public.field_report_reaction_counts from anon, authenticated;
grant select on public.field_report_reaction_counts to anon, authenticated;

-- ── RLS ─────────────────────────────────────────────────────
alter table public.field_reports enable row level security;
alter table public.field_report_reactions enable row level security;

/*
 * 읽기 정책은 만들지 않는다. 읽기는 위 뷰로만 나간다.
 *
 * 쓰기는 연다. 현장톡은 로그인 없이 쓰는 것이 전제이기 때문이다.
 * 여기서 막을 수 있는 것은 모양뿐이다 —
 *   · 글쓴이가 정할 수 없는 값(공개 기간·표시 상태·시각)은 default 로만 들어간다.
 *   · 길이·지역 규칙은 CHECK 가 본다.
 * 연타·도배는 4-a 의 서버 rate limit 이 맡는다. 그때까지 화면의 작성창은 닫혀 있다.
 */
create policy "anyone can post" on public.field_reports
  for insert to anon, authenticated
  with check (
    visibility = 'VISIBLE'
    and public_until <= now() + interval '25 hours'
  );

create policy "anyone can react" on public.field_report_reactions
  for insert to anon, authenticated with check (true);

/*
 * 반응 취소. 누른 사람만 지울 수 있어야 하는데, 지금은 그 사람을 증명할 방법이 없다
 * (reactor_key 는 브라우저가 만든 값이다). 그래서 **삭제 정책을 만들지 않는다** —
 * 화면의 '취소'는 4-a 에서 게스트 세션이 생긴 뒤에 서버로 간다.
 * 그때까지 취소는 브라우저 안에서만 반영된다.
 */

-- update·delete 정책은 어느 표에도 만들지 않는다. 격리·복구는 운영자가 콘솔에서 한다.

-- ── Realtime ────────────────────────────────────────────────
/*
 * 보호자에게 가는 경로는 broadcast 다. 원본 표를 열지 않는다.
 * 페이로드를 트리거가 고르므로, 무엇이 공개되는가가 이 함수 한 곳에서 정해진다.
 *
 * service_statuses 와 다른 점: 승인 조건이 없다. 병원이 아니라 보호자 글이라
 * "승인된 병원만"이라는 개념이 없다. 대신 **격리·삭제된 글이 실리지 않아야 한다.**
 */

/*
 * ⚠️ 페이로드에 컬럼을 추가할 때는 공개 가능 여부를 먼저 판단하라.
 *    여기 적지 않은 컬럼은 나가지 않는다. 한 줄을 더하면 그 값은 즉시 공개된다.
 *    지금 일부러 뺀 것: visibility·public_until·version (운영용 내부 값).
 */
create function public.broadcast_field_report() returns trigger
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

  if new.public_until <= now() then
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

create trigger broadcast_write after insert or update on public.field_reports
  for each row execute function public.broadcast_field_report();

/*
 * 청취 권한.
 *
 * 토픽은 하나다('field-reports'). 지역별로 나누면 구독이 지역 수만큼 늘고, 지금
 * 글이 0건인 방에서 그럴 이유가 없다. 지역으로 좁히는 것은 화면의 필터가 한다.
 * 나중에 양이 늘면 토픽을 지역별로 쪼갤 수 있다 — 그때 이 정책도 같이 좁힌다.
 *
 * 이 토픽에는 위 트리거가 고른 값만 실린다. 그래서 조건 없이 연다.
 */
create policy "anyone can listen to field reports" on realtime.messages
  for select to anon, authenticated
  using (extension = 'broadcast' and realtime.topic() = 'field-reports');
