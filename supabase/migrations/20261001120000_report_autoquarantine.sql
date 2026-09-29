-- ============================================================
-- 신고가 들어오면 **즉시** 안 보이게 한다. 복구만 사람이 정한다.
--
-- 왜 자동인가: 신고는 새벽에 들어온다. 운영자는 자고 있다. 사람이 볼 때까지 글이
-- 그대로 있으면, 그 몇 시간 동안 읽힐 만큼 읽힌다. 개인정보가 적힌 글이라면 지운 뒤에도
-- 이미 늦다.
--
-- 반대 방향의 위험은 안다 — 악의적 신고 하나로 멀쩡한 글이 내려간다. 그것을 받아들이는
-- 이유는 비대칭이다. 잘못 내린 글은 복구하면 원래대로 돌아오지만, 잘못 남긴 글은
-- 읽힌 것을 되돌릴 수 없다. 신고 자체에도 제한이 걸려 있다(시간당 5건).
--
-- 복구는 사람이 콘솔에서 한다. /admin 은 만들지 않는다 — 1차에는 신고가 하루 몇 건이고
-- 직접 봐야 판단이 된다. 복구 SQL 은 이 파일 맨 아래에 적어 둔다.
-- ============================================================

/*
 * reports.target_type 은 'post'·'observation'·'notice' 를 받는다(migration 20260927).
 * 현장톡 글은 'post' 로 들어온다 — field_reports 가 그 자리를 맡고 있다
 * (두 표의 관계는 20260929 머리 참고).
 *
 * 외래키를 걸지 않는다. target_type 에 따라 가리키는 표가 달라서 하나로 못 건다.
 * 대신 아래 트리거가 실제로 있는 글만 내린다.
 */

create function public.quarantine_on_report() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  affected integer;
begin
  if new.target_type <> 'post' then
    return null;
  end if;

  /*
   * 이미 내려간 글은 다시 내리지 않는다. 그래야 두 번째 신고가 moderation_actions 에
   * 같은 줄을 또 쌓지 않는다 — 기록이 부풀면 "몇 명이 신고했나"를 셀 때 틀린다.
   */
  update public.field_reports
     set visibility = 'QUARANTINED'
   where id = new.target_id
     and visibility = 'VISIBLE';

  get diagnostics affected = row_count;
  if affected = 0 then
    return null;
  end if;

  /*
   * 누가·언제·무엇을 내렸는지 남긴다. actor_id 는 null 이다 — 사람이 아니라 규칙이
   * 내린 것이고, 없는 사람을 적지 않는다.
   */
  insert into public.moderation_actions (report_id, target_type, target_id, action, reason_code, actor_id)
  values (new.id, new.target_type, new.target_id, 'QUARANTINE', 'auto_on_report', null);

  return null;
end $$;

create trigger quarantine_on_report after insert on public.reports
  for each row execute function public.quarantine_on_report();

/*
 * 격리되면 field_reports 의 broadcast 트리거가 'field_report_removed' 를 보낸다
 * (migration 20260929). 그래서 이미 화면을 열어 둔 사람에게서도 사라진다.
 * 여기서 따로 알릴 필요가 없다.
 */

-- ── RLS ─────────────────────────────────────────────────────
/*
 * 신고도 서버 라우트만 쓴다. anon 에게 열면 신고 자체가 도배 수단이 된다 —
 * 누구나 아무 글이나 즉시 내릴 수 있게 된다.
 * 읽기 정책도 만들지 않는다. 신고 목록은 운영자가 콘솔에서 본다.
 */
-- (reports·moderation_actions 의 RLS 는 20260927 에서 이미 켜져 있고 정책이 없다)

-- ============================================================
-- 운영자용 — 콘솔에서 쓰는 질의
--
-- 새 신고 보기:
--   select r.id, r.reason, r.detail, r.created_at,
--          f.body, f.sido, f.sigungu, f.hospital_name, f.handle
--     from reports r
--     join field_reports f on f.id = r.target_id
--    where r.state = 'OPEN' and r.target_type = 'post'
--    order by r.created_at;
--
-- 복구(신고가 잘못된 경우):
--   update field_reports set visibility = 'VISIBLE' where id = '<글 id>';
--   update reports set state = 'DISMISSED' where target_id = '<글 id>';
--   insert into moderation_actions (target_type, target_id, action, reason_code)
--   values ('post', '<글 id>', 'RESTORE', 'operator_review');
--
--   ⚠️ 복구해도 이미 화면을 닫은 사람에게는 다시 가지 않는다. 다시 열면 보인다.
--
-- 완전 삭제(개인정보가 적힌 경우 등):
--   update field_reports set visibility = 'REMOVED' where id = '<글 id>';
--   update reports set state = 'RESOLVED' where target_id = '<글 id>';
--   ⚠️ 행을 delete 하지 않는다. 지우면 같은 사람의 다른 글을 찾을 수 없다.
-- ============================================================
