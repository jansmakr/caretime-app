-- ============================================================
-- 병원을 손으로 넣을 수 있게 한다. 공공데이터 배치도 이 모양을 쓴다.
--
-- 초안(docs/schema/8a-public-data.draft.sql)을 그대로 옮긴 것이다. 실측 전에 적용하는
-- 이유: 강서구 달빛어린이병원 두 곳을 **지금** 넣기로 했고, 그러려면 hpid·좌표가
-- nullable 이어야 하고 분류 컬럼이 있어야 한다. 없으면 한 줄도 못 넣는다.
--
-- 실측이 바꿀 수 있는 것은 스키마가 아니라 값이다 —
--   · 야간 기준 20:00 (쿼리 상수. 코드에 있다)
--   · dutyTime*c 파싱 (배치 코드)
--   · Q0/Q1 지원 여부 (배치 코드)
-- 표의 모양은 그 결과와 무관하다. 그래서 지금 적용한다.
--
-- ── 좌표는 1차에서 선택이다 ──────────────────────────────────
-- 좌표가 필요한 것은 거리순 정렬과 지도인데 1차 현장톡에는 둘 다 없다. 병원은 고르는
-- 대상일 뿐이고 목록이 세 곳이라 거리를 잴 일이 없다. 게다가 지금 거리 계산은 고정
-- 데모 출발점을 쓰고(위치정보 동의 UI 가 없어 막아 둔 상태) 좌표를 넣어도 진짜 거리가
-- 나오지 않는다.
-- 빼먹은 것이 아니라 미룬 것이다 — docs/OPEN-QUESTIONS.md 에 적어 뒀다.
-- ============================================================

-- ── 1. 지역 ─────────────────────────────────────────────────
/*
 * address 를 파싱하지 않는다. Q0/Q1 로 요청했으니 그 값을 그대로 저장한다.
 * 파싱하면 "서울특별시 강서구"와 "서울 강서구"가 갈리고, 둘이 다른 지역이 된다.
 *
 * 현장톡 글(field_reports.sido/sigungu)과 **같은 표기**를 써야 한다. 다르면 지역으로
 * 좁혔을 때 병원과 글이 서로 안 맞는다.
 */
alter table public.hospitals
  add column if not exists sido text,
  add column if not exists sigungu text;

create index if not exists hospitals_region on public.hospitals (sido, sigungu);

-- ── 2. 요일별 진료시간 ───────────────────────────────────────
/*
 * 지금 hospitals.regular_open/regular_close 는 **요일 구분이 없는 하나**다.
 * 공공데이터는 8개(월~일 + 공휴일)를 준다. 야간·휴일 판정이 이 서비스의 핵심인데
 * 하나로 접으면 그 정보를 버린다.
 *
 * 기존 두 컬럼은 지우지 않는다 — 읽는 코드가 있다(rows.toTodayHours).
 * 그쪽을 이 표로 옮기는 것은 별도 작업이고, 그때까지 둘이 함께 있다.
 *
 * ── time 이 아니라 분(minute)으로 두는 이유 ──
 * 야간 진료는 자정을 넘긴다. '25:30' 은 time 에 들어가지 않는다(24:00 까지만).
 * 그래서 00:00 기준 분으로 둔다. close_minutes 1530 = 다음날 01:30.
 * 이렇게 두면 "지금 열려 있나"를 뺄셈 하나로 판정할 수 있다.
 */
create table if not exists public.hospital_weekly_hours (
  hospital_id text not null references public.hospitals (id) on delete cascade,
  /* 1=월 … 7=일, 8=공휴일. 공공데이터 dutyTime{n}s/c 의 n 과 같다. */
  day smallint not null check (day between 1 and 8),
  open_minutes integer not null check (open_minutes between 0 and 1439),
  /* 자정을 넘기면 1440 을 넘는다. 상한은 다음날 정오로 둔다 — 그보다 길면 데이터 오류다. */
  close_minutes integer not null check (close_minutes between 1 and 2160),
  primary key (hospital_id, day),
  constraint weekly_hours_order check (close_minutes > open_minutes)
);

/*
 * 휴진인 날은 **행을 만들지 않는다.** open=close=0 같은 값으로 채우면
 * "쉬는 날"과 "자료 없음"을 구분할 수 없다.
 */

-- ── 3. 분류 ─────────────────────────────────────────────────
/*
 * 분류 컬럼 하나로 만들지 않는다. "달빛어린이병원이면서 응급실도 있는 곳"을 표현할 수
 * 없고, 나중에 분류가 늘면 전부 다시 짜야 한다. 각각 독립된 사실이다.
 *
 * is_moonlight / has_emergency_room 은 공공데이터에서 온다.
 * night_until_minutes / weekend_open 은 요일별 진료시간에서 **계산한** 값이다 —
 * 매번 8개 행을 훑지 않고 목록을 정렬·필터하기 위해 둔다.
 */
alter table public.hospitals
  add column if not exists is_moonlight boolean not null default false,
  add column if not exists has_emergency_room boolean not null default false,
  /* 평일(1~5) 중 가장 늦은 마감. 00:00 기준 분. 야간 진료가 없으면 null. */
  add column if not exists night_until_minutes integer,
  /* 토(6) 또는 일(7) 에 진료하는가. */
  add column if not exists weekend_open boolean not null default false,
  /* 기관종별 (dutyDivNam): '의원' · '병원' · '종합병원' 등. 화면 문구에 쓴다. */
  add column if not exists duty_div text;

create index if not exists hospitals_moonlight on public.hospitals (sido, sigungu)
  where is_moonlight;

/*
 * 1차 목록에 넣을 조건 — 셋 중 하나라도 해당.
 *   is_moonlight
 *   has_emergency_room
 *   night_until_minutes >= 1200 (20:00) 또는 weekend_open
 *
 * 야간 기준 20:00 의 근거: 일반 의원은 18~19시 마감이 표준이고, 서울시
 * '우리아이 안심의원' 기준이 "평일 19~21시 또는 22시까지"다. 20시는 그 하한과 맞는다.
 * 이 값은 실측 후 조정한다 — 강서구에서 20시가 너무 많거나 너무 적으면 바꾼다.
 */

-- ── 4. 수동 입력 병원 ────────────────────────────────────────
/*
 * hpid 를 nullable 로 바꾼다.
 *
 * 왜: 공공데이터에 아직 없는 병원을 손으로 넣어야 한다(서울시 '우리아이 안심의원'은
 * 시 사업이라 국립중앙의료원 API 에 없을 수 있다). 지금 hpid 는 not null 이다.
 *
 * 가짜 hpid('MANUAL-0001')를 만들지 않는다. 진짜처럼 보이는 값은 화면·로그로 새어
 * 나가고, 나중에 그것이 공공데이터 id 인지 우리가 만든 것인지 구분할 수 없다.
 * 없는 것은 null 이다.
 */
alter table public.hospitals alter column hpid drop not null;

/*
 * 좌표도 nullable 로. 위 머리글의 이유다.
 * 0,0 으로 채우지 않는다 — 그건 아프리카 서쪽 바다이고, 계산에 들어가면 조용히
 * 틀린 거리가 나온다. 모르는 것은 null 이다.
 * (features/discovery/match.hasValidCoords 가 0,0 도 무효로 보지만, 애초에 넣지 않는다)
 */
alter table public.hospitals
  alter column lat drop not null,
  alter column lng drop not null;

/*
 * 중복은 registry_key 로 막는다. 이 컬럼과 부분 unique 인덱스는 이미 있다
 * (migration 20260926). 그 자리를 쓰는 것이다.
 *
 * 키 모양: '<시군구>|<이름에서 공백·기호를 뺀 것>'
 *   예: '강서구|강서푸른꿈성모어린이병원'
 *
 * 수동 입력과 배치가 **같은 함수**로 이 값을 만든다(features/hospitals/registryKey.ts).
 * 그래서 나중에 API 로 같은 병원이 들어오면 새 행이 아니라 그 행이 갱신되고,
 * hpid 가 그때 채워진다. 행이 유지되므로 그 병원을 가리키던 현장톡 글도 그대로다.
 *
 * ⚠️ 이 키로 못 잡는 경우가 있다. 자동 병합하지 않고 사람에게 알린다 —
 *    개명(이름이 바뀌면 다른 키), 이전(시군구가 바뀌면 다른 키),
 *    같은 시군구의 동명 병원(같은 키인데 다른 병원).
 *    배치는 전화번호가 겹치는 다른 키를 발견하면 보고만 하고 건드리지 않는다.
 */

-- ── 5. 동기화 흔적 ──────────────────────────────────────────
/*
 * 응답에 없어진 병원을 **지우지 않는다.** 지우면 그 병원을 가리키던 현장톡 글의
 * hospital_id 가 null 이 되고(on delete set null), 글의 문맥이 사라진다.
 * 대신 synced_at 이 오래된 것으로 남는다. 목록에서 내리는 판정은 읽는 쪽이 한다.
 *
 * 수동 입력 병원은 배치가 건드리지 않아야 하므로 출처를 남긴다.
 */
alter table public.hospitals
  add column if not exists source text not null default 'public_data'
    check (source in ('public_data', 'manual'));
