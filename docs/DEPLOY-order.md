# 운영 DB 적용 순서

**사람이 보고 실행하는 문서다.** 명령어를 그대로 복사해 쓸 수 있게 적었다.

지금 migration **11개**가 로컬에만 있다. 베타 시작 직전에 올린다.

---

# 적용 직전 점검 목록

**이 목록을 위에서 아래로 하나씩 한다.** 각 항목의 자세한 설명은 아래 절들에 있다.
중간에 막히면 멈추고, 그 지점을 고친 뒤 처음부터 다시 본다 — 되돌리는 스크립트가
없기 때문이다.

## A. 올리기 전 (로컬에서)

- [ ] `supabase db reset` 이 처음부터 깨끗하게 돌았다
- [ ] `npm run seed:localuser` · `npm run import:manual-hospitals` 가 끝났다
- [ ] `npm run build` · `npx tsc --noEmit` 통과
- [ ] `npm run test` · `npm run test:realtime` 통과
      — `db reset` 직후 첫 실행에서 broadcast 묶음(`tests/broadcast.serviceStatuses`)이
        깨지면 **한 번 더 돌린다.** Realtime 서버가 replication slot 을 처음 만드는
        사이의 경합이고, 재실행에도 깨지면 그건 환경이 아니라 코드다
- [ ] `supabase db diff` → **No schema changes found**
- [ ] 로컬 리허설을 한 번 했다 (아래 「리허설」 절)

## A-2. 운영 프로젝트로 바꾸는 법 — **`.env.local` 은 손대지 않는다**

두 곳이 서로 다른 키를 들고 있고, 섞으면 사고가 난다.

| 어디 | 무슨 키 | 누가 쓰나 |
|---|---|---|
| `.env.local` | **로컬 스택**(127.0.0.1:54321) | `npm run test` · `test:realtime` · `import:manual-hospitals` |
| Vercel 환경변수 | **운영 프로젝트** | 배포된 서비스 |
| `supabase link` | **운영 프로젝트** | `db push` 할 때만 |

`.env.local` 을 운영 키로 바꾸면 **테스트가 운영 DB 에 글을 쓴다.** 그 테스트들은
글·세션·신고를 만들고 지운다. 그래서 바꾸지 않는다 — 로컬은 끝까지 로컬이다.

### ⚠️ 운영에 link 된 동안 절대 치지 말 것

```bash
supabase db reset --linked     # 운영 DB 를 비운다. 되돌릴 백업이 없다
supabase db push --include-seed # 가상 병원 5곳이 운영에 들어간다
```

`db reset` 은 평소 로컬에 쓰는 명령이라 손이 먼저 간다. 그래서 **올린 직후 link 를
끊는다.** 끊으면 `--linked` 가 붙은 명령이 갈 곳이 없어진다.

```bash
# 1) 운영에 붙인다 (DB 비밀번호를 묻는다)
supabase link --project-ref <운영 ref>
supabase projects list          # LINKED 표시가 운영 쪽에 있는지 눈으로 본다

# 2) 무엇이 올라가는지 본다
supabase db push --dry-run      # → 11개 파일. 그 외에 아무것도 없어야 한다

# 3) 올린다
supabase db push

# 4) 바로 끊는다
supabase unlink
supabase projects list          # LINKED 표시가 사라졌는지 확인
```

링크를 끊어도 로컬 스택과 테스트는 그대로 돈다. 둘은 상관이 없다 —
로컬은 `.env.local` 과 도커 컨테이너만 본다.

## B. 어느 프로젝트에 올리는가

- [ ] `supabase projects list` 로 ref 를 눈으로 확인했다
- [ ] `supabase link --project-ref <ref>` 를 그 ref 로 했다
- [ ] **`supabase db push --dry-run` 결과가 11개 파일이고 그 외에 없다**

## C. 가짜 데이터가 운영에 들어가지 않는가

- [ ] **`supabase/seed.sql` 을 적용하지 않는다.** 가상 병원 5곳(`가상한빛외과의원` 등)이
      들어 있다. `db push` 는 seed 를 올리지 않지만, `db reset --linked` 같은 명령은
      올린다 — **운영을 대상으로 `db reset` 을 쓰지 않는다**
- [ ] 적용 후 `select count(*) from hospitals where name like '가상%';` → **0**

## D. 올린다

- [ ] `supabase db push`
- [ ] 4번(`20260929`)과 5번(`20260930`) 사이에서 멈추지 않았다 — 한 번에 이어서 돌았다

## E. 올린 직후 SQL 로 확인 (아래 「적용 후 확인」의 질의들)

- [ ] 공개 뷰가 다 생겼다
- [ ] **anon 이 쓸 수 있는 표가 0개** (`cmd='INSERT'` + `anon` 정책 0행)
- [ ] 신고 자동 격리 트리거 `quarantine_on_report` 가 있다
- [ ] `select * from cron.job;` → **두 줄**
      (`purge-expired` `0 19 * * *` · `close-stale-reports` `0 18 * * *`)
      → 없으면 아래 「크론이 안 걸렸을 때」를 본다. **방침에 적은 보관 기간이
        지켜지지 않는 상태**이므로 넘어가지 않는다
- [ ] `select * from public.purge_health();` 가 같은 두 줄을 돌려준다
- [ ] `select subject, keep_days from public.retention_policy;` → 6행
- [ ] `reports_single_reporter` 제약이 `NOT (... AND ...)` 모양이다
      (`<>` 가 보이면 10번이 안 올라간 것 — 세션 삭제가 실패하고 그날의 삭제가 멈춘다)

### 크론이 안 걸렸을 때 — migration 은 조용히 넘어간다

9·10번의 스케줄 등록은 `do` 블록 안에 있고 **실패하면 notice 만 남기고 넘어간다**
(권한이 없는 환경에서 migration 전체가 깨지지 않게 그렇게 만들었다). 그래서
`db push` 가 성공해도 크론이 없을 수 있다. 함수는 이미 만들어져 있으니 스케줄만
손으로 걸면 된다.

```sql
-- 1) 확장을 켠다 (Dashboard → Database → Extensions 에서 pg_cron 을 켜도 된다)
create extension if not exists pg_cron;

-- 2) 두 작업을 걸어 준다
select cron.schedule('close-stale-reports', '0 18 * * *',
                     $$select public.close_stale_reports();$$);
select cron.schedule('purge-expired',       '0 19 * * *',
                     $$select public.purge_expired();$$);

-- 3) 확인
select * from public.purge_health();
```

같은 이름으로 두 번 걸면 덮어쓴다(`cron.schedule` 은 이름이 같으면 갱신한다).
그래서 이미 걸려 있어도 위 두 줄을 그냥 실행해도 된다.

## F. 수동 병원 2곳

- [ ] `npm run sql:manual-hospitals -- --out manual.sql` 로 뽑아 콘솔 SQL 로 넣었다
      (`import:manual-hospitals` 는 로컬 전용 가드가 있어 운영에 쓰지 않는다.
       `>` 로 받으면 한글 주석이 깨진다 — `--out` 을 쓴다)
- [ ] `select id, name, tel from hospitals where id like 'm%';` → 2행, 전화번호가 맞다

## G. 환경변수 (Vercel Project Settings → Environment Variables)

앱이 읽는 변수는 **이 일곱 개가 전부다**(`grep process.env src` 로 뽑았다).
Production·Preview 양쪽에 같은 값을 넣는다 — Preview 가 운영 DB 를 가리키게 두지
않으려면 Preview 는 비워 두거나 따로 판단한다.

| 이름 | 값 | 없으면 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 운영 프로젝트 URL | Mock 으로 돈다(병원 0곳) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 운영 anon 키 | 같음 |
| `SUPABASE_SERVICE_ROLE_KEY` | 운영 service_role 키 | **쓰기 라우트가 전부 실패한다** |
| `CARETIME_WRITES` | 공개 전에는 `closed`, 공개일에 지운다 | 화면 플래그를 따른다(열림) |
| `NEXT_PUBLIC_DEMO_CONTENT` | **넣지 않는다** | 꺼짐(원하는 상태) |
| `NEXT_PUBLIC_FIELD_TALK_LIVE` | **넣지 않는다** | 켜짐(원하는 상태) |
| `GUEST_LIMIT_POSTS` 외 3개 | 넣지 않는다 | PRD 기본값 |

제한값 변수 넷은 `GUEST_LIMIT_POSTS` · `GUEST_LIMIT_REACTIONS` ·
`GUEST_LIMIT_REPORTS` · `GUEST_LIMIT_DUPLICATE_MINUTES` 이고 형식은 `창초:건수` 를
쉼표로 이은 것이다(`30:1,3600:10,86400:30`). 도배가 시작될 때 재빌드 없이 조이는
경로다. 읽을 수 없는 값이면 **기본값**을 쓴다 — 오타 때문에 제한이 풀리지 않게.

- [ ] `SUPABASE_SERVICE_ROLE_KEY` 에 **`NEXT_PUBLIC_` 접두사가 붙어 있지 않다.**
      붙으면 브라우저 번들로 새고 RLS 가 무의미해진다. 이름을 눈으로 다시 읽는다
- [ ] `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` 가 운영 프로젝트 값이다
- [ ] **`NEXT_PUBLIC_DEMO_CONTENT` 가 없다.** 있으면 가상 병원·가상 제보가 켜진다
- [ ] `NEXT_PUBLIC_FIELD_TALK_LIVE` 가 없다 (기본 켜짐)
- [ ] **`CARETIME_WRITES=closed`** — 공개일 전까지. 아래 「공개 전 기간」 참고
- [ ] 로컬 테스트 변수(`E2E_PARTNER_EMAIL`·`E2E_PARTNER_PASSWORD`)를 운영에 넣지 않았다

## H. 배포와 리전

- [ ] `vercel.json` 이 저장소에 있다 (`{ "regions": ["icn1"] }`)
- [ ] 배포가 리전 때문에 거부되지 않았다 — 무료 요금제는 리전을 **하나만** 고를 수 있다.
      거부되면 그 메시지를 그대로 남긴다
- [ ] 배포 후 함수 리전이 실제로 서울인지 본다:
      `vercel inspect <배포 URL>` 또는 Project → Functions 탭의 Region 표시 → `icn1`
- [ ] 미국 리전으로 떨어졌으면 **방침의 국외 이전 조항이 필요해진다.** 그대로 두지 않는다

## H-2. 공개 전 기간 — 배포일과 시행일이 다를 때

**시행일은 미정이고, 정해지면 배포일과 같은 날로 맞춘다. 그래서 이 절은 평소에
쓰지 않는다** —
`CARETIME_WRITES` 를 건드릴 필요가 없고, 배포한 날부터 `policy_version` 이 박힌다.
아래는 **시행일 전에 띄워야 할 때**를 위한 절차다(하루 먼저 올려 두고 싶을 때).

배포와 방침 시행일 사이가 비면 그 사이에 **글이 들어오면 안 된다.** 시행 전 수집은 근거가 없고, 그때 만들어진 세션은 동의
기록(`policy_version`)이 없는 채로 남는다. 주소를 아는 사람은 들어오므로
`noindex` 로는 막히지 않는다.

- [ ] (시행일에 배포하는 경우) 아래를 건너뛴다. 쓰기를 닫지 않는다
- [ ] 배포 직후 **쓰기를 열어 둔 채** I 절을 끝낸다 (글 쓰기·삭제·422 확인)
- [ ] 확인에 쓴 글을 **[삭제]로 지운다**
- [ ] `CARETIME_WRITES=closed` 를 넣고 **다시 배포한다**
- [ ] 닫혔는지 확인한다 — 글쓰기 버튼을 눌러도 올라가지 않고, 아래도 확인한다

```bash
curl -i -X POST https://<운영주소>/api/field-reports   -H 'Content-Type: application/json'   -d '{"id":"00000000-0000-4000-8000-000000000000","category":"other","body":"닫힘 확인"}'
# → HTTP/2 503  {"error":"아직 준비 중입니다."}

curl -s https://<운영주소>/api/guest
# → {"nickname":null,"myPostIds":[]}   세션을 만들지 않는다(쿠키도 없다)
```

- [ ] 확인 기간에 만들어진 세션이 없다:
      `select count(*) from guest_sessions;` → **0**
- [ ] 공개일에 `CARETIME_WRITES` 를 **지우고 다시 배포한다.** 그다음 글 1건을 올려
      `select policy_version from guest_sessions order by created_at desc limit 1;`
      → `terms=…;privacy=…` 가 찍힌다 (null 이면 시행일이 아직 안 온 것이다)

닫혀 있는 동안에도 **읽기와 자기 글 삭제는 열려 있다.** 문을 닫는 것이 이미 들어온
글을 가두는 일이 되면 안 된다. 테스트가 이 조합을 고정한다
(`tests/writeGate.realtime.test.ts`).

## I. 띄워서 읽는다 (운영 주소로)

- [ ] `/` — 주 버튼이 현장톡 하나다
- [ ] `/chat` — 빈 방 안내가 나온다. **글 1건을 실제로 써 본다**
- [ ] 그 글이 다른 브라우저(시크릿 창)에서도 보인다
- [ ] 쓴 브라우저에서 그 글 옆 **[삭제] → [지운다]** 로 지워진다. 시크릿 창에서도 사라진다
- [ ] 전화번호가 섞인 글은 거절된다 (예: `010-1234-5678` 을 적어 본다)
- [ ] `/hospital/<수동 병원 id>` — 주소·전화가 맞다. 전화 버튼이 눌린다
- [ ] `/partner`, `/partner/login` — **404**
- [ ] `/terms`, `/privacy` — 본문이 나온다. 하단 동의 링크도 보인다.
      시행일 전이면 "YYYY-MM-DD 부터 시행됩니다" 가 위에 붙는다
- [ ] HTML 에 `가상` 이 없다
- [ ] 맨 위에 **베타 안내**가 붙는다 (DEMO 가 아니다). `DEMO` 가 보이면
      `NEXT_PUBLIC_DEMO_CONTENT` 가 켜진 것이다
- [ ] `curl -s <주소> | grep 'name="robots"'` → **`noindex, nofollow`**

## J. 다음 날

- [ ] `select * from public.purge_health();` 의 `last_run_at` 에 시각이 찍혔다
      → 비어 있으면 크론이 등록만 되고 돌지 않았다
- [ ] `select count(*) from public.reports where state in ('OPEN','REVIEWING')
       and created_at < now() - interval '7 days';` → 0
      (운영 질의는 [OPS-moderation.md](OPS-moderation.md))

---

## 적용 전 확인

```bash
# 1. 로컬에서 처음부터 다시 돌아가는지
supabase db reset
npm run seed:localuser
npm run build
npm run test
npm run test:realtime

# 2. 로컬 스키마가 migration 파일과 같은지 (차이가 있으면 멈춘다)
supabase db diff
# → "No schema changes found" 가 아니면 적용하지 않는다
```

## 리허설 — 운영에서 처음 하지 않는다

운영에서 중간에 막히면 되돌리기 어렵다(되돌리는 스크립트가 없다). **리허설에서
걸리는 것은 운영에서도 걸린다.** 그래서 빈 DB 에 migration 만 올리는 연습을 한다.

`db reset` 과 다른 점은 **`--no-seed`** 다. 평소 리셋은 `supabase/seed.sql`(가상 병원
5곳)까지 넣으므로, 그 상태로는 "운영에 가짜가 안 들어가는가"를 확인할 수 없다.

```bash
# 1. 빈 DB + migration 만 (seed.sql 없이)
supabase db reset --no-seed --local

# 2. 가짜가 없는지. 여기서 0 이 아니면 운영에도 들어간다
docker exec supabase_db_caretime psql -U postgres -d postgres   -c "select count(*) as 가상 from hospitals where name like '가상%';"   -c "select count(*) as 병원 from hospitals;"
# → 가상 0 / 병원 0

# 3. 수동 병원 2곳 — **운영에 붙여 넣을 그 SQL 로** 넣는다
npm run sql:manual-hospitals -- --out manual.sql
docker exec -i supabase_db_caretime psql -U postgres -d postgres < manual.sql
# → 2행. 한 번 더 실행해도 2행이어야 한다(두 번 눌리는 일이 흔하다)

# 4. 적용 후 확인 질의들 (아래 「적용 후 확인」 절 전체)

# 5. 화면이 뜨는가
npm run build && npm run start   # 다른 포트를 쓸 때는 next start -p 3001
```

⚠️ **셸 리다이렉트(`>`)로 받지 말고 `--out` 을 쓴다.** 두 가지가 걸린다.

- PowerShell 의 `>` 는 Node 의 UTF-8 출력을 **다시 인코딩해서 한글 주석을 깨뜨린다.**
  SQL 문법은 멀쩡해서 실행은 되지만 나중에 열면 못 읽는다. 실제로 겪었다.
  꼭 리다이렉트로 받아야 하면 `| Out-File -Encoding utf8 manual.sql` 를 쓴다
  (PowerShell 5.1 의 `-Encoding utf8` 은 BOM 을 붙인다. psql 은 BOM 을 견디는 것을
  확인했지만, 콘솔 편집기에 붙여 넣을 때 앞에 보이지 않는 글자가 낀다).
  `cmd /c "npm run --silent sql:manual-hospitals > manual.sql"` 도 바이트를 그대로
  넘기므로 안전하다.
- `--silent` 없이 리다이렉트하면 npm 배너 두 줄(`> caretime@0.1.0 …`)이 파일 맨
  위에 들어가고 psql 이 그 줄에서 멈춘다. 리허설에서 실제로 걸렸다.

`--out` 은 스크립트가 직접 UTF-8(BOM 없이)로 쓴다. 셸이 끼어들지 않으므로 둘 다
해당되지 않는다.

`npm run sql:manual-hospitals` 는 DB 에 붙지 않고 INSERT 문만 찍는다.
**로컬 투입(`import:manual-hospitals`)과 같은 매핑 코드를 쓴다** — 두 벌로 두면
리허설에서 통과한 SQL 과 운영에 붙여 넣는 SQL 이 달라지고, 그러면 리허설이
아무것도 보장하지 않는다. 손으로 고치지 말고 `data/manual-hospitals.json` 을 고쳐
다시 뽑는다.

### 리허설 결과 — 2026-10-02

migration 전부만 올린 DB(`db reset --no-seed`)에 수동 병원 2곳을 운영용 SQL 로 넣고
운영 빌드를 띄워 확인했다.

| 무엇 | 결과 |
|---|---|
| migration 전부 적용 | 통과. `db diff` → No schema changes found |
| 가상 병원 | **0행** (`name like '가상%'`). 병원도 0행에서 시작한다 |
| 수동 병원 SQL | 2행. **두 번 실행해도 2행** (upsert) |
| 공개 뷰 | 6개 다 생겼다 |
| anon INSERT 정책 | **0건** |
| 신고 자동 격리 트리거 | `quarantine_on_report` 있다 |
| 크론 | `purge-expired` `0 19 * * *` · `close-stale-reports` `0 18 * * *` |
| `reports_single_reporter` | `NOT (… AND …)` — 세션 삭제가 되는 모양 |
| 화면 | `/` `/chat` `/search` `/more` `/terms` `/privacy` 200, `/partner` **404**, 병원 2곳 200 |
| HTML 에 `가상` | **0** (`/search`·병원 상세 모두) |
| 글 쓰기 → 작성자에게 [삭제] → 지우기 | 200 / 보인다 / 200, 목록에서 사라졌다 |
| 전화번호 섞인 글 | **422** 거절 |

**걸린 것 둘.** 둘 다 운영에서도 걸렸을 것이다.

1. `npm run sql:manual-hospitals > manual.sql` 의 출력 맨 위에 npm 배너 두 줄이
   들어가서 psql 이 멈췄다 → `--silent` 로 고쳤다(위 명령).
2. **`capabilities` 마스터 7행이 `seed.sql` 에만 있다.** 운영에 seed 를 넣지 않으므로
   그 표가 **빈 채로 시작한다.** 1차에는 아무것도 깨지지 않는다 — 병원 상세의
   "등록된 진료기능"이 "등록된 세부 진료기능이 없습니다"로 나오고 그게 사실이다
   (참여 병원 0곳). 병원 입력 화면을 여는 턴에 migration 으로 넣어야 한다.
   그 7행은 외상 중심 분류라, 1차 지역의 진료과목에 맞춰 다시 세울 때 함께 넣는다.

## 순서

| # | 파일 | 무엇을 하는가 |
|---|---|---|
| 1 | `20260915130000_stage2_hospital_live.sql` | 병원 직접입력 4개 표 (이미 운영에 있을 수 있음) |
| 2 | `20260926120000_service_statuses.sql` | 항목별 공식 상태 + 보호자 공개 뷰 2개 |
| 3 | `20260927120000_p0_contract.sql` | PRD 계약 표 (posts·observations·reports·moderation) |
| 4 | **`20260929120000_field_reports.sql`** | 현장톡 글·반응 + broadcast |
| 5 | **`20260930120000_guest_writes.sql`** | 쓰기를 서버 전용으로 + 게스트 세션 연결 |
| 6 | `20261001120000_report_autoquarantine.sql` | 신고 → 즉시 격리 |
| 7 | `20261002120000_hospital_requests.sql` | 목록에 없는 병원 요청 (비공개) |
| 8 | **`20261003120000_hospital_public_data.sql`** | 지역·분류 컬럼 + `registry_key`, hpid·좌표를 nullable 로. **수동 병원 투입이 이 파일에 의존한다** |
| 9 | `20261004120000_retention_purge.sql` | 보관 기간 표 + 실제 삭제 + pg_cron 04:00 KST |
| 10 | `20261005120000_stale_reports_and_purge_health.sql` | 미처리 신고 90일 자동 종결 + 크론 상태 조회 |
| 11 | `20261006120000_reporter_unlink.sql` | 신고한 사람의 세션을 지울 수 있게 (제약 완화) |

### ⚠️ 4와 5는 **쌍이다**

`20260930` 이 `20260929` 가 만든 `field_report_reactions` 를 **비우고**(`delete from`)
컬럼을 바꾼다(`reactor_key` → `guest_id`).

- **4만 적용하면**: anon 이 현장톡에 직접 쓸 수 있는 상태로 남는다. rate limit 도,
  게스트 세션도 없다. anon 키는 브라우저 번들에 들어가는 공개 값이므로, 이 상태로
  배포하면 누구나 제한 없이 글을 넣을 수 있다.
- **둘 사이에 멈추면 안 된다.** 한 번에 이어서 적용한다.

### 9·10 은 pg_cron 이 필요하다

둘 다 `pg_available_extensions` 를 보고 없으면 **스케줄만 건너뛴다**(함수는 생긴다).
운영에서 건너뛰어지면 삭제가 돌지 않는다. 적용 후 확인에 그 질의가 있다.

10번은 9번이 만든 `retention_policy` 에 행을 넣으므로 9번 뒤에 와야 한다.
타임스탬프 순서가 이미 그렇다.

### 8번이 없으면 수동 병원이 한 줄도 안 들어간다

`20261003` 이 `registry_key` · `source` · `is_moonlight` · `has_emergency_room` ·
`night_until_minutes` · `weekend_open` 을 만들고 `hpid`·좌표를 nullable 로 바꾼다.
투입 SQL(`npm run --silent sql:manual-hospitals`)이 그 컬럼들을 쓴다.

### `20261001` 은 마지막이다

`reports` 표(3번)와 `field_reports`(4번)가 모두 있어야 트리거가 걸린다.
먼저 적용하면 없는 표를 참조해서 실패한다.

## 적용

Supabase CLI 가 타임스탬프 순서대로 적용한다. 따로 지정하지 않는다.

```bash
# 어느 프로젝트에 올리는지 먼저 확인한다
supabase projects list
supabase link --project-ref <운영 프로젝트 ref>

# 적용 전에 무엇이 올라가는지 본다
supabase db push --dry-run

# 올린다
supabase db push

# **바로 끊는다.** 운영에 붙어 있는 동안 db reset --linked 를 치면 비워진다
supabase unlink
```

`db push` 는 아직 적용되지 않은 migration 을 타임스탬프 순으로 전부 올린다.
위 표의 4·5가 그 안에서 연달아 돌므로 둘 사이에 멈추지 않는다.
`seed.sql` 은 올리지 않는다(`--include-seed` 를 붙이지 않는 한).

## 적용 후 확인

```bash
# 스키마가 기대한 모양인지
supabase db diff --linked
# → "No schema changes found"

# 뷰·정책·트리거가 실제로 생겼는지 (Studio SQL 또는 psql)
```

```sql
-- 공개 뷰 4개
select table_name from information_schema.views where table_schema='public' order by 1;
-- → field_report_reaction_counts, field_reports_public,
--    hospital_services_public, observation_counts, posts_public, service_statuses_public

-- anon 이 쓸 수 있는 표가 없어야 한다 (insert 정책 0건)
select tablename, policyname, cmd from pg_policies
 where schemaname='public' and cmd='INSERT' and roles::text like '%anon%';
-- → 0행

-- 신고 자동 격리 트리거
select tgname from pg_trigger where not tgisinternal
   and tgrelid = 'public.reports'::regclass;
-- → quarantine_on_report

-- 삭제·종결 크론이 등록됐는가. **이것을 건너뛰면 삭제가 안 도는 것을 알 수 없다.**
select * from public.purge_health();
-- → purge-expired       | t | 0 19 * * * | ...
--    close-stale-reports | t | 0 18 * * * | ...
-- scheduled 가 f 이거나 행이 없으면 pg_cron 이 없는 것이다. 그러면 방침에 적은
-- 보관 기간이 지켜지지 않는다 — 올린 뒤 바로 본다.

-- 신고자 연결을 끊을 수 있는가. 못 끊으면 세션 삭제가 실패하고, 그러면 그날의
-- 삭제가 전부 멈춘다(증상 없음). 10번 migration 이 올라갔는지 보는 질의다.
select pg_get_constraintdef(oid) from pg_constraint where conname='reports_single_reporter';
-- → CHECK ((NOT ((reporter_guest_id IS NOT NULL) AND (reporter_user_id IS NOT NULL))))
--   '<>' (정확히 하나)가 보이면 아직 안 올라간 것이다.

-- 보관 기간 표가 코드와 같은가 (테스트가 보지만 운영에서도 한 번 본다)
select subject, keep_days from public.retention_policy order by subject;
-- → field_reports 30 / guest_sessions 30 / hospital_requests 365 /
--    observations 7 / reports 365 / reports_unreviewed 90
```

## 배포 리전 — `icn1` (서울)

`vercel.json` 에 박아 뒀다.

```json
{ "regions": ["icn1"] }
```

왜 고정하는가:

1. **지연.** 정하지 않으면 Vercel 기본값 `iad1`(미국 동부)이고, 한국 이용자의 요청이
   태평양을 왕복한다. 야간에 급한 사람이 쓰는 서비스에서 수백 ms 가 붙는다.
2. **방침 문구가 달라진다.** 처리 위탁 칸에 실제 리전을 적어야 하고, 미국이면
   개인정보 국외 이전 고지가 따라온다. 국내에 두면 그 조항이 필요 없다.
   (Supabase 도 `ap-northeast-2` 서울이다 — 둘을 같은 나라에 둔다.)

무료 요금제에서 함수 리전은 **하나만** 고를 수 있다. 하나이므로 통과해야 하지만,
`vercel deploy` 가 리전 때문에 거부되면 그 메시지를 그대로 보고한다.

⚠️ 한 가지는 법무 판단이다: **"리전이 국내"와 "수탁자가 해외 법인"은 다른 문제다.**
저장·처리는 서울에서 일어나지만 Vercel Inc.·Supabase Inc. 는 미국 법인이다.
위탁 고지에 법인명을 적는 것과, 국외 이전 조항이 필요한지는 따로 판단해야 한다.

## 적용 직후 해야 하는 것

1. **환경변수.** `SUPABASE_SERVICE_ROLE_KEY` 가 서버에 있어야 쓰기 라우트가 돈다.
   `NEXT_PUBLIC_` 접두사를 붙이면 안 된다 — 브라우저로 새면 RLS 가 무의미해진다.
2. **`NEXT_PUBLIC_DEMO_CONTENT` 는 설정하지 않거나 `0`.** 가짜 병원·가짜 제보가 켜진다.
3. **`NEXT_PUBLIC_FIELD_TALK_LIVE`** 는 기본 켜짐이다. 문제가 생기면 `0` 으로 재배포 없이
   쓰기만 닫을 수 있다.
4. 제한값을 조이려면 `GUEST_LIMIT_POSTS` 등 (`docs/OPEN-QUESTIONS.md` 2번).
5. **`select * from public.purge_health();`** 를 다음 날 한 번 더 본다.
   `last_run_at` 이 비어 있으면 크론이 등록만 되고 돌지 않은 것이다.

## 되돌리기

**migration 을 되돌리는 스크립트는 없다.** 되돌리려면 손으로 drop 해야 하고,
그 사이에 들어온 글이 사라진다.

그래서 적용 전 확인(맨 위)을 건너뛰지 않는다. 로컬에서 `db reset` 이 처음부터
깨끗하게 돌지 않으면 운영에 올리지 않는다.
