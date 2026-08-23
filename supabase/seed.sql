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
   now() - interval '30 days', now() - interval '30 days', '', '', '', ''),
  -- ⚠ carol은 **차단 시드 전용 제3자**다. alice↔bob을 차단시키면 rls.sql이 두 계정 사이의
  --   가시성을 전제로 짠 검사들(섹션 5·8·22·27 등)이 조용히 무의미해진다.
  ('33333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'carol@test.com',
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
   'email', now(), now(), now()),
  ('33333333-3333-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333',
   '{"sub":"33333333-3333-4333-8333-333333333333","email":"carol@test.com","email_verified":true}'::jsonb,
   'email', now(), now(), now())
on conflict (provider, provider_id) do nothing;

-- 가입 트리거(handle_new_user)가 랜덤 닉네임을 넣어 두었다 → 검사가 기대하는 값으로 고정
update public.profiles set nickname = 'alice' where id = '11111111-1111-4111-8111-111111111111';
update public.profiles set nickname = 'bob'   where id = '22222222-2222-4222-8222-222222222222';
update public.profiles set nickname = 'carol' where id = '33333333-3333-4333-8333-333333333333';

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
   now() - interval '400 days', now() - interval '400 days', 156),

  -- ⚠ carol의 글은 **alice에게만 보이지 않아야 한다**(아래 6절의 차단 시드).
  --   차단이 걸린 화면과 안 걸린 화면을 같은 DB에서 비교하려면 제3자의 글이 하나 있어야 한다.
  ('33333333-3333-4333-8333-333333333333', '잡담',
   '여기 처음 와봅니다, 다들 어느 팀 좋아하세요',
   E'가입한 지 얼마 안 됐는데 분위기가 좋네요.\n\n다들 어느 팀 응원하시는지 궁금합니다.',
   now() - interval '6 hours', now() - interval '6 hours', 87);

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
   '저는 이어폰 끼고 봅니다. 그래도 발은 구르게 되더라고요.', interval '7 days'),
  -- ⚠ carol이 **alice의 글에** 단 댓글이다. alice가 carol을 차단한 상태(6절)라 이 댓글은
  --   alice에게만 보이지 않는다 — 상세 화면의 "표시되지 않은 댓글" 안내를 로컬에서 확인하려면
  --   차단된 사람의 댓글이 살아 있는 글에 하나 있어야 한다.
  ('겨울 이적시장, 이번엔 진짜 움직일까', '33333333-3333-4333-8333-333333333333',
   '저도 그 자리가 제일 급해 보여요. 처음 글 남깁니다!', interval '50 minutes')
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

-- ---------------------------------------------------------------------
-- 5. 투표 — 이적설 글에 하나 붙인다
--
-- ⚠ 득표수 컬럼이 없다(집계는 poll_results가 그때그때 센다) → 시드할 값도 없다.
-- ⚠ bob의 표만 넣는다. alice(글쓴이)를 미투표로 남겨야 **"투표해야 결과가 보인다"** 를
--   화면에서 확인할 수 있다 — 둘 다 투표시키면 게이팅이 걸린 화면을 볼 수 없다.
-- ---------------------------------------------------------------------
insert into public.poll (post_id, question)
select id, '겨울에 어느 자리를 먼저 보강해야 할까요?'
  from public.post
 where title = '겨울 이적시장, 이번엔 진짜 움직일까'
on conflict do nothing;

-- ⚠ poll을 이름으로 특정한다. `from public.poll p cross join (…)`로 두면 시드에 투표가
--   하나 더 생기는 순간 **모든 투표에 같은 선택지가 붙는다**(지금은 하나라 무해할 뿐이다).
insert into public.poll_option (post_id, label, sort_order)
select p.post_id, x.label, x.ord::smallint
  from public.poll p
  cross join (values ('수비형 미드필더', 1), ('센터백', 2), ('윙어', 3)) as x(label, ord)
 where p.question = '겨울에 어느 자리를 먼저 보강해야 할까요?'
on conflict do nothing;

insert into public.poll_vote (post_id, user_id, option_id)
select o.post_id, '22222222-2222-4222-8222-222222222222'::uuid, o.id
  from public.poll_option o
 where o.sort_order = 1 and o.label = '수비형 미드필더'
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 6. 차단 — alice가 carol을 차단한 상태
--
-- ⚠ **alice↔bob을 차단시키지 않는다.** rls.sql의 여러 섹션이 두 계정 사이의 가시성을
--   전제로 짜여 있어(섹션 5·8·22·27 등), 서로 차단시키면 그 검사들이 조용히 무의미해진다.
--   그래서 제3자(carol)를 두고 한 방향만 건다 — 투표 시드가 bob만 투표시켜 alice를
--   미투표 상태로 남겨 둔 것과 같은 판단이다(게이팅이 걸린 화면을 볼 수 있어야 한다).
--
-- 이 시드 덕분에 로컬에서 alice로 로그인하면 목록에 carol의 글이 **없고**
-- /profile의 "차단한 사용자"에 carol이 한 명 떠 있다.
-- ---------------------------------------------------------------------
insert into public.user_block (blocker_id, blocked_id)
values ('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 7. 신고 — alice가 bob의 글을 신고한 상태
--
-- 화면에는 아무 데도 보이지 않는다(관리 화면이 없고 SELECT 정책도 없다). 그럼에도 넣는
-- 이유는 **"이미 신고한 글이에요." 경로를 로컬에서 밟아 볼 수 있어야** 해서다 —
-- alice로 그 글을 다시 신고하면 트리거의 P0001이 그대로 뜬다.
-- ---------------------------------------------------------------------
insert into public.post_report (post_id, reporter_id, reason)
select id, '11111111-1111-4111-8111-111111111111'::uuid, 'etc'
  from public.post
 where title = '어제 후반 교체 타이밍은 좀 아쉬웠다'
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 8. 서베이 — 분할 3형태 × 색 유무 × 기간
--
-- ⚠ 실제 운영 문항은 여기가 아니라 **마이그레이션**에 넣는다(쓰기 정책·grant가 없어
--   앱에서는 만들 수 없다). 이 시드는 로컬에서 화면을 밟아 보기 위한 것이다.
--
-- ⚠ **면 색은 실제 클럽·국가 컬러다.** styling.md의 "강한 컬러는 크롬에 금지"에 걸리지
--   않는다 — 이 색은 선택지 자체를 가리키는 **콘텐츠**이고, 그 뷰포트의 에메랄드 이벤트는
--   VS 배지 하나뿐이다(styling.md의 분할 카드 예외 절).
-- ⚠ 대비를 눈으로 확인하고 짝을 정했다. 어두운 면에는 흰 글씨, 밝은 면에는 잉크다 —
--   `bg_color`만 바꾸고 `text_color`를 그대로 두면 읽히지 않는 면이 생긴다.
--
-- ⚠ **`image_path`가 있으면 이미지가 색을 덮는다**(색은 그 아래 깔려 로딩 전·실패 시를 받는다).
--   경로는 `{survey_id}/{파일명}`이고 실제 파일은 `scripts/upload-survey-images.mjs`가
--   `survey-images` 버킷에 올린다 — **이 시드만으로는 이미지가 뜨지 않는다.**
--   ⚠ 사진은 위키미디어 커먼즈의 자유 라이선스 자산이고 **CC BY/BY-SA라 저작자 표시가
--     의무다** — 출처 표는 `supabase/seed-images/README.md`에 있다.
--   "이번 시즌 최고의 영입은?"과 "올해 EPL 우승팀"은 일부러 이미지를 두지 않았다:
--   각각 "색도 이미지도 없음 → 바 UI"와 "색만 있음 → 색 배경"의 폴백 경로다.
--
-- ⚠ alice는 **전부 미참여**로 남긴다 — 게이팅이 걸린 화면을 밟을 수 있어야 한다.
-- ---------------------------------------------------------------------

-- ⚠ `on conflict do nothing`을 쓰지 않는다 — title에 유니크 제약이 없어(같은 질문을
--   시즌마다 다시 물을 수 있다) 충돌할 상대가 없다. 멱등은 `not exists`가 만든다.
-- ⚠ `order by`가 없으면 id 배정 순서가 정해지지 않아 목록 순서가 실행마다 바뀐다.
-- ⚠ 마감분은 `created_at`·`closes_at`을 직접 과거로 넣는다 — 시드는 테이블 소유자로 돌아
--   컬럼 권한을 지나지 않는다(앱에서는 두 컬럼 다 실을 수 없다).
insert into public.survey (title, created_at, closes_at)
select x.title, x.created_at, x.closes_at
  from (values
         (1, '이번 시즌 최고의 영입은?',        now() - interval '3 days',  now() + interval '4 days'),
         (2, '올해 EPL 우승팀은 어디일까요?',   now() - interval '30 days', now() - interval '23 days'),
         (3, '발롱도르, 누가 받아야 할까요?',   now() - interval '2 days',  now() + interval '5 days'),
         (4, '최고의 리그는 어디일까요?',       now() - interval '1 day',   now() + interval '6 days'),
         (5, '메시 vs 호날두, 당신의 GOAT는?',  now(),                      now() + interval '7 days')
       ) as x(ord, title, created_at, closes_at)
 where not exists (select 1 from public.survey s where s.title = x.title)
 order by x.ord;

-- ⚠ 서베이를 제목으로 특정한다. `cross join`만 걸면 문항이 하나 더 생기는 순간
--   **모든 서베이에 같은 선택지가 붙는다**(poll_option 시드와 같은 함정이다).

-- (1) 색 없음 · 진행 중 → 분할 카드가 아니라 바 UI로 폴백되는지
insert into public.survey_option (survey_id, label, sort_order)
select s.id, x.label, x.ord::smallint
  from public.survey s
  cross join (values ('공격수', 1), ('미드필더', 2), ('수비수', 3)) as x(label, ord)
 where s.title = '이번 시즌 최고의 영입은?'
on conflict do nothing;

-- (2) 4지선다 · **마감** → 클럽 컬러. 마감이라 목록에서는 한 줄 카드로 내려간다
insert into public.survey_option (survey_id, label, sort_order, subtitle, bg_color, text_color)
select s.id, x.label, x.ord::smallint, x.subtitle, x.bg, x.fg
  from public.survey s
  cross join (values ('맨시티', 1, '3연패 도전',  '#6cabdd', '#171717'),   -- 스카이블루
                     ('아스널', 2, '무관 탈출',   '#ef0107', '#ffffff'),   -- 건너스 레드
                     ('리버풀', 3, '전방 압박',   '#c8102e', '#ffffff'),   -- 리버풀 레드
                     ('그 외',  4, '이변을 기대', '#ffffff', '#171717'))
       as x(label, ord, subtitle, bg, fg)
 where s.title = '올해 EPL 우승팀은 어디일까요?'
on conflict do nothing;

-- (3) 3지선다 · 진행 중 → 삼각별(Y). 국가대표 컬러라 셋이 뚜렷하게 갈린다
insert into public.survey_option (survey_id, label, sort_order, subtitle, image_path, bg_color, text_color)
select s.id, x.label, x.ord::smallint, x.subtitle,
       s.id || '/' || x.img, x.bg, x.fg
  from public.survey s
  cross join (values ('음바페', 1, '프랑스 · 스피드',         'mbappe.jpg',     '#002395', '#ffffff'),
                     ('벨링엄', 2, '잉글랜드 · 박스 투 박스', 'bellingham.jpg', '#ffffff', '#171717'),
                     ('홀란드', 3, '노르웨이 · 결정력',       'haaland.jpg',    '#ef2b2d', '#ffffff'))
       as x(label, ord, subtitle, img, bg, fg)
 where s.title = '발롱도르, 누가 받아야 할까요?'
on conflict do nothing;

-- (4) 4지선다 · **진행 중** → X자를 목록에서 바로 눌러 볼 수 있는 자리
-- ⚠ **세리에 A만 일부러 이미지를 비워 둔다.** 한 카드 안에서 "사진 면"과 "색 면"이
--   나란히 서야 폴백이 눈으로 증명된다(다른 문항으로 나누면 카드를 오가며 비교해야 한다).
insert into public.survey_option (survey_id, label, sort_order, subtitle, image_path, bg_color, text_color)
select s.id, x.label, x.ord::smallint, x.subtitle,
       case when x.img = '' then null else s.id || '/' || x.img end, x.bg, x.fg
  from public.survey s
  cross join (values ('프리미어리그', 1, '잉글랜드', 'epl.jpg',        '#3d195b', '#ffffff'),
                     ('라리가',       2, '스페인',   'laliga.jpg',     '#ee8707', '#171717'),
                     ('분데스리가',   3, '독일',     'bundesliga.jpg', '#d20515', '#ffffff'),
                     ('세리에 A',     4, '이탈리아', '',               '#008fd7', '#ffffff'))
       as x(label, ord, subtitle, img, bg, fg)
 where s.title = '최고의 리그는 어디일까요?'
on conflict do nothing;

-- (5) 2지선다 · 진행 중 → 비스듬한 대각선. 목록 맨 위에 온다
insert into public.survey_option (survey_id, label, sort_order, subtitle, image_path, bg_color, text_color)
select s.id, x.label, x.ord::smallint, x.subtitle,
       s.id || '/' || x.img, x.bg, x.fg
  from public.survey s
  cross join (values ('메시',   1, '아르헨티나 · 좌발', 'messi.jpg',   '#75aadb', '#171717'),
                     ('호날두', 2, '포르투갈 · 우발',   'ronaldo.jpg', '#c8102e', '#ffffff'))
       as x(label, ord, subtitle, img, bg, fg)
 where s.title = '메시 vs 호날두, 당신의 GOAT는?'
on conflict do nothing;

-- bob은 **마감된 문항**과 **진행 중 문항**에 하나씩 참여한 상태로 둔다
--   → "마감 + 참여 = 결과만 보이고 갈아타기는 죽어 있다"와
--     "진행 중 + 참여 = 결과 + 갈아타기 가능"을 둘 다 밟을 수 있다.
-- ⚠ **정책을 우회한다** — 마감된 문항에는 authenticated로 insert할 수 없다(그게 이 기능이다).
--   시드는 소유자로 돌아 RLS를 지나지 않으므로 이 행을 넣을 수 있다.
insert into public.survey_vote (survey_id, user_id, option_id)
select o.survey_id, '22222222-2222-4222-8222-222222222222'::uuid, o.id
  from public.survey_option o
  join public.survey s on s.id = o.survey_id
 where (s.title = '올해 EPL 우승팀은 어디일까요?' and o.sort_order = 2)
    or (s.title = '발롱도르, 누가 받아야 할까요?' and o.sort_order = 1)
on conflict do nothing;
