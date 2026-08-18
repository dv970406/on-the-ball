-- =====================================================================
-- 투표 — 글에 딸린 단일 선택 투표 (마감 없음 · 생성 시 고정)
--
-- 설계 원칙
--  * **jsonb 컬럼이 아니라 테이블이다.** 이 프로젝트의 실제 방어선이 컬럼 권한인데 jsonb는
--    하위 필드에 권한을 걸 수 없다 — 작성자가 자기 글의 like_count를 고칠 수 있었던 사고가
--    득표수에서 그대로 재현된다. v1도 `meta` jsonb로 묶었다가 "표현값의 쓰레기통이 됐다"고
--    기록해 두었다(docs/legacy/v1-inventory.md 판단 #1).
--  * **득표수 컬럼도, 카운터 트리거도 두지 않는다.** 아래 poll_results가 그때그때 센다.
--    like_count가 탈퇴 cascade 경로에서 어긋나 영구히 과대로 남았던 사고의 클래스가
--    통째로 사라진다(어긋날 값 자체가 없다). 선택지가 4개 이하라 집계는 사실상 공짜다.
--  * **투표하기에는 RPC가 없다.** 좋아요는 카운터 컬럼을 함께 움직여야 해서 잠금이 필요했지만,
--    투표는 (post_id, user_id) 기본키를 가진 행 하나를 쓰는 게 전부다. 집계 컬럼이 없으니
--    lost update가 성립하지 않는다 — 같은 유저의 동시 요청은 "마지막에 고른 것이 남는다"로
--    끝나고, 그건 애초에 이 기능의 정의다. 보안 표면을 늘리지 않는다.
--
--  * ⚠ **PostgREST의 upsert를 쓰지 않는다.** `Prefer: resolution=merge-duplicates`는
--    `ON CONFLICT DO UPDATE SET`에 **payload의 모든 컬럼**을 싣기 때문에 post_id·user_id에도
--    UPDATE 권한을 요구한다(실측: 42501 "permission denied for table poll_vote").
--    그 권한을 열면 자기 표의 post_id를 **살아 있는 다른 글로 옮겨** 원래 글에서 표를 빼는,
--    즉 DELETE 정책을 두지 않은 "취소 불가"를 우회하는 경로가 열린다.
--    → 클라이언트가 "내 표가 있는가"로 갈라 insert 또는 UPDATE(option_id만)를 보낸다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 테이블
-- ---------------------------------------------------------------------

-- poll의 기본키가 곧 post_id다 — "1글 : 1투표"를 제약이 강제한다
create table public.poll (
  post_id  bigint primary key references public.post (id) on delete cascade,
  -- 화면 한도는 100그래핌, 여기는 abuse bound인 코드포인트 K=10배(api-and-db.md의 길이 규약)
  question text not null
    check (char_length(question) between 1 and 1000)
    check (public.has_visible_char(question)),
  created_at timestamptz not null default now()
);

create table public.poll_option (
  id      bigint generated always as identity primary key,
  post_id bigint not null references public.poll (post_id) on delete cascade,
  label   text not null
    check (char_length(label) between 1 and 400)
    check (public.has_visible_char(label)),
  -- ⚠ 컬럼명을 `position`으로 두지 않는다 — POSITION은 col_name_keyword라 문맥에 따라
  --   파서가 함수 호출로 읽는다. PostgREST select 문자열에도 그대로 실리는 이름이다.
  sort_order smallint not null check (sort_order between 1 and 4),
  unique (post_id, sort_order),
  -- ⚠ 같은 투표에 같은 라벨을 두 번 두지 못하게 한다. 클라이언트(`validatePoll`)도 막지만
  --   zod는 UX이지 방어가 아니다 — 라벨이 같으면 결과를 읽을 수 없다.
  unique (post_id, label),
  -- 아래 복합 FK가 참조할 대상. 논리적으로는 id가 이미 유일하지만 FK는 (post_id, id) 쌍에
  -- 걸린 유니크 제약을 요구한다.
  unique (post_id, id)
);

create table public.poll_vote (
  post_id   bigint not null,
  user_id   uuid   not null references public.profiles (id) on delete cascade,
  option_id bigint not null,
  created_at timestamptz not null default now(),
  -- "한 사람 한 표"를 기본키가 겸한다
  primary key (post_id, user_id),
  -- 고른 선택지가 **이 글의 것**임을 DB가 보장한다 → 정책에 검증 로직이 필요 없다
  foreign key (post_id, option_id)
    references public.poll_option (post_id, id) on delete cascade,
  -- ⚠ 논리적으로는 위 복합 FK가 이미 함의한다. 그런데도 따로 선언하는 이유는
  --   **PostgREST가 poll → poll_vote 관계를 단일 컬럼 FK로 추론하기 때문**이다.
  --   "중복이니 지우자"고 판단하지 말 것 — 지우면 상세 화면의 임베딩이 깨진다.
  foreign key (post_id) references public.poll (post_id) on delete cascade
);

-- 집계(option_id별 count)와 "내 표" 조회가 모두 이 인덱스를 탄다
create index poll_vote_post_option_idx on public.poll_vote (post_id, option_id);
-- 탈퇴 cascade가 유저의 표를 훑을 때 쓴다(post_like_user_id_idx와 같은 이유)
create index poll_vote_user_id_idx on public.poll_vote (user_id);

comment on table public.poll is
  '글에 딸린 단일 선택 투표. 생성 시 고정이라 UPDATE/DELETE 정책이 없다';
comment on table public.poll_vote is
  '한 사람 한 표. SELECT 정책이 "내 행만"이라 임베딩 결과가 곧 "내가 고른 것"이다 '
  '(post_like와 같은 트릭 — 남의 표가 새는 사고가 구조적으로 불가능하다). '
  '집계는 컬럼이 아니라 poll_results()가 그때그때 센다';

-- ---------------------------------------------------------------------
-- 2. 결과 게이팅 — 투표한 사람만 집계를 본다
--
-- ⚠ v1은 "투표해야 결과 공개"를 UI에서만 가려 **실제로는 게이팅이 아니었다**
--   (v1-inventory.md 판단 #4). v1이 그렇게 한 이유는 목록 카드가 비율 바를 그려야 해서인데
--   우리 목록에는 투표가 없다 — 그 제약이 없으므로 제대로 건다.
--
-- security definer인 이유가 규약이다: 개별 표는 RLS로 "내 행만"인데 **집계는 그 경계를
-- 넘어야 한다.** 함수가 입력 외의 정보를 돌려주지 않으므로 열어도 안전하다
-- (post_is_alive·has_visible_char와 같은 판단).
-- ⚠ security definer는 권한만 바꾸고 세션 컨텍스트는 그대로다 — 함수 안의 auth.uid()는
--   **호출자**를 가리킨다. 게이팅이 성립하는 근거다.
-- ---------------------------------------------------------------------
create or replace function public.poll_results(p_post_id bigint)
returns table (option_id bigint, vote_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select v.option_id, count(*)
    from public.poll_vote v
   where v.post_id = p_post_id
     -- ⚠ **소프트 삭제를 여기서도 확인한다.** definer라 RLS를 우회하므로 정책에 건
     --   `post_is_alive`가 이 함수에는 닿지 않는다 — 빠뜨렸더니 삭제된 글의 집계가
     --   투표자 전원에게 영구히 열려 있었고, id가 연번이라 `poll_results(N)`을 훑으면
     --   **삭제된 글 중 투표가 있었던 것**을 식별할 수 있었다(실측).
     and public.post_is_alive(p_post_id)
     and exists (
       select 1 from public.poll_vote me
        where me.post_id = p_post_id and me.user_id = (select auth.uid())
     )
   group by v.option_id
$$;

-- 비로그인은 투표할 수 없으므로 결과도 볼 수 없다 — 게이팅과 일관된다
revoke execute on function public.poll_results(bigint) from public, anon;
grant  execute on function public.poll_results(bigint) to authenticated;

-- ---------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------
alter table public.poll        enable row level security;
alter table public.poll_option enable row level security;
alter table public.poll_vote   enable row level security;

-- ⚠ 부모의 소프트 삭제를 자식 정책에 묶는다 — 삭제된 글의 댓글이 비로그인에게
--   그대로 공개됐던 구멍과 같은 형태다.
create policy "poll_select_alive_post" on public.poll
  for select using (public.post_is_alive(post_id));

create policy "poll_option_select_alive_post" on public.poll_option
  for select using (public.post_is_alive(post_id));

/*
 * ⚠ **poll·poll_option에는 INSERT 정책도 두지 않는다.**
 *
 *   처음에는 "작성자면 넣을 수 있다"(`post_is_author`)로 열어 두고 UPDATE/DELETE만 막아
 *   "생성 시 고정"이라고 적었는데, **그 주장이 거짓이었다.** 정책에 시점 개념이 없어
 *   작성자가 **이미 표가 던져진 투표에 선택지를 나중에 끼워 넣을 수 있었다**(실측 성공).
 *   2지선다에 표를 던진 사람의 표가 4지선다의 표로 뜻이 바뀌고 화면은 그 사실을 말하지 않는다.
 *   판세를 본 뒤 표 분산용 보기를 추가하는 것도 같은 경로다.
 *   덤으로 **선택지 2~4개 규약이 `create_post_with_poll` 안에만 있어** 직접 insert로
 *   선택지 1개짜리(강요형) 투표도 만들어졌다.
 *
 *   → 아래 `create_post_with_poll`을 **유일한 쓰기 경로**로 만든다(정책 없음 + grant 없음).
 *     그러면 "생성 시 고정"과 "선택지 2~4개"를 **함수 하나가 단독으로 소유**한다.
 */

-- post_like_select_own과 같은 트릭 — 임베딩 결과가 곧 "내가 고른 것"이 된다
-- ⚠ `post_is_alive`를 insert·update 정책과 **같이** 건다. 빠뜨렸더니 같은 테이블 안에서
--   판정이 갈려, 삭제된 글의 내 표가 계속 조회됐다.
create policy "poll_vote_select_own" on public.poll_vote
  for select to authenticated
  using (user_id = (select auth.uid()) and public.post_is_alive(post_id));

create policy "poll_vote_insert_own" on public.poll_vote
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.post_is_alive(post_id));

-- 갈아타기 — 컬럼 권한이 option_id 하나뿐이라 이 정책으로 바꿀 수 있는 것도 그것뿐이다
create policy "poll_vote_update_own" on public.poll_vote
  for update to authenticated
  using      (user_id = (select auth.uid()) and public.post_is_alive(post_id))
  with check (user_id = (select auth.uid()) and public.post_is_alive(post_id));

-- ⚠ DELETE 정책이 없다 = 투표 취소 불가(갈아타기만).
--   ⚠ 이 성질은 **컬럼 권한과 한 쌍**이다 — update에 post_id를 열면 표를 다른 글로 옮겨
--     원래 글에서 빼는 우회로가 생긴다. 아래 grant를 넓히지 말 것.

-- ---------------------------------------------------------------------
-- 5. 권한 위생
--
-- public 스키마 기본 권한이 anon/authenticated에 ALL이라, revoke를 한 번만 잊어도
-- 즉시 구멍이 된다(rls.sql 섹션 17이 전수로 잡는다).
-- ---------------------------------------------------------------------
revoke all on public.poll        from anon, authenticated;
revoke all on public.poll_option from anon, authenticated;
revoke all on public.poll_vote   from anon, authenticated;

grant select on public.poll        to anon, authenticated;
grant select on public.poll_option to anon, authenticated;
-- ⚠ **anon에도 SELECT를 준다** — post_like와 같은 형태다. 행을 막는 것은 grant가 아니라
--   정책(`poll_vote_select_own`이 `to authenticated`)이라 anon에게는 어차피 0행이 간다.
--   grant를 빼면 임베딩(`poll(… poll_vote(option_id))`)이 42501로 죽어 **비로그인에게
--   투표가 통째로 안 보인다**(실측: 상세 화면에서 투표 블록이 사라졌다).
grant select on public.poll_vote   to anon, authenticated;

-- ⚠ poll·poll_option에는 **INSERT를 주지 않는다.** 유일한 생성 경로는
--   `create_post_with_poll`(security definer)이다 — 위 정책 절의 사유 참고.
grant insert (post_id, user_id, option_id) on public.poll_vote   to authenticated;
-- ⚠ 갈아타기용. **option_id 하나만** 연다 — post_id를 열면 "취소 불가"가 뚫리고,
--   created_at을 열면 시각 위조가 된다. PostgREST upsert를 쓰지 않는 이유이기도 하다.
grant update (option_id)                   on public.poll_vote   to authenticated;

-- identity 시퀀스는 테이블 revoke에 딸려오지 않는다
revoke all on all sequences in schema public from anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. 글 + 투표를 한 트랜잭션으로 만든다
--
-- ⚠ **security DEFINER다.** 두 가지를 한꺼번에 소유하기 위해서다:
--   ① **원자성** — 투표는 생성 시 고정이라 "글은 올라갔는데 투표만 실패"의 복구 경로가 없다.
--   ② **유일한 생성 경로** — poll·poll_option에 정책도 grant도 없으므로 이 함수 말고는
--      투표를 만들 수 없다. 그래야 "생성 시 고정"과 "선택지 2~4개"가 실제로 성립한다.
--      (처음엔 invoker + insert 정책이었는데, 정책에 시점 개념이 없어 진행 중인 투표에
--       선택지를 끼워 넣을 수 있었다 — 위 정책 절 참고.)
--
-- ⚠ definer이므로 **유저 id를 인자로 받지 않는다.** 함수 안에서 auth.uid()로 확정한다
--   (api-and-db.md의 definer 규약). 컬럼 권한도 우회하므로 삽입 컬럼을 여기서 못박는다.
--
-- 투표가 없는 글은 이 함수를 거치지 않고 기존 insert 경로(RLS + 컬럼 권한) 그대로 간다.
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
  --   EXECUTE를 anon에서 회수한 것과는 층이 다르다(그쪽은 PostgREST 경로, 이건 모든 경로).
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

  -- ⚠ **라벨을 정규형으로 접어 저장한다.** 접지 않으면 위 `unique (post_id, label)`이
  --   제로폭 문자·NBSP·꼬리 공백으로 **그냥 우회된다** — '찬성' · '찬성 ' · '찬'+ZWSP+'성'이
  --   서로 다른 값이라 제약을 통과하고, 화면에는 **똑같이 생긴 선택지 여럿**이 뜬다.
  --   투표에서 그건 오타가 아니라 표를 쪼개는 도구다(닉네임 사칭과 같은 구멍이다).
  -- ⚠ 클라이언트(`validatePoll`)도 같은 정규화를 하고 보낸다. 정규화는 멱등이라 두 번 접혀도
  --   결과가 같고, **그래야 화면이 보여준 문구와 저장된 문구가 갈리지 않는다.**
  --   normalize_nickname은 이름이 첫 호출자를 기록할 뿐 하는 일은 "보이는 텍스트의 정규형"이다.
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

  insert into public.poll (post_id, question) values (v_post_id, p_question);

  insert into public.poll_option (post_id, label, sort_order)
  select v_post_id, l.label, l.ord::smallint
    from unnest(v_labels) with ordinality as l(label, ord);

  return v_post_id;
end;
$$;

revoke execute on function
  public.create_post_with_poll(public.post_category, text, text, text, text[])
  from public, anon;
grant execute on function
  public.create_post_with_poll(public.post_category, text, text, text, text[])
  to authenticated;
