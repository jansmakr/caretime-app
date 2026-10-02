-- ============================================================
-- 신고한 사람의 세션을 지울 수 있게 만든다. **지금은 못 지운다.**
--
-- 실제로 겪은 것:
--   delete from guest_sessions where id = '...';
--   ERROR: new row for relation "reports" violates check constraint
--          "reports_single_reporter"
--
-- 왜 터지는가. reports 는 신고자가 둘 중 **정확히 하나**여야 한다는 제약을 들고 있다.
--   check ((reporter_guest_id is not null) <> (reporter_user_id is not null))
-- 그런데 FK 는 `on delete set null` 이다. 비회원 세션을 지우면 reporter_guest_id 가
-- null 이 되고, 그 행은 둘 다 null 이라 제약을 위반한다 → **삭제가 실패한다.**
--
-- 이것이 왜 큰 문제인가:
--   purge_expired() 는 세션을 한 문장으로 지운다(delete ... where id in (...)).
--   그 안에 신고를 한 번이라도 한 세션이 하나 끼면 **문장 전체가 실패하고,
--   트랜잭션이 돌아가면서 그날의 삭제가 아무것도 안 된다.** 한 사람의 신고 하나가
--   모든 보관 기간을 영구 정지시킨다. 증상은 없다 — 화면은 그대로다.
--   방침에 "30일 후 삭제"를 쓴 뒤라면 그 자체가 위반이다.
--
-- 같은 종류의 사고를 전에도 겪었다(field_report_reactions.guest_id 가 NOT NULL 인데
-- set null 이었다, migration 20261004). 그래서 guest_sessions 를 가리키는 FK 를
-- 전부 다시 훑었고, 남은 것은 이 하나였다.
--
-- ── 고치는 방향 ─────────────────────────────────────────────
-- "정확히 하나"를 "**둘 다는 아니다**"로 바꾼다. 둘 다 null 인 행의 뜻은
-- "신고자의 세션이 보관 기간이 지나 지워졌다" 다 — 글에서 이미 쓰는 방식과 같다
-- (글은 남고 연결만 끊긴다).
--
-- 접수 시점에 신고자가 반드시 있어야 한다는 것은 **쓰기 경로가 보장한다.**
-- 신고를 넣는 길은 서버 라우트 하나뿐이고(RLS 에 insert 정책이 없다) 그 라우트는
-- 세션을 먼저 만든 뒤 reporter_guest_id 를 채운다. 제약으로 두 번 막지 않는다 —
-- 그 제약 때문에 삭제가 멈추는 쪽이 훨씬 나쁘다.
--
-- 신고 기록 자체는 남는다. 반복 신고자 판단은 세션이 살아 있는 동안(마지막 접속
-- 30일)만 가능하고, 그 뒤로는 "누가" 없이 "몇 건"만 남는다. 그게 맞다 —
-- 30일 넘게 안 돌아온 사람을 계속 추적할 이유가 없다.
-- ============================================================

alter table public.reports
  drop constraint reports_single_reporter,
  add constraint reports_single_reporter check (
    not (reporter_guest_id is not null and reporter_user_id is not null)
  );
