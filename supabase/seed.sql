-- =====================================================================
-- 로컬 개발 시드 — `supabase db reset`이 마이그레이션 뒤에 자동으로 실행한다.
--
-- ⚠ **로컬 전용이다.** 원격에는 절대 올라가지 않는다(`db reset --linked`를 쓰지 말 것).
--
-- 왜 SQL로 계정까지 만드는가:
--   전에는 계정을 `supabase/tests/seed-users.sh`(auth API)가 만들고 글·댓글은 아무도
--   만들지 않아서, **마이그레이션을 고칠 때마다 `db reset`이 개발 데이터를 통째로 날렸다.**
--   시드가 코드로 관리되면 reset이 안전해진다.
--   비밀번호 해시는 pgcrypto의 `crypt(..., gen_salt('bf'))`로 만든다 — GoTrue가 쓰는
--   bcrypt와 같은 형식이라 이 계정으로 실제 로그인이 된다(확인함).
--
-- ⚠ **닉네임을 명시적으로 고정한다.** 가입 트리거가 랜덤 닉네임을 배정하는데(20260809000001),
--   그러면 `rls.sql` 섹션 13의 유일성 검사가 **조용히 무의미해진다** — 'ALICE'가 부딪힐
--   상대가 없어 "중복이 차단된다"는 검사가 그냥 통과해 버린다(실제로 그랬다).
--
-- ⚠ 카운터(like_count·comment_count)는 **직접 넣지 않는다.** 트리거가 단독 관리한다.
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

-- ---------------------------------------------------------------------
-- 2. 글 — 말머리 5종(이적설·경기·선수·유니폼·잡담)을 모두 덮는다
--
-- ⚠ created_at을 과거로 흩뿌린다. 전부 now()면 정렬·상대시간("3분 전")·HOT 배지를
--   화면에서 확인할 수 없다. updated_at은 created_at과 같게 둔다("수정됨"이 뜨지 않게).
-- ---------------------------------------------------------------------
insert into public.post (author_id, category, title, content, created_at, updated_at, view_count)
values
  ('11111111-1111-4111-8111-111111111111', '이적설',
   '겨울 이적시장, 이번엔 진짜 움직일까',
   E'매년 이맘때면 나오는 이야기지만 올해는 분위기가 좀 다른 것 같습니다.\n\n' ||
   E'- 주전 미드필더 계약 6개월 남음\n- 감독이 공개적으로 보강 요청\n- 구단주 인터뷰 톤 변화\n\n' ||
   E'개인적으로는 **수비형 미드필더**가 제일 급하다고 봅니다. 여러분 생각은요?',
   now() - interval '2 hours', now() - interval '2 hours', 342),

  ('22222222-2222-4222-8222-222222222222', '경기',
   '어제 후반 교체 타이밍은 좀 아쉬웠다',
   E'0-1로 지고 있는 상황에서 65분까지 기다린 건 너무 늦었다고 생각해요.\n\n' ||
   E'물론 체력 안배도 중요하지만, 이미 흐름이 넘어간 뒤였습니다.\n' ||
   E'그래도 마지막 10분 압박은 좋았어요. 다음 경기 기대해봅니다.',
   now() - interval '5 hours', now() - interval '5 hours', 891),

  ('11111111-1111-4111-8111-111111111111', '선수',
   '이번 시즌 최고의 발견, 다들 동의하시나요',
   E'시즌 초만 해도 벤치 자원이라고 생각했는데 지금은 없으면 안 되는 선수가 됐습니다.\n\n' ||
   E'| 항목 | 지난 시즌 | 이번 시즌 |\n|---|---|---|\n| 출전 | 6경기 | 21경기 |\n| 공격P | 1 | 9 |\n\n' ||
   E'특히 압박 가담이 눈에 띄게 좋아졌어요.',
   now() - interval '1 day', now() - interval '1 day', 1204),

  ('22222222-2222-4222-8222-222222222222', '유니폼',
   '올해 서드 유니폼 실물 후기',
   E'사진으로 볼 때는 별로였는데 실물은 훨씬 낫습니다.\n\n' ||
   E'원단이 작년보다 얇아져서 여름에 입기 좋을 것 같고, 다만 프린팅이 조금 뻣뻣해요.\n' ||
   E'사이즈는 평소보다 한 치수 크게 나온 느낌입니다.',
   now() - interval '3 days', now() - interval '3 days', 578),

  ('11111111-1111-4111-8111-111111111111', '잡담',
   '축구 보다가 새벽에 소리 질러서 혼난 사람 있나요',
   E'어제 동점골 터졌을 때 저도 모르게 일어나서 소리를 질렀는데...\n\n' ||
   E'옆방에서 자던 동생이 문 열고 나와서 째려보더라고요. 다들 어떻게 참으시나요?',
   now() - interval '8 days', now() - interval '8 days', 2033),

  ('22222222-2222-4222-8222-222222222222', '경기',
   '작년 이맘때 그 경기 다시 봤습니다',
   E'유튜브에 풀경기가 올라와 있길래 정주행했는데, 그때 우리 압박 강도가 지금보다 훨씬 높았네요.\n\n' ||
   E'선수 구성은 거의 그대론데 왜 이렇게 달라졌을까요.',
   now() - interval '400 days', now() - interval '400 days', 156);

-- ---------------------------------------------------------------------
-- 3. 댓글 — 루트와 깊이 1 답글을 섞는다(깊이 2는 트리거가 막는다)
-- ---------------------------------------------------------------------
with p as (select id, title from public.post)
insert into public.comment (post_id, user_id, content, parent_id, created_at)
select p.id, v.user_id::uuid, v.content, null, now() - v.ago
from p
join (values
  ('겨울 이적시장, 이번엔 진짜 움직일까', '22222222-2222-4222-8222-222222222222',
   '수비형 미드필더 동의합니다. 지금 그 자리에서 볼 뺏기는 장면이 너무 많아요.', interval '90 minutes'),
  ('겨울 이적시장, 이번엔 진짜 움직일까', '11111111-1111-4111-8111-111111111111',
   '측면 백업도 한 명은 있어야 할 것 같은데요.', interval '70 minutes'),
  ('어제 후반 교체 타이밍은 좀 아쉬웠다', '11111111-1111-4111-8111-111111111111',
   '저는 오히려 교체 카드 자체가 아쉬웠어요. 그 상황에 수비수를 넣을 줄은.', interval '4 hours'),
  ('이번 시즌 최고의 발견, 다들 동의하시나요', '22222222-2222-4222-8222-222222222222',
   '표까지 만들어 오셨네요 ㅋㅋ 인정합니다.', interval '20 hours'),
  ('올해 서드 유니폼 실물 후기', '11111111-1111-4111-8111-111111111111',
   '사이즈 정보 감사합니다. 고민하고 있었는데 도움이 됐어요.', interval '2 days'),
  ('축구 보다가 새벽에 소리 질러서 혼난 사람 있나요', '22222222-2222-4222-8222-222222222222',
   '저는 이어폰 끼고 봅니다. 그래도 발은 구르게 되더라고요.', interval '7 days')
) as v(title, user_id, content, ago) on v.title = p.title;

-- 답글(깊이 1) — 첫 글의 첫 댓글에 단다
insert into public.comment (post_id, user_id, content, parent_id, created_at)
select c.post_id, '11111111-1111-4111-8111-111111111111'::uuid,
       '그 장면 저도 봤어요. 후반전에만 세 번 나왔죠.', c.id, now() - interval '80 minutes'
from public.comment c
where c.content like '수비형 미드필더 동의합니다%';

-- ---------------------------------------------------------------------
-- 4. 좋아요 — 서로의 글에 누른다(트리거가 like_count를 맞춘다)
-- ---------------------------------------------------------------------
-- ⚠ UNION은 타입 없는 리터럴을 text로 해석한다 → uuid 컬럼에 넣으려면 명시 캐스트가 필요하다
insert into public.post_like (post_id, user_id)
select id, '22222222-2222-4222-8222-222222222222'::uuid from public.post
 where author_id = '11111111-1111-4111-8111-111111111111'
union all
select id, '11111111-1111-4111-8111-111111111111'::uuid from public.post
 where author_id = '22222222-2222-4222-8222-222222222222'
on conflict do nothing;
