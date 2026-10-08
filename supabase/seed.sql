-- ─────────────────────────────────────────────────────────────
-- ⚠️ DEMO SEED — 실제 의료기관 정보가 아닙니다.
-- src/features/hospitals/mock.ts 와 같은 가상 병원 5곳입니다. 실데이터 연동 전까지 DemoNotice 를 끄지 않습니다.
--
-- 시각은 now() 기준 상대값이라 시드를 넣은 순간부터 "N분 전"이 살아 있습니다.
-- h_001 은 파트너 화면 첫 진입을 재현하도록 "어제 확인한 상태가 만료된" 상태로 둡니다.
-- 병원 계정(hospital_members)은 auth 사용자가 필요해서 여기서 만들지 않습니다. → README
-- ─────────────────────────────────────────────────────────────

insert into public.capabilities (id, label, "group") values
  ('cap_facial_laceration', '소아 안면열상', 'facial'),
  ('cap_scalp_laceration', '두피 열상', 'facial'),
  ('cap_hand_trauma', '손가락 외상', 'hand'),
  ('cap_nail_injury', '손톱 손상', 'hand'),
  ('cap_burn', '소아 화상', 'burn'),
  ('cap_bite', '교상', 'other'),
  ('cap_foreign_body', '이물 제거', 'other');

-- verification_state 를 명시한다. 컬럼에 default 가 없기 때문이다(migration 20260926 참고).
-- 값은 'PENDING' 이다 — 승인된 참여 병원은 실제로 0곳이다.
-- 'APPROVED' 로 채워서 공식 상태가 있는 것처럼 보이게 하지 않는다.
insert into public.hospitals
  (id, hpid, name, address, tel, lat, lng, synced_at, is_participating,
   regular_open, regular_close, regular_hours_source, regular_hours_verified_at,
   verification_state)
values
  ('h_001', 'MOCK0001', '가상아이봄의원', '서울 강서구 (데모 주소)', '02-000-0001', 37.5509, 126.8495,
   now() - interval '10 hours', true, '09:00', '23:30', 'hospital', now() - interval '26 hours',
   'PENDING'),
  ('h_002', 'MOCK0002', '가상한빛외과의원', '서울 양천구 (데모 주소)', '02-000-0002', 37.5169, 126.8664,
   now() - interval '10 hours', true, '10:00', '22:30', 'hospital', now() - interval '22 minutes',
   'PENDING'),
  ('h_003', 'MOCK0003', '가상연세365의원', '서울 영등포구 (데모 주소)', '02-000-0003', 37.5264, 126.8960,
   now() - interval '10 hours', true, '09:00', '00:00', 'operator', now() - interval '95 minutes',
   'PENDING'),
  ('h_004', 'MOCK0004', '가상새봄정형외과의원', '서울 구로구 (데모 주소)', '02-000-0004', 37.4954, 126.8874,
   now() - interval '10 hours', true, '09:00', '21:00', 'hospital', now() - interval '400 minutes',
   'PENDING'),
  ('h_005', 'MOCK0005', '가상미래의원', '서울 강서구 (데모 주소)', '02-000-0005', 37.5603, 126.8352,
   now() - interval '10 hours', false, null, null, 'public', null,
   'PENDING');

insert into public.hospital_capabilities
  (hospital_id, capability_id, custom_label, mapping_status, age_min, age_max, age_note, sort_order)
values
  ('h_001', 'cap_facial_laceration', null, 'standard', 3, null, null, 0),
  ('h_001', 'cap_scalp_laceration', null, 'standard', 3, null, null, 1),
  ('h_001', null, '소아 눈꺼풀 주변 봉합', 'pending', 5, null, null, 2),
  ('h_002', 'cap_facial_laceration', null, 'standard', 6, null, null, 0),
  ('h_002', null, '소아 손끝 찢어짐', 'pending', null, null, '보호자 동반 시', 1),
  ('h_003', 'cap_burn', null, 'standard', null, 15, null, 0),
  ('h_003', 'cap_hand_trauma', null, 'standard', null, null, null, 1),
  ('h_004', 'cap_hand_trauma', null, 'standard', null, null, null, 0),
  ('h_004', 'cap_nail_injury', null, 'standard', null, null, null, 1),
  ('h_005', 'cap_foreign_body', null, 'standard', null, null, null, 0);

-- 진료상태. h_004 는 만료되어 보호자 화면에 "현재 상태 확인 필요"로만 나와야 한다.
insert into public.hospital_live_status
  (hospital_id, capability_id, status, reason_code, detail_text, starts_at, expected_resume_at, recheck_at,
   verified_by, verified_at, expires_at)
values
  ('h_001', null, 'normal', null, null, null, null, null,
   'hospital', now() - interval '26 hours', now() - interval '10 hours'),
  ('h_002', 'cap_facial_laceration', 'partial', 'specialist_absent', '담당 전문의 복귀 후 재개 예정',
   now() - interval '50 minutes', now() + interval '35 minutes', null,
   'hospital', now() - interval '22 minutes', now() + interval '120 minutes'),
  ('h_003', null, 'normal', null, null, null, null, now() + interval '60 minutes',
   'operator', now() - interval '95 minutes', now() + interval '85 minutes'),
  ('h_004', null, 'normal', null, null, null, null, null,
   'hospital', now() - interval '400 minutes', now() - interval '40 minutes');

-- 진료일별 진료시간. h_001 은 어제 값만 있어 "어제와 동일"이 읽어갈 내원 마감(22:30)이 남아 있다.
insert into public.hospital_daily_hours
  (hospital_id, service_date, today_close_at, last_admission_at, admission_confirmed, today_note,
   verified_by, verified_at)
values
  ('h_001', public.kst_service_date(now()) - 1, null,
   ((public.kst_service_date(now()) - 1) + time '22:30') at time zone 'Asia/Seoul', true, null,
   'hospital', now() - interval '26 hours'),
  ('h_002', public.kst_service_date(now()), null,
   (public.kst_service_date(now()) + time '21:30') at time zone 'Asia/Seoul', true, null,
   'hospital', now() - interval '22 minutes');

insert into public.hospital_contact_status (hospital_id, status, verified_at) values
  ('h_001', 'busy', now() - interval '14 minutes'),
  ('h_002', 'difficult', now() - interval '22 minutes'),
  ('h_003', 'available', now() - interval '95 minutes');

insert into public.hospital_waiting_status (hospital_id, level, headcount, verified_at) values
  ('h_001', 'normal', 6, now() - interval '14 minutes'),
  ('h_002', 'crowded', 11, now() - interval '22 minutes');

-- ─────────────────────────────────────────────────────────────
-- hospital_services — 항목의 **존재**만 채운다. 상태는 채우지 않는다.
--
-- migration 20260926120000_service_statuses.sql 의 이행 INSERT 와 같은 매핑이다.
-- 두 곳이 갈라지면 로컬과 운영이 다른 항목 목록을 갖게 되므로, 고칠 때 같이 고친다.
--   facial · hand → laceration     (얼굴·두피·손 열상은 봉합 쪽이다)
--   burn          → burn
--   other         → other
-- 연령 조건은 그 카테고리 안에서 가장 넓은 범위를 가져온다. 좁히면 없는 제한을 만든다.
--
-- 여기서 채우는 이유: migration 은 seed.sql 보다 **먼저** 돈다. 그래서 db reset 을 하면
-- 이행 INSERT 가 볼 hospital_capabilities 가 아직 비어 있어 0행이 들어간다.
-- 이행 INSERT 자체는 데이터가 이미 있는 프로젝트에 적용할 때 정상 동작한다.
--
-- 이건 새 정보가 아니다. 바로 위 hospital_capabilities 에 이미 있는 사실을 구조만 바꿔 옮긴다.
-- service_statuses 는 계속 비워 둔다 — 항목이 있다는 것과 그 항목이 지금 가능하다는 것은 다르다.
-- 비어 있으면 접기 결과가 UNKNOWN 이고 화면은 "현재 상태 확인 필요"로 시작한다. 그게 사실이다.
-- ─────────────────────────────────────────────────────────────
insert into public.hospital_services
  (hospital_id, category, service_code, reported_age_min, reported_age_max)
select
  hc.hospital_id,
  cat.category,
  cat.category::text as service_code,
  min(hc.age_min) as reported_age_min,
  max(hc.age_max) as reported_age_max
from public.hospital_capabilities hc
join public.capabilities c on c.id = hc.capability_id
cross join lateral (
  select case c."group"
    when 'facial' then 'laceration'::public.care_category
    when 'hand'   then 'laceration'::public.care_category
    when 'burn'   then 'burn'::public.care_category
    else               'other'::public.care_category
  end as category
) cat
where hc.capability_id is not null
group by hc.hospital_id, cat.category
on conflict (hospital_id, service_code) do nothing;

-- service_statuses 는 의도적으로 비어 있다. INSERT 하지 않는다.
