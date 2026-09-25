-- =====================================================================
-- 로컬 개발 시드 — `supabase db reset`이 마이그레이션 뒤에 자동으로 실행한다.
--
-- ⚠ **로컬 전용이다.** 원격에는 절대 올라가지 않는다(`db reset --linked`를 쓰지 말 것).
--
-- 왜 SQL로 계정까지 만드는가:
--   계정이 코드로 관리되지 않으면 **마이그레이션을 고칠 때마다 `db reset`이 로그인할
--   계정까지 통째로 날린다.** 시드가 코드로 관리되면 reset이 안전해진다.
--   비밀번호 해시는 pgcrypto의 `crypt(..., gen_salt('bf'))`로 만든다 — GoTrue가 쓰는
--   bcrypt와 같은 형식이라 이 계정으로 실제 로그인이 된다(확인함).
--
-- ⚠ **닉네임을 명시적으로 고정한다.** 가입 트리거가 랜덤 닉네임을 배정하는데(20260809000001),
--   그러면 `rls.sql`의 닉네임 유일성 검사가 **조용히 무의미해진다** — 'ALICE'가 부딪힐
--   상대가 없어 "중복이 차단된다"는 검사가 그냥 통과해 버린다(실제로 그랬다).
--
-- ⚠ 이적시장 데이터(`transfer_*`)는 시드하지 않는다 — 운영 데이터라 수집 스크립트가 채운다
--   (`node scripts/sync-transfer-news.mjs`, 로컬이 기본값이다).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 테스트 계정 (alice / bob) — 비밀번호는 둘 다 test1234
-- ---------------------------------------------------------------------
-- ⚠ 토큰 컬럼 4개를 **빈 문자열로** 채운다. 기본값이 없어 NULL로 두면 GoTrue가 이 행을
--   읽다가 실패해 로그인이 `Database error querying schema`(500)로 죽는다(실측).
--   GoTrue가 직접 만든 행과 대조해 확인한 값이다 — `phone`은 NULL이 정상이다.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'alice@test.com',
   extensions.crypt('test1234', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   now() - interval '30 days', now() - interval '30 days', '', '', '', ''),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'bob@test.com',
   extensions.crypt('test1234', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   now() - interval '30 days', now() - interval '30 days', '', '', '', '')
on conflict (id) do nothing;

-- ⚠ identity 행이 없으면 GoTrue가 이메일 로그인을 처리하지 못한다
insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values
  ('11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111',
   '{"sub":"11111111-1111-4111-8111-111111111111","email":"alice@test.com","email_verified":true}'::jsonb,
   'email', now(), now(), now()),
  ('22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222',
   '{"sub":"22222222-2222-4222-8222-222222222222","email":"bob@test.com","email_verified":true}'::jsonb,
   'email', now(), now(), now())
on conflict (provider, provider_id) do nothing;

-- 가입 트리거(handle_new_user)가 랜덤 닉네임을 넣어 두었다 → 검사가 기대하는 값으로 고정
update public.profiles set nickname = 'alice' where id = '11111111-1111-4111-8111-111111111111';
update public.profiles set nickname = 'bob'   where id = '22222222-2222-4222-8222-222222222222';
