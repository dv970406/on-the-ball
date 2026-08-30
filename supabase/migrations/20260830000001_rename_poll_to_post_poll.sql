-- ---------------------------------------------------------------------
-- poll · poll_option · poll_vote → post_poll · post_poll_option · post_poll_vote
--
-- **개명이 아니라 교정이다.** 이 서브트리에는 `poll_id` 컬럼이 아예 없다 — 세 테이블이
-- 전부 `post_id`를 축으로 돌고, `poll`의 기본키가 곧 `post_id`다("1글 : 1투표"). 즉
-- `poll`은 독립 엔티티가 아니라 **post의 1:1 확장 테이블**인데 이름만 그 사실을
-- 말하지 않고 있었다. `post_like`·`post_report`가 이미 쓰는 접두어 규칙에서 이것만
-- 혼자 벗어나 있었던 셈이다.
--
-- 나란히 놓으면 대비가 드러난다 — `survey`는 자체 `id`가 PK이고 자식이 `survey_id`로
-- 도는 **진짜 독립 엔티티**다. 그래서 survey는 접두어 없이 그대로 두고(그 "없음"이 곧
-- 부모가 없다는 신호가 된다), 앞으로 붙을 `match_prediction`이 같은 규칙 위에 선다:
--   post_poll ← post에 딸린다 / survey ← 부모가 없다 / match_prediction ← match에 딸린다
--
-- ⚠ **URL이 걸리지 않아서 가능한 작업이다.** poll은 글 상세 안에 임베드되어 자기 경로를
--   갖지 않는다 — 사이트맵·색인·공유된 링크가 하나도 깨지지 않는다. `/surveys`를 그대로
--   두는 이유가 정확히 그 반대다("URL은 영구 계약", nextjs.md).
--
-- ⚠ **FSD 슬라이스는 따라가지 않는다.** `entities/poll`·`features/cast-poll-vote`는
--   그대로다 — 슬라이스명이 테이블명과 1:1인 적이 없다(`entities/block` ↔ `user_block`,
--   `features/report-post` ↔ `post_report`, `entities/profile` ↔ `profiles`).
--   연결고리는 `entities/poll/model/types.ts`의 `Tables["post_poll"]` 한 줄이 갖는다.
--
-- ⚠ **데이터는 움직이지 않는다.** rename은 카탈로그만 고치므로 행·인덱스가 그대로 있고,
--   grant와 RLS 활성 상태도 OID에 걸려 있어 따라온다. 반면 **정책·제약·인덱스·시퀀스의
--   이름과 함수 본문은 따라오지 않아** 아래에서 손으로 옮긴다.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 1. 테이블
-- ---------------------------------------------------------------------
alter table public.poll        rename to post_poll;
alter table public.poll_option rename to post_poll_option;
alter table public.poll_vote   rename to post_poll_vote;

-- ---------------------------------------------------------------------
-- 2. 제약
--
-- ⚠ pkey·unique 제약은 인덱스를 겸하므로 **제약을 바꾸면 인덱스 이름도 함께 바뀐다.**
--   그래서 아래 3절에는 제약이 아닌 인덱스 둘만 남는다.
-- ---------------------------------------------------------------------
alter table public.post_poll rename constraint poll_pkey            to post_poll_pkey;
alter table public.post_poll rename constraint poll_post_id_fkey    to post_poll_post_id_fkey;
alter table public.post_poll rename constraint poll_question_check  to post_poll_question_check;
alter table public.post_poll rename constraint poll_question_check1 to post_poll_question_check1;

alter table public.post_poll_option
  rename constraint poll_option_pkey to post_poll_option_pkey;
alter table public.post_poll_option
  rename constraint poll_option_post_id_fkey to post_poll_option_post_id_fkey;
alter table public.post_poll_option
  rename constraint poll_option_post_id_id_key to post_poll_option_post_id_id_key;
alter table public.post_poll_option
  rename constraint poll_option_post_id_label_key to post_poll_option_post_id_label_key;
alter table public.post_poll_option
  rename constraint poll_option_post_id_sort_order_key to post_poll_option_post_id_sort_order_key;
alter table public.post_poll_option
  rename constraint poll_option_label_check to post_poll_option_label_check;
alter table public.post_poll_option
  rename constraint poll_option_label_check1 to post_poll_option_label_check1;
alter table public.post_poll_option
  rename constraint poll_option_sort_order_check to post_poll_option_sort_order_check;

alter table public.post_poll_vote
  rename constraint poll_vote_pkey to post_poll_vote_pkey;
alter table public.post_poll_vote
  rename constraint poll_vote_user_id_fkey to post_poll_vote_user_id_fkey;
alter table public.post_poll_vote
  rename constraint poll_vote_post_id_fkey to post_poll_vote_post_id_fkey;
-- 선택지가 **이 글의 것**임을 보장하는 복합 FK — 정책에 검증 로직이 없는 근거다
alter table public.post_poll_vote
  rename constraint poll_vote_post_id_option_id_fkey to post_poll_vote_post_id_option_id_fkey;

-- ---------------------------------------------------------------------
-- 3. 인덱스 (제약이 겸하지 않는 것만)
-- ---------------------------------------------------------------------
-- 집계와 "내 표" 조회가 모두 이걸 탄다
alter index public.poll_vote_post_option_idx rename to post_poll_vote_post_option_idx;
-- 탈퇴 cascade가 유저의 표를 훑을 때 쓴다
alter index public.poll_vote_user_id_idx     rename to post_poll_vote_user_id_idx;

-- ⚠ identity 시퀀스는 테이블 rename을 따라오지 않는다. 이름만 남으면 `post_poll_option`의
--   시퀀스가 `poll_option_id_seq`로 불려 다음 사람이 대응 관계를 못 찾는다.
alter sequence public.poll_option_id_seq rename to post_poll_option_id_seq;

-- ---------------------------------------------------------------------
-- 4. 정책 — rename을 따라오지 않는다
-- ---------------------------------------------------------------------
alter policy "poll_select_alive_post"        on public.post_poll        rename to "post_poll_select_alive_post";
alter policy "poll_option_select_alive_post" on public.post_poll_option rename to "post_poll_option_select_alive_post";
alter policy "poll_vote_select_own"          on public.post_poll_vote   rename to "post_poll_vote_select_own";
alter policy "poll_vote_insert_own"          on public.post_poll_vote   rename to "post_poll_vote_insert_own";
alter policy "poll_vote_update_own"          on public.post_poll_vote   rename to "post_poll_vote_update_own";

-- ---------------------------------------------------------------------
-- 5. 집계 함수 — 본문의 테이블 참조도 rename을 따라오지 않는다
--
-- `alter function ... rename` + `create or replace`가 아니라 drop 후 재생성이다.
-- 그러면 revoke/grant가 이 파일에 그대로 남아 **보안 자세가 눈에 보인다**
-- (`rls.sql` 섹션 17d의 anon EXECUTE 화이트리스트와 대조되는 자리다).
-- ---------------------------------------------------------------------
drop function if exists public.poll_results(bigint);

create or replace function public.post_poll_results(p_post_id bigint)
returns table (option_id bigint, vote_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select v.option_id, count(*)
    from public.post_poll_vote v
   where v.post_id = p_post_id
     -- ⚠ **소프트 삭제를 여기서도 확인한다.** definer라 RLS를 우회하므로 정책에 건
     --   `post_is_alive`가 이 함수에는 닿지 않는다 — 빠뜨렸더니 삭제된 글의 집계가
     --   투표자 전원에게 영구히 열려 있었고, id가 연번이라 함수를 훑으면 **삭제된 글 중
     --   투표가 있었던 것**을 식별할 수 있었다(실측).
     and public.post_is_alive(p_post_id)
     and exists (
       select 1 from public.post_poll_vote me
        where me.post_id = p_post_id and me.user_id = (select auth.uid())
     )
   group by v.option_id
$$;

-- 비로그인은 투표할 수 없으므로 결과도 볼 수 없다 — 게이팅과 일관된다
revoke execute on function public.post_poll_results(bigint) from public, anon;
grant  execute on function public.post_poll_results(bigint) to authenticated;

-- ---------------------------------------------------------------------
-- 6. 생성 함수 — **이름은 그대로 둔다**
--
-- `create_post_with_poll`은 "글을 투표와 함께 만든다"로 이미 정확히 읽히고 이름에 post가
-- 이미 있다. 바꿀 이유가 없고, 바꾸면 클라이언트의 `.rpc()` 호출부까지 딸려온다.
-- 본문의 테이블 참조만 새 이름으로 옮긴다.
--
-- ⚠ `create or replace`라 EXECUTE grant가 보존된다(anon revoke / authenticated grant).
--   drop하지 않는 이유다 — 시그니처가 5인자라 drop/create로 가면 오타 한 번에 권한이
--   통째로 열린 채 재생성된다.
-- ---------------------------------------------------------------------
create or replace function public.create_post_with_poll(
  p_category public.post_category,
  p_title    text,
  p_content  text,
  p_question text,
  p_options  text[]
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_post_id bigint;
  v_labels  text[];
begin
  -- ⚠ definer라 RLS가 author_id를 대조해 주지 않는다 — 여기서 직접 막는다.
  if v_user_id is null then
    raise exception '로그인이 필요합니다' using errcode = 'P0001';
  end if;

  -- 클라이언트도 같은 범위를 검사하지만, zod는 UX이지 방어가 아니다.
  -- ⚠ `array_ndims`를 함께 본다 — 2차원 배열(`[[a,b],[c,d]]`)은 `array_length(…,1)`이
  --   2를 돌려주는데 `unnest`는 4개를 펼친다. 세는 것과 넣는 것이 달라지면 안 된다.
  if array_ndims(p_options) is distinct from 1
     or coalesce(array_length(p_options, 1), 0) not between 2 and 4 then
    raise exception '선택지는 2개에서 4개까지예요.' using errcode = 'P0001';
  end if;

  -- ⚠ **라벨을 정규형으로 접어 저장한다.** 접지 않으면 `unique (post_id, label)`이
  --   제로폭 문자·NBSP·꼬리 공백으로 **그냥 우회된다** — '찬성' · '찬성 ' · '찬'+ZWSP+'성'이
  --   서로 다른 값이라 제약을 통과하고, 화면에는 **똑같이 생긴 선택지 여럿**이 뜬다.
  --   투표에서 그건 오타가 아니라 표를 쪼개는 도구다(닉네임 사칭과 같은 구멍이다).
  -- ⚠ 클라이언트(`validatePoll`)도 같은 정규화를 하고 보낸다. 정규화는 멱등이라 두 번 접혀도
  --   결과가 같고, **그래야 화면이 보여준 문구와 저장된 문구가 갈리지 않는다.**
  select array_agg(public.normalize_nickname(o) order by t.ord)
    into v_labels
    from unnest(p_options) with ordinality as t(o, ord);

  -- ⚠ P0001로 직접 던진다. 그냥 두면 NOT NULL이 영어 23502를, CHECK가 23514를 내는데
  --   둘 다 toDbErrorMessage가 "왜 거부됐는지"를 설명하지 못한다.
  if exists (select 1 from unnest(v_labels) l where l is null or not public.has_visible_char(l)) then
    raise exception '선택지를 입력해 주세요.' using errcode = 'P0001';
  end if;

  -- ⚠ 정규형이 같으면 화면에서 구분되지 않는다. 23505를 그대로 내보내면 toDbErrorMessage가
  --   **닉네임 문구인 "이미 사용 중인 값이에요"** 로 접어 버려 뜻이 어긋난다.
  if (select count(distinct l) from unnest(v_labels) l) <> array_length(v_labels, 1) then
    raise exception '같은 선택지를 두 번 쓸 수 없어요.' using errcode = 'P0001';
  end if;

  if p_question is null or not public.has_visible_char(p_question) then
    raise exception '투표 질문을 입력해 주세요.' using errcode = 'P0001';
  end if;

  insert into public.post (author_id, category, title, content)
  values (v_user_id, p_category, p_title, p_content)
  returning id into v_post_id;

  insert into public.post_poll (post_id, question) values (v_post_id, p_question);

  insert into public.post_poll_option (post_id, label, sort_order)
  select v_post_id, l.label, l.ord::smallint
    from unnest(v_labels) with ordinality as l(label, ord);

  return v_post_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. 코멘트 — 내용은 rename을 따라오지만 **본문에 적힌 옛 이름**은 그대로 남는다
-- ---------------------------------------------------------------------
comment on table public.post_poll is
  '글에 딸린 단일 선택 투표. 기본키가 곧 post_id라 "1글 : 1투표"를 제약이 강제한다. '
  '생성 시 고정이라 UPDATE/DELETE 정책이 없고, 유일한 생성 경로가 create_post_with_poll이다';
comment on table public.post_poll_vote is
  '한 사람 한 표. SELECT 정책이 "내 행만"이라 임베딩 결과가 곧 "내가 고른 것"이다 '
  '(post_like와 같은 트릭 — 남의 표가 새는 사고가 구조적으로 불가능하다). '
  '집계는 컬럼이 아니라 post_poll_results()가 그때그때 센다';

-- ⚠ PostgREST가 스키마 캐시를 다시 읽어야 새 이름으로 노출된다. supabase의 DDL 이벤트
--   트리거가 이미 하지만, 놓치면 증상이 "투표 기능 전체 404"라 명시적으로 한 번 더 알린다.
notify pgrst, 'reload schema';
