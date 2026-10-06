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

⚠️ 전에는 `public_until` 이 지난 글을 되살려도 목록에 돌아오지 않았다. 지금은
`public_until` 이 전부 null 이어서(migration 20261007) **되살리면 그대로 보인다.**
오래된 글을 되살릴 때도 보호자 화면에 나타난다는 뜻이다.

### 신고가 맞다 (글을 내린 채로 둔다)

```sql
update public.reports set state = 'RESOLVED' where id = '<신고 id>';
insert into public.moderation_actions (report_id, target_type, target_id, action, reason_code)
values ('<신고 id>', 'post', '<글 id>', 'REMOVE', 'reviewed_violation');
```

⚠️ **행은 아무도 지우지 않는다.** 글의 자동 삭제를 껐다(migration 20261007) —
`purge_expired()` 는 현장톡 글을 건드리지 않는다. 내린 글의 본문은 DB 에 남는다.
완전히 없애야 하는 경우(개인정보가 적혔다·본인이 삭제를 요구했다)는 아래 ⑤ 를 본다.

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

## ⑤ 본문을 완전히 없앤다 — **운영자만 할 수 있는 일**

언제 하는가:

- 보호자가 **자기 글을 지워 달라고 요구**했다. 화면의 [삭제]를 못 쓰는 경우다
  (쿠키를 지웠다·다른 기기다·30일 넘게 안 들어와 세션이 정리됐다)
- 글에 **개인정보가 적혔다**. 쓰기 검사가 전화번호를 거르지만 다 거르지 못한다
- 법적 요구로 없애야 한다

### 왜 운영자밖에 못 하는가

화면의 [삭제]는 `visibility = 'REMOVED'` 로 바꿀 뿐이고, **본문은 DB 에 남는다.**
글의 자동 삭제를 껐기 때문이다(migration 20261007). 그리고 그 [삭제] 자체가
게스트 세션에 묶여 있어서 **쿠키를 잃으면 본인도 못 누른다.** 그래서 이 창구가
개인정보보호법상 삭제 요구를 받는 유일한 길이다 — 방침에 적는 연락처가 이것이다.

### 순서 — **기록을 먼저 남기고 지운다**

```sql
-- 1) 무엇을 지웠는지 먼저 남긴다. 지운 뒤에는 글 id 밖에 쓸 수 없다.
--    moderation_actions.target_id 에는 외래키가 없다. 글이 사라져도 이 줄은 남는다.
--    reason_code: 본인 요구 → 'subject_erasure' · 개인정보 → 'pii_erasure'
insert into public.moderation_actions (target_type, target_id, action, reason_code)
values ('post', '<글 id>', 'REMOVE', 'subject_erasure');

-- 2) 본문을 확인한다. 지우면 되돌릴 수 없다.
select id, created_at, sido, sigungu, handle, body
  from public.field_reports where id = '<글 id>';

-- 3) 지운다. 반응(field_report_reactions)은 cascade 로 함께 사라진다.
delete from public.field_reports where id = '<글 id>';
```

⚠️ **되돌릴 수 없다.** Free 요금제에는 백업이 없다(docs/DATA-INVENTORY.md).
2) 를 건너뛰지 않는다.

⚠️ 지운 글은 **읽고 있는 사람 화면에서 바로 사라지지 않는다.** 실시간 신호는
insert·update 트리거에서 나오고 delete 에는 트리거가 없다. 공개 중단을 먼저
확실히 해야 하면 `update … set visibility = 'REMOVED'` 를 먼저 하고 (화면에서
즉시 사라진다) 그다음 1)~3) 을 한다.

기록 자체는 1년 뒤 `purge_expired()` 가 지운다(`moderation_actions`, 기준 `created_at`).

### 본인인지 어떻게 확인하는가 — **정해야 한다**

익명 글이라 증명할 수단이 없다. 글 id 와 내용은 그 글을 읽은 누구나 안다. 그래서
"본인 확인"은 원리상 불가능하고, 둘 중 하나를 고르는 일이다:

| 고르는 쪽 | 잘못되면 |
|---|---|
| 요구를 받으면 지운다 | 남이 남의 글을 지우게 할 수 있다. 잃는 것은 공개 글 하나 |
| 확인될 때만 지운다 | 확인할 방법이 없으므로 **사실상 삭제 요구를 거절하는 것**이다 |

권고는 **지우는 쪽**이다. 글에는 개인정보가 없고(쓰기 검사가 거른다) 잘못 지워서
잃는 것은 공개 글 하나인데, 막아서 잃는 것은 법이 보장한 권리다. 비대칭이 크다.
남용 신호(한 사람이 여러 글을 지워 달라고 한다)는 ⑤ 의 `moderation_actions` 기록으로
드러난다 — 그때 기준을 올린다.

**이 표의 선택은 사용자 결정이다.** 정해지면 방침에 그 문장을 그대로 적는다.

## 알림은 없다

메일·슬랙으로 보내는 경로를 만들지 않았다. 외부 서비스를 붙이는 일이고 1차에
필요한 것은 "내가 주기적으로 ① 을 본다" 하나다. 지금 할 수 있는 것:

- Supabase SQL Editor 에 ① 을 저장해 두고(스니펫) 정한 주기에 연다
- ② 가 0이 아니게 되면 그때 알림을 붙일 근거가 생긴다 — 사람이 안 보고 있다는
  증거가 숫자로 남아 있기 때문이다

알림을 먼저 붙이면 "울려도 안 보는 알림"이 하나 늘어난다.
