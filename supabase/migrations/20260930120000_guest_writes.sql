-- ============================================================
-- 현장톡 쓰기를 서버로 옮긴다.
--
-- 20260929 는 anon 이 직접 쓸 수 있게 열어 두고, 그 위험을 migration 머리에 적어
-- "운영 적용 전에 rate limit 을 먼저"라고 못박았다. 그 조건을 지금 채운다.
--
-- 핵심은 **화면을 거치지 않는 요청**이다. anon 키는 브라우저 번들에 들어가는 공개
-- 값이라, 화면의 쿨다운은 그 키를 들고 직접 POST 하는 사람에게 아무 의미가 없다.
-- 그래서 anon 의 insert 정책을 회수한다. 쓰기는 서버 라우트(service_role)만 한다.
--
-- 판정이 서버에 있어야 하는 이유가 하나 더 있다 — 세션이다. 누가 몇 건 썼는지 세려면
-- 그 사람을 가리키는 값이 필요하고, 그 값을 클라이언트가 만들면 지우고 다시 만들면 그만이다.
-- ============================================================

-- ── anon 직접 쓰기를 닫는다 ──────────────────────────────────
drop policy "anyone can post" on public.field_reports;
drop policy "anyone can react" on public.field_report_reactions;

/*
 * 이제 이 두 표에는 어떤 역할에도 insert 정책이 없다.
 * service_role 은 RLS 를 우회하므로 서버 라우트만 쓸 수 있다.
 * 읽기는 그대로 뷰로만 나간다.
 */

-- ── 누가 썼는가 ─────────────────────────────────────────────
/*
 * guest_sessions 는 migration 20260927 이 이미 만들어 두었다(token_hash·nickname·expires_at).
 * 여기서는 글과 반응이 그 세션을 가리키게만 한다.
 *
 * nullable 이다. 이 컬럼이 생기기 전에 쓰인 글이 있을 수 있고, 그 글을 지우거나
 * 가짜 세션에 묶지 않는다. 앞으로 들어오는 글은 서버 라우트가 항상 채운다.
 *
 * **이 값은 공개 뷰에 넣지 않는다.** 세션 id 가 나가면 같은 사람이 쓴 글을 이어 붙일 수
 * 있고, 그건 익명이 아니다.
 */
alter table public.field_reports add column guest_id uuid references public.guest_sessions (id) on delete set null;
alter table public.field_report_reactions add column guest_id uuid references public.guest_sessions (id) on delete set null;

-- 최근 N건을 세는 질의가 이 순서로 돈다.
create index field_reports_by_guest on public.field_reports (guest_id, created_at desc);
create index field_report_reactions_by_guest on public.field_report_reactions (guest_id, created_at desc);

/*
 * 반응의 주체를 세션으로 바꾼다.
 *
 * reactor_key 는 브라우저가 만든 값이라 지우면 다시 누를 수 있었다. 이제 서버가
 * 세션으로 판정하므로 그 컬럼은 필요 없다. 남겨 두면 "이걸로도 막힌다"고 오해한다.
 */
delete from public.field_report_reactions;
alter table public.field_report_reactions drop constraint field_report_reactions_pkey;
alter table public.field_report_reactions drop column reactor_key;
alter table public.field_report_reactions alter column guest_id set not null;
alter table public.field_report_reactions add primary key (report_id, key, guest_id);

/*
 * 같은 세션이 같은 반응을 두 번 누르면 기본키가 막는다. 서버는 그것을 오류로 올리지 않는다 —
 * 이미 눌린 것이고, 사용자에게는 같은 결과다.
 */

-- ── 멱등성 ──────────────────────────────────────────────────
/*
 * 같은 요청이 두 번 와도 글이 두 개 생기지 않아야 한다. 모바일에서는 흔한 일이다 —
 * 응답이 늦어 사용자가 다시 누르거나, 네트워크가 재시도한다.
 *
 * 별도 표를 만들지 않는다. 글 id 를 클라이언트가 만들고(20260929 의 결정), 그 id 가
 * 그대로 멱등성 키가 된다. 두 번째 요청은 기본키에서 막히고, 서버는 그것을 성공으로
 * 돌려준다. 키를 따로 두면 "키는 같은데 내용이 다른" 경우를 또 정의해야 한다.
 *
 * 그래서 여기에 추가할 스키마가 없다. 이 주석이 그 사실을 적어 두는 자리다.
 */

-- ── 세션 정리 ───────────────────────────────────────────────
/*
 * 만료된 세션은 지우지 않는다. 지우면 그 세션이 쓴 글의 guest_id 가 null 이 되고
 * (on delete set null), 신고가 들어왔을 때 같은 사람의 다른 글을 찾을 수 없다.
 * 보관·삭제 정책(PRD §7.4)을 붙이는 턴에 글과 함께 정리한다.
 */
