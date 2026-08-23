-- =====================================================================
-- 서베이 — 운영진이 등록하고 전 유저가 참여하는 단일 선택 투표
--
-- 게시글에 딸린 투표(20260817000003)와 **성격이 다르다.**
--   * 글에 딸린 투표: 유저가 자기 글에 붙인다 → 부모가 post이고 1글 : 1투표
--   * 서베이       : 운영진이 문항을 올린다 → 부모가 없는 독립 리소스
--
-- 설계는 20260817000003을 그대로 물려받는다. 갈리는 지점만 아래에 적는다.
--
--  * **쓰기 경로를 아예 만들지 않는다.** poll·poll_option은 정책·grant를 걷어내고
--    create_post_with_poll(definer)을 유일 경로로 삼았는데, 서베이는 그 유일 경로가
--    **마이그레이션 자체**다(테이블 소유자라 RLS를 지나지 않는다). 그래서 여기에는
--    definer 함수조차 필요 없다 — 문항을 추가하려면 새 마이그레이션을 쓴다.
--
--  * **post_is_alive 게이트가 없다.** 부모가 소프트 삭제되지 않는다.
--
--  * **득표수 컬럼도 카운터 트리거도 없다.** poll과 같은 판단이다 — like_count가 탈퇴
--    cascade에서 어긋나 영구히 과대로 남았던 사고의 클래스를, 어긋날 값 자체를 없애서
--    통째로 제거한다. 선택지가 4개 이하라 survey_results()의 집계는 사실상 공짜다.
--    ⚠ 그래서 **목록 카드에 참여자 수를 띄울 수 없다.** 카드는 survey_vote 임베딩으로
--      얻는 "내가 참여했는가"만 표시한다. 참여자 수가 필요해지면 vote_count 컬럼 +
--      after insert or delete 트리거(security definer 필수 — 유저에게 survey UPDATE
--      권한이 없다)를 함께 들이고 rls.sql 섹션 16에 정합성 검사를 더한다.
--
--  * ⚠ **PostgREST의 upsert를 쓰지 않는다.** `Prefer: resolution=merge-duplicates`는
--    `ON CONFLICT DO UPDATE SET`에 payload의 모든 컬럼을 실어 survey_id·user_id에도
--    UPDATE 권한을 요구한다(poll_vote에서 실측 42501). 그 권한을 열면 자기 표의
--    survey_id를 다른 서베이로 옮겨 원래 서베이에서 표를 빼는, 즉 DELETE 정책을 두지
--    않은 "취소 불가"를 우회하는 경로가 열린다.
--    → 클라이언트가 "내 표가 있는가"로 갈라 insert 또는 option_id만 바꾸는 UPDATE를 보낸다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 테이블
-- ---------------------------------------------------------------------

-- ⚠ **컬럼이 `title` 하나다.** 이 값이 곧 목록 카드의 헤딩이자 상세의 h1이고 `<title>`이다 —
--   제목과 질문을 따로 두면 둘이 어긋난 문항을 만들 수 있는데, 화면에는 그 사실이 드러나지 않는다.
create table public.survey (
  id bigint generated always as identity primary key,
  -- ⚠ 클라이언트 쓰기 경로가 없어 겹쳐 걸 화면 한도가 없다 — 이 CHECK가 유일한 한도다.
  --    값은 다른 컬럼과 같은 단위(코드포인트)이고 abuse bound로만 기능한다.
  title text not null
    check (char_length(title) between 1 and 1000)
    check (public.has_visible_char(title)),
  created_at timestamptz not null default now(),

  -- 마감 시각. 기본은 **생성 + 7일**이고, 마이그레이션이 문항별로 다르게 줄 수 있다.
  -- ⚠ `created_at`의 default도 `now()`라 같은 트랜잭션 시각을 본다 → 정확히 +7일이 된다.
  -- ⚠ generated column으로 두지 않는다 — `timestamptz + interval`은 DST 처리가 TimeZone
  --   설정에 의존해 IMMUTABLE이 아니라 stored generated에 쓸 수 없고, 무엇보다 기간을
  --   문항별로 다르게 줄 여지를 없앤다.
  closes_at timestamptz not null default (now() + interval '7 days')
    check (closes_at > created_at)
);

create table public.survey_option (
  id        bigint generated always as identity primary key,
  survey_id bigint not null references public.survey (id) on delete cascade,
  label text not null
    check (char_length(label) between 1 and 400)
    check (public.has_visible_char(label)),
  -- ⚠ 컬럼명을 `position`으로 두지 않는다 — POSITION은 col_name_keyword라 문맥에 따라
  --   파서가 함수 호출로 읽는다. PostgREST select 문자열에도 그대로 실리는 이름이다.
  -- ⚠ **선택지 상한 4를 이 check와 아래 unique가 함께 강제한다.** 하한 2는 행 수라
  --   check로 셀 수 없다 — 입력이 우리가 쓴 마이그레이션뿐이므로 rls.sql 섹션 30이
  --   "선택지 2개 미만인 survey가 0행"을 검사해 지킨다(섹션 16·17과 같은 성격이다).
  sort_order smallint not null check (sort_order between 1 and 4),
  unique (survey_id, sort_order),
  -- ⚠ 같은 서베이에 같은 라벨을 두 번 두지 못하게 한다. 라벨이 같으면 결과를 읽을 수 없다.
  unique (survey_id, label),

  -- 분할 카드의 부제("GOAT, 좌발"). 없으면 이름만 그린다.
  -- label과 같은 규약 — 코드포인트 단위의 abuse bound다(화면 한도는 없다).
  subtitle text
    check (subtitle is null
           or (char_length(subtitle) between 1 and 400 and public.has_visible_char(subtitle))),

  -- 분할 카드에서 이 면이 쓸 배경·글자색.
  --
  -- ⚠ **이 값의 유무가 곧 "분할 카드로 그릴 문항인가"의 판별자다.** layout enum을 따로
  --   두지 않는 이유가 여기 있다 — PostgreSQL은 enum 값을 **지울 수 없어서**(add/rename만
  --   구현돼 있다) 형태를 하나 늘리는 결정이 영구적이 된다. 색이 없으면 클라이언트가
  --   기존 선택지 목록으로 폴백하므로 되돌리기가 `update ... set bg_color = null` 한 줄이다.
  --
  -- ⚠ **jsonb로 묶지 않는다.** 이 파일 머리말의 원칙 그대로 — 컬럼 권한이 실제 방어선인데
  --   jsonb는 하위 필드에 권한을 걸 수 없고, v1이 `meta`를 "표현값의 쓰레기통"으로 만들었다.
  -- 면 배경 이미지의 **버킷 안 경로**(`{survey_id}/{파일명}`). 있으면 색보다 우선한다.
  --
  -- ⚠ **전체 URL이 아니라 경로다** — 아바타와 같은 이유로, URL을 넣으면 로컬
  --   (127.0.0.1:64321)과 원격(*.supabase.co)의 호스트가 달라 환경을 옮길 때마다 모든 행이
  --   깨진다. 조립은 `publicStorageUrl()` 한 곳에서만 한다.
  --   (본문 이미지가 URL을 담는 것은 자유 텍스트라 형태를 강제할 자리가 없어서다 —
  --    여기는 컬럼이므로 아바타 쪽 규약을 따른다.)
  -- ⚠ **`starts_with` 대신 정규식으로 두 세그먼트를 강제한다.** 아바타에서 실측한 함정이다:
  --   `..`가 낀 경로는 URL을 만드는 순간 브라우저 파서가 정규화해 **다른 폴더의 파일**을
  --   가리킨다. `\d+` 폴더는 `..`를 애초에 받지 않는다.
  -- ⚠ **`bg_color`를 대체하지 않는다.** 이미지가 뜨기 전·실패했을 때 깔릴 배경이 필요하고,
  --   `text_color`는 이미지 위에서도 그대로 쓴다 → 분할 카드 판별자는 여전히 색이다.
  image_path text
    check (image_path is null
           or image_path ~ '^[0-9]+/[A-Za-z0-9][A-Za-z0-9._-]*\.(webp|jpg|jpeg|png)$'),

  bg_color   text check (bg_color   is null or bg_color   ~ '^#[0-9a-fA-F]{6}$'),
  text_color text check (text_color is null or text_color ~ '^#[0-9a-fA-F]{6}$'),
  -- ⚠ 한쪽만 지정하면 대비를 보장할 수 없다 — 둘 다이거나 둘 다 아니어야 한다.
  --   "한 서베이 안에서 전부 갖거나 전부 없거나"는 행 **간** 제약이라 CHECK로 셀 수 없다
  --   → 선택지 하한 2와 같은 자리(`rls.sql` 섹션 30)가 검사로 지킨다.
  check ((bg_color is null) = (text_color is null)),

  -- 아래 복합 FK가 참조할 대상. 논리적으로는 id가 이미 유일하지만 FK는 (survey_id, id) 쌍에
  -- 걸린 유니크 제약을 요구한다.
  unique (survey_id, id)
);

create table public.survey_vote (
  survey_id bigint not null,
  user_id   uuid   not null references public.profiles (id) on delete cascade,
  option_id bigint not null,
  created_at timestamptz not null default now(),
  -- "한 사람 한 표"를 기본키가 겸한다
  primary key (survey_id, user_id),
  -- 고른 선택지가 **이 서베이의 것**임을 DB가 보장한다 → 정책에 검증 로직이 필요 없다
  foreign key (survey_id, option_id)
    references public.survey_option (survey_id, id) on delete cascade,
  -- ⚠ 논리적으로는 위 복합 FK가 이미 함의한다. 그런데도 따로 선언하는 이유는
  --   **PostgREST가 survey → survey_vote 관계를 단일 컬럼 FK로 추론하기 때문**이다.
  --   "중복이니 지우자"고 판단하지 말 것 — 지우면 목록·상세의 임베딩이 깨진다
  --   (poll_vote가 같은 이유로 같은 형태를 갖고 있다).
  foreign key (survey_id) references public.survey (id) on delete cascade
);

-- 집계(option_id별 count)와 "내 표" 조회가 모두 이 인덱스를 탄다
create index survey_vote_survey_option_idx on public.survey_vote (survey_id, option_id);
-- 탈퇴 cascade가 유저의 표를 훑을 때 쓴다(poll_vote_user_id_idx와 같은 이유)
create index survey_vote_user_id_idx on public.survey_vote (user_id);

comment on table public.survey is
  '운영진이 등록하는 전 유저 대상 단일 선택 서베이. 쓰기 정책도 grant도 없다 — '
  '문항 추가의 유일한 경로가 마이그레이션이다';
comment on table public.survey_vote is
  '한 사람 한 표. SELECT 정책이 "내 행만"이라 임베딩 결과가 곧 "내가 고른 것"이다 '
  '(post_like·poll_vote와 같은 트릭). 집계는 컬럼이 아니라 survey_results()가 그때그때 센다';

-- ---------------------------------------------------------------------
-- 2. 기간 판정 — 마감된 서베이에는 쓸 수 없다
--
-- ⚠ **정책 안에 인라인 `exists`를 쓰지 않는다.** RLS 술어가 security-barrier 서브쿼리
--   안으로 들어가 바깥의 등가류가 전파되지 않고 부모 테이블 전체를 훑는다
--   (실측: 인라인 4.76ms vs stable definer 헬퍼 0.61ms). `post_is_alive` 선례 그대로다.
--
-- ⚠ **anon에는 열지 않는다** — 이 함수를 부르는 정책이 전부 `to authenticated`다.
--   그래서 `rls.sql` 섹션 17d의 anon EXECUTE 화이트리스트는 변경되지 않는다.
-- ---------------------------------------------------------------------
create or replace function public.survey_is_open(p_survey_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.survey s
     where s.id = p_survey_id and s.closes_at > now()
  )
$$;

revoke execute on function public.survey_is_open(bigint) from public, anon;
grant  execute on function public.survey_is_open(bigint) to authenticated;

-- ---------------------------------------------------------------------
-- 3. 결과 게이팅 — 참여한 사람만 집계를 본다
--
-- poll_results와 같은 형태이고, 다른 점은 post_is_alive 확인이 없다는 것뿐이다
-- (서베이에는 소프트 삭제되는 부모가 없다).
--
-- security definer인 이유가 규약이다: 개별 표는 RLS로 "내 행만"인데 **집계는 그 경계를
-- 넘어야 한다.** 함수가 입력 외의 정보를 돌려주지 않으므로 열어도 안전하다.
-- ⚠ security definer는 권한만 바꾸고 세션 컨텍스트는 그대로다 — 함수 안의 auth.uid()는
--   **호출자**를 가리킨다. 게이팅이 성립하는 근거다.
-- ---------------------------------------------------------------------
create or replace function public.survey_results(p_survey_id bigint)
returns table (option_id bigint, vote_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select v.option_id, count(*)
    from public.survey_vote v
   where v.survey_id = p_survey_id
     and exists (
       select 1 from public.survey_vote me
        where me.survey_id = p_survey_id and me.user_id = (select auth.uid())
     )
   group by v.option_id
$$;

-- 비로그인은 참여할 수 없으므로 결과도 볼 수 없다 — 게이팅과 일관된다.
-- ⚠ 그래서 이 함수는 rls.sql 섹션 17d의 anon EXECUTE 화이트리스트에 **들어가지 않는다**.
revoke execute on function public.survey_results(bigint) from public, anon;
grant  execute on function public.survey_results(bigint) to authenticated;

-- ---------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------
alter table public.survey        enable row level security;
alter table public.survey_option enable row level security;
alter table public.survey_vote   enable row level security;

-- 서베이는 비로그인에게도 공개된다 — 참여만 로그인이 필요하다.
-- ⚠ `to` 절을 두지 않는다(anon·authenticated 모두). 아래 grant 주석 참고.
create policy "survey_select_all"        on public.survey        for select using (true);
create policy "survey_option_select_all" on public.survey_option for select using (true);

/*
 * ⚠ **survey·survey_option에는 INSERT·UPDATE·DELETE 정책을 두지 않는다.**
 *
 *   poll이 "작성자면 넣을 수 있다"로 열었다가 **정책에 시점 개념이 없어** 이미 표가
 *   던져진 투표에 선택지를 끼워 넣을 수 있었던 사고(20260817000003 주석)를 반복하지 않는다.
 *   서베이는 애초에 사용자가 만드는 것이 아니므로 열 이유 자체가 없다.
 *
 *   → 문항 등록은 **마이그레이션**이 한다. 테이블 소유자로 실행되어 RLS를 지나지 않는다.
 *     그래서 poll과 달리 definer 생성 함수조차 필요 없다.
 */

-- post_like_select_own·poll_vote_select_own과 같은 트릭 —
-- 임베딩 결과가 곧 "내가 고른 것"이 된다(남의 표가 새는 사고가 구조적으로 불가능하다)
-- ⚠ **SELECT에는 만료를 걸지 않는다** — 마감돼도 내가 뭘 골랐는지는 보여야 한다.
--   같은 이유로 `survey_results`에도 걸지 않는다(마감 후에도 참여자는 결과를 본다).
create policy "survey_vote_select_own" on public.survey_vote
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "survey_vote_insert_own" on public.survey_vote
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.survey_is_open(survey_id));

-- 갈아타기 — 컬럼 권한이 option_id 하나뿐이라 이 정책으로 바꿀 수 있는 것도 그것뿐이다
create policy "survey_vote_update_own" on public.survey_vote
  for update to authenticated
  using      (user_id = (select auth.uid()) and public.survey_is_open(survey_id))
  with check (user_id = (select auth.uid()) and public.survey_is_open(survey_id));

-- ⚠ **만료를 `using`·`with check` 양쪽에 건다**(`poll_vote`가 `post_is_alive`에 한 것과 같다).
--   `using`이 있어야 마감된 표가 UPDATE 후보에서 빠져 0행이 되고, 훅이 그걸 한국어로 승격한다.

-- ⚠ DELETE 정책이 없다 = 참여 취소 불가(갈아타기만).
--   ⚠ 이 성질은 **컬럼 권한과 한 쌍이다** — update에 survey_id를 열면 표를 다른 서베이로
--     옮겨 원래 서베이에서 빼는 우회로가 생긴다. 아래 grant를 넓히지 말 것.

-- ---------------------------------------------------------------------
-- 5. 이미지 버킷 — 운영진 문항의 면 배경
--
-- ⚠ **쓰기 정책을 두지 않는다.** 문항과 같은 취급이다 — 앱에는 업로드 경로가 없고,
--   파일은 배포 스크립트가 service_role로 올린다. 정책이 없으면 anon·authenticated는
--   업로드·수정·삭제를 할 수 없다(스토리지도 RLS로 돌아간다).
-- ⚠ **크기·타입의 실제 방어선은 여기 버킷 설정이다** — 정책만 보면 이 값이 조용히
--   넓어져도 아무도 모른다(`rls.sql` 섹션 24c가 avatars에 대해 하는 일과 같다).
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('survey-images', 'survey-images', true, 1048576,
        array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- 서베이 자체가 비로그인에게도 공개되므로 이미지도 공개다
create policy "survey_images_select_all" on storage.objects
  for select using (bucket_id = 'survey-images');

-- ---------------------------------------------------------------------
-- 6. 권한 위생
--
-- public 스키마 기본 권한이 anon/authenticated에 ALL이라, revoke를 한 번만 잊어도
-- 즉시 구멍이 된다(rls.sql 섹션 17이 전수로 잡는다).
-- ---------------------------------------------------------------------
revoke all on public.survey        from anon, authenticated;
revoke all on public.survey_option from anon, authenticated;
revoke all on public.survey_vote   from anon, authenticated;

grant select on public.survey        to anon, authenticated;
grant select on public.survey_option to anon, authenticated;
-- ⚠ **anon에도 SELECT를 준다** — poll_vote와 같은 형태다. 행을 막는 것은 grant가 아니라
--   정책(`survey_vote_select_own`이 `to authenticated`)이라 anon에게는 어차피 0행이 간다.
--   grant를 빼면 임베딩(`survey(… survey_vote(option_id))`)이 42501로 죽어 **비로그인에게
--   서베이가 통째로 안 보인다**(poll에서 실측한 증상이다).
grant select on public.survey_vote   to anon, authenticated;

grant insert (survey_id, user_id, option_id) on public.survey_vote to authenticated;
-- ⚠ 갈아타기용. **option_id 하나만** 연다 — survey_id를 열면 "취소 불가"가 뚫리고,
--   created_at을 열면 시각 위조가 된다. PostgREST upsert를 쓰지 않는 이유이기도 하다.
grant update (option_id)                     on public.survey_vote to authenticated;

-- ⚠ identity 시퀀스는 테이블 revoke에 딸려오지 않는다. survey·survey_option이
--   `generated always as identity`라 이번에 시퀀스가 둘 생겼다.
revoke all on all sequences in schema public from anon, authenticated;
