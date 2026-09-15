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

insert into public.hospitals
  (id, hpid, name, address, tel, lat, lng, synced_at, is_participating,
   regular_open, regular_close, regular_hours_source, regular_hours_verified_at)
values
  ('h_001', 'MOCK0001', '가상아이봄의원', '서울 강서구 (데모 주소)', '02-000-0001', 37.5509, 126.8495,
   now() - interval '10 hours', true, '09:00', '23:30', 'hospital', now() - interval '26 hours'),
  ('h_002', 'MOCK0002', '가상한빛외과의원', '서울 양천구 (데모 주소)', '02-000-0002', 37.5169, 126.8664,
   now() - interval '10 hours', true, '10:00', '22:30', 'hospital', now() - interval '22 minutes'),
  ('h_003', 'MOCK0003', '가상연세365의원', '서울 영등포구 (데모 주소)', '02-000-0003', 37.5264, 126.8960,
   now() - interval '10 hours', true, '09:00', '00:00', 'operator', now() - interval '95 minutes'),
  ('h_004', 'MOCK0004', '가상새봄정형외과의원', '서울 구로구 (데모 주소)', '02-000-0004', 37.4954, 126.8874,
   now() - interval '10 hours', true, '09:00', '21:00', 'hospital', now() - interval '400 minutes'),
  ('h_005', 'MOCK0005', '가상미래의원', '서울 강서구 (데모 주소)', '02-000-0005', 37.5603, 126.8352,
   now() - interval '10 hours', false, null, null, 'public', null);

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
