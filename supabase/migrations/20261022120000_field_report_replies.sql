-- ============================================================
-- 답글. 글에 글로 답한다. **1단계만** — 답글에 답글은 없다.
--
-- 왜 새 표가 아니라 field_reports 에 parent_id 인가:
--   답글도 글이다. 같은 검증(개인정보·욕설)·같은 제한·같은 신고 자동 격리
--   (quarantine_on_report 는 target_type='post' 면 field_reports 의 그 id 를 내린다)·
--   같은 본인 삭제(DELETE /api/field-reports/[id])·같은 보관 규칙(글은 자동 삭제하지
--   않는다, 20261007)을 그대로 탄다. 표를 나누면 그 다섯을 두 벌로 들고 가야 하고,
--   한쪽에만 고친 것이 남는 날이 온다.
--
-- 구버전 화면과의 관계:
--   · field_reports_public 은 **원글만** 내보낸다(parent_id is null). 이 migration 을
--     화면보다 먼저 올려도 구버전 화면이 답글을 원글처럼 그리지 않는다.
--   · 답글은 broadcast 로 내보내지 않는다(새 구독 없이 30초 재읽기, 2026-10-22 결정).
--     내보내면 구버전 화면이 'field_report' 이벤트로 받아 원글로 그린다.
--     격리·삭제는 지금처럼 'field_report_removed' {id} 로 알린다 — 모르는 id 는
--     구버전·신버전 모두 무시한다.
--   · 화면을 먼저 배포하면 아래 두 뷰가 없어 읽기가 실패한다. 화면은 그때 답글 영역을
--     숨긴다(features/chat/useReplies).
--
-- 수집 항목은 늘지 않는다. 답글의 행은 원글과 같은 컬럼이고(본문·별명 사본·세션 FK·
-- 작성 시각), 지역·병원 칸은 비워 둔다.
--
-- ── 되돌리기 ────────────────────────────────────────────────
-- 가벼운 되돌림(권장). 컬럼과 답글 데이터는 남기고 화면에서만 내린다:
--
--   drop view if exists public.field_report_reply_counts;
--   drop view if exists public.field_report_replies_public;
--   create or replace view public.field_reports_public as      -- 20261007 정의 그대로
--     select r.id, r.category, r.topic, r.body, r.sido, r.sigungu,
--            r.hospital_id, r.hospital_name, r.handle, r.created_at
--       from public.field_reports r
--      where r.visibility not in ('QUARANTINED', 'REMOVED')
--        and (r.public_until is null or r.public_until > now());
--   -- broadcast_field_report() 는 20261007 의 정의를 다시 실행한다
--   -- (parent_id 가지만 빠진다. 그대로 두어도 원글 동작은 같다).
--
--   ⚠️ create or replace view 는 컬럼을 줄일 수 없다. 위 정의는 이 파일이 컬럼을 늘리지
--      않았으므로 그대로 통한다(원글 뷰는 where 만 바뀌었다).
--
-- 완전 되돌림 — **답글 데이터가 영구히 지워진다. 별도 승인 없이 하지 않는다:**
--
--   drop index if exists public.field_reports_replies;
--   alter table public.field_reports drop column parent_id;
-- ============================================================

-- ── 1. 컬럼 ────────────────────────────────────────────────
/*
 * 부모가 지워지면(행 삭제) 답글도 지운다. 지금 글은 행을 지우지 않고 visibility 만
 * 바꾸므로 평소에는 일어나지 않는다 — 운영자가 콘솔에서 행을 지울 때만 해당한다.
 * 부모가 격리·삭제(visibility)되면 답글은 남고 아래 뷰가 함께 숨긴다. 복구하면 함께 돌아온다.
 *
 * 1단계 제한(답글에 답글 없음)은 CHECK 로 못 건다(다른 행을 봐야 한다). 서버 라우트가
 * 막는다 — 쓰기는 그 경로뿐이다(insert 정책 회수, 20260930).
 */
alter table public.field_reports
  add column parent_id uuid references public.field_reports (id) on delete cascade;

alter table public.field_reports
  add constraint field_reports_parent_not_self check (parent_id is null or parent_id <> id);

create index field_reports_replies on public.field_reports (parent_id, created_at)
  where parent_id is not null;

-- ── 2. 원글 뷰는 원글만 ─────────────────────────────────────
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
    and (r.public_until is null or r.public_until > now())
    and r.parent_id is null;

-- ── 3. 답글 뷰 ─────────────────────────────────────────────
/*
 * 내보내는 것: 답글 id · 부모 id · 본문 · 별명 · 작성 시각. guest_id 는 내보내지 않는다.
 * 답글과 부모 **둘 다** 보이는 상태여야 나온다 — 부모가 신고로 내려갔는데 답글만
 * 남아 있으면 "무엇에 대한 답인지" 없는 글이 떠돈다.
 */
create view public.field_report_replies_public as
  select
    x.id,
    x.parent_id,
    x.body,
    x.handle,
    x.created_at
  from public.field_reports x
  join public.field_reports p on p.id = x.parent_id
  where x.parent_id is not null
    and x.visibility not in ('QUARANTINED', 'REMOVED')
    and (x.public_until is null or x.public_until > now())
    and p.visibility not in ('QUARANTINED', 'REMOVED')
    and (p.public_until is null or p.public_until > now());

revoke all on public.field_report_replies_public from anon, authenticated;
grant select on public.field_report_replies_public to anon, authenticated;

/* 답글 수. 반응 수(field_report_reaction_counts)와 같은 방식 — 뷰가 거른 것만 센다. */
create view public.field_report_reply_counts as
  select
    v.parent_id,
    count(*)::integer as count
  from public.field_report_replies_public v
  group by v.parent_id;

revoke all on public.field_report_reply_counts from anon, authenticated;
grant select on public.field_report_reply_counts to anon, authenticated;

-- ── 4. broadcast: 답글은 내보내지 않는다 ─────────────────────
/* 20261007 의 정의에 parent_id 가지 하나만 더했다. */
create or replace function public.broadcast_field_report() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- 격리·삭제된 글은 내보내지 않는다. 이미 받은 쪽에는 사라졌다고 알린다(답글 포함).
  if new.visibility in ('QUARANTINED', 'REMOVED') then
    perform realtime.send(
      jsonb_build_object('id', new.id),
      'field_report_removed',
      'field-reports',
      true
    );
    return null;
  end if;

  -- 답글은 실시간으로 내보내지 않는다. 구버전 화면이 원글로 그린다(머리 주석).
  if new.parent_id is not null then
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
