# 운영 질의 — 신고를 제때 보고 있는가

**콘솔(Supabase Dashboard → SQL Editor)에서 사람이 실행하는 문서다.**
1차에는 `/admin` 화면이 없다. 신고는 하루 몇 건이고 직접 봐야 판단이 된다.

격리는 자동이다(신고 1건 → 즉시 내려간다). **사람이 하는 일은 복구 판단 하나다.**
그래서 "내가 보고 있는가"를 보는 질의가 먼저 온다.

---

## ① 지금 봐야 하는 것 — 7일 넘은 미처리 신고

이 한 줄이 운영 주기를 지켰는지 보는 값이다. **0이 아니면 밀린 것이다.**

```sql
select count(*) as 밀린_신고,
       min(created_at) as 가장_오래된_것
  from public.reports
 where state in ('OPEN', 'REVIEWING')
   and created_at < now() - interval '7 days';
```

### 그 신고들을 글과 함께 본다

```sql
select r.id         as 신고,
       r.created_at as 접수,
       (now() - r.created_at) as 지난_시간,
       r.reason,
       r.state,
       f.visibility as 글_상태,
       f.body       as 글_내용
  from public.reports r
  left join public.field_reports f on f.id = r.target_id
 where r.state in ('OPEN', 'REVIEWING')
 order by r.created_at
 limit 50;
```

글이 `null` 로 나오면 이미 지워진 글이다(작성자가 지웠거나 보관 기간이 지났다).
그때는 복구할 것이 없으므로 신고를 닫는다.

---

## ② 자동 종결이 돌았는가 — **운영을 안 하고 있다는 신호**

90일 동안 아무도 확인하지 않은 신고는 `close_stale_reports()` 가 닫는다.
**이 값이 0이 아니면 그 기간에 신고를 보지 않았다는 뜻이다.** 그래서 따로 센다.

```sql
select date_trunc('month', created_at) as 달,
       count(*) as 사람없이_닫힌_건수
  from public.moderation_actions
 where reason_code = 'auto_dismiss_unreviewed'
 group by 1
 order by 1 desc;
```

사람이 검토해서 기각한 것과 구분된다 — 자동 종결은 `actor_id` 가 null 이고
`reason_code` 가 `auto_dismiss_unreviewed` 다. 숫자가 보이기 시작하면 확인 주기를
줄이거나, 신고 자체가 많아진 것인지(① 과 함께) 본다.

---

## ③ 처리하는 법

### 복구한다 (정상 글이 잘못 내려갔다)

```sql
-- 글을 되살리고
update public.field_reports set visibility = 'VISIBLE' where id = '<글 id>';
-- 신고를 닫고
update public.reports set state = 'DISMISSED' where id = '<신고 id>';
-- 무엇을 했는지 남긴다. actor_id 는 콘솔에서 쓸 때 null 로 둔다.
insert into public.moderation_actions (report_id, target_type, target_id, action, reason_code)
values ('<신고 id>', 'post', '<글 id>', 'RESTORE', 'reviewed_ok');
```

⚠️ 공개 창은 따로다. `public_until` 이 이미 지났으면 되살려도 목록에 돌아오지 않는다
(공개 뷰가 `visibility` 와 `public_until` 을 함께 본다). 24시간이 지난 글을 되살리는
것은 기록상 복구이고, 보호자 화면에는 나타나지 않는다.

### 신고가 맞다 (글을 내린 채로 둔다)

```sql
update public.reports set state = 'RESOLVED' where id = '<신고 id>';
insert into public.moderation_actions (report_id, target_type, target_id, action, reason_code)
values ('<신고 id>', 'post', '<글 id>', 'REMOVE', 'reviewed_violation');
```

행은 보관 기간(작성 30일) 안에 `purge_expired()` 가 지운다. 손으로 지우지 않는다 —
처리 중인 신고가 걸린 글을 지우면 이의 제기 때 볼 것이 없다.

### 반복 신고자인지 본다

```sql
select reporter_guest_id, count(*) as 신고수, max(created_at) as 최근
  from public.reports
 where created_at > now() - interval '30 days'
 group by 1
 having count(*) >= 5
 order by 2 desc;
```

신고 자체에 시간당 5건 제한이 있다. 이 목록에 같은 세션이 계속 보이면 임계치를
1건에서 2건으로 올릴 근거가 된다(`docs/OPEN-QUESTIONS.md` 5번).

---

## ④ 삭제·종결 크론이 도는가

```sql
select * from public.purge_health();
```

| 보이는 것 | 뜻 |
|---|---|
| 두 줄, `scheduled = t` | 정상 |
| `last_run_at` 이 비어 있음 | 등록만 되고 아직 안 돌았다. 다음 날 다시 본다 |
| 행이 없거나 `pg_cron 없음` | 크론이 없다. **방침에 적은 보관 기간이 지켜지지 않는다** |

멈춰도 화면은 그대로다 — 공개 여부는 읽는 시점에 판정하므로 증상이 없다.
그래서 이 질의를 적어 둔다. 1차에서는 적용 직후와 그 다음 날 본다.

필요하면 손으로 돌릴 수 있다. 둘 다 service_role·postgres 만 부를 수 있다.

```sql
select public.close_stale_reports();  -- 90일 넘은 미처리 신고 종결
select * from public.purge_expired(); -- 기간이 지난 행 삭제
```

---

## 알림은 없다

메일·슬랙으로 보내는 경로를 만들지 않았다. 외부 서비스를 붙이는 일이고 1차에
필요한 것은 "내가 주기적으로 ① 을 본다" 하나다. 지금 할 수 있는 것:

- Supabase SQL Editor 에 ① 을 저장해 두고(스니펫) 정한 주기에 연다
- ② 가 0이 아니게 되면 그때 알림을 붙일 근거가 생긴다 — 사람이 안 보고 있다는
  증거가 숫자로 남아 있기 때문이다

알림을 먼저 붙이면 "울려도 안 보는 알림"이 하나 늘어난다.
