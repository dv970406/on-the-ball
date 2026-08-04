-- ---------------------------------------------------------------------
-- 커뮤니티 프로토타입 이식 — 말머리 / 조회수 / 발췌 / 답글
--
-- 화면(handoff_community)이 요구하는데 스키마에 없던 것들을 채운다.
-- 저장(북마크)·댓글 좋아요·태그·이미지는 이번 범위가 아니다 — 화면에서도 렌더하지 않는다.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 1. 말머리 (category)
--
-- text + check가 아니라 **enum**인 이유: 생성 타입(database.types.ts)에 유니온으로
-- 떨어져야 PostCategory를 손으로 적지 않는다(api-and-db.md "스키마 타입은 손으로
-- 적지 않는다"). text+check면 string이 되어 그 규약이 깨진다.
-- ---------------------------------------------------------------------
create type public.post_category as enum ('이적설', '경기', '선수', '유니폼', '잡담');

comment on type public.post_category is
  '말머리. 값 추가는 alter type ... add value(같은 트랜잭션에서 그 값을 쓸 수 없다). '
  '추가하면 entities/post의 Record<PostCategory, ...> 맵이 컴파일 에러로 누락을 잡아준다';

alter table public.post add column category public.post_category;

-- ⚠ 이 UPDATE는 title/content를 건드리지 않으므로 post_touch_updated_at의 WHEN 절에
--   걸리지 않는다 → 백필 때문에 전체 글에 "수정됨"이 붙는 사고가 없다
--   (20260801000004의 like_count 백필과 같은 판단).
update public.post set category = '잡담' where category is null;

alter table public.post alter column category set not null;

-- ⚠ default를 두지 않는다. 두면 말머리를 빠뜨린 insert가 조용히 '잡담'이 되어
--   "말머리는 필수"라는 계약의 DB 대응물이 사라진다(zod는 UX이지 방어가 아니다).
comment on column public.post.category is
  '말머리. 클라이언트가 쓸 수 있는 유일한 신규 컬럼(글쓰기 폼 필수 항목). default 없음 — 누락은 23502로 거부';

-- ---------------------------------------------------------------------
-- 2. 조회수 (view_count)
-- ---------------------------------------------------------------------
alter table public.post
  add column view_count int not null default 0 check (view_count >= 0);

comment on column public.post.view_count is
  'increment_post_view RPC만 갱신한다(클라이언트에 update 권한 없음). '
  '⚠ 그 RPC가 anon에도 열려 있어 위조 가능한 **대략치**다 — 트리거가 단독 관리하는 like_count와 신뢰 수준이 다르다';

-- ---------------------------------------------------------------------
-- 3. 발췌 (excerpt) — 목록 페이로드 절감용 파생 컬럼
--
-- 목록 카드에 발췌 2행이 필요한데 content(최대 20000자) 30건을 통째로 보내면 최악 600KB다.
-- generated stored라 클라이언트 쓰기 경로가 아예 없다.
--
-- ⚠ 여기 담기는 것은 **마크다운 원문 프리픽스**다. 기호 제거·클램프는
--   entities/post/lib/plain-summary.ts가 한다(app/posts/[id]/page.tsx의 og:description과 같은 변환기).
--   기호를 걷어내면 짧아지므로 화면에 필요한 길이보다 넉넉히 잘라 둔다.
-- ⚠ stored generated 컬럼 추가는 **테이블 재작성**을 유발해 기존 인덱스가 전부 재구축된다
--   → 컬럼 추가를 전부 끝낸 뒤(여기) 인덱스를 만든다(5번).
-- ---------------------------------------------------------------------
alter table public.post
  add column excerpt text generated always as (left(content, 300)) stored not null;

comment on column public.post.excerpt is
  '목록 카드용 본문 프리픽스(마크다운 원문). generated라 클라이언트 쓰기 경로가 존재하지 않는다';

-- ---------------------------------------------------------------------
-- 4. 답글 (comment.parent_id) — 깊이 1까지만
--
-- ⚠ on delete cascade의 삭제는 RI 내부 트리거가 수행하므로 **RLS를 적용받지 않는다.**
--   즉 루트 댓글 작성자가 남이 단 답글까지 지우게 된다 — comment_delete_own("본인 것만")의
--   간접 우회로다. 포럼 관례로 수용하되, 화면의 삭제 확인 문구가 이 사실을 알려야 한다.
--   comment_count는 자식 행마다 after delete 트리거가 발화해 정확히 감소한다(확인함).
-- ---------------------------------------------------------------------
alter table public.comment
  add column parent_id bigint references public.comment (id) on delete cascade;

comment on column public.comment.parent_id is
  'null = 루트 댓글. 깊이 1까지만(check_comment_depth 트리거). comment_count는 답글도 포함한 총합이다';

-- ---------------------------------------------------------------------
-- 5. 인덱스
-- ---------------------------------------------------------------------

-- 기존 (created_at desc)는 목록의 `order created_at desc, id desc`와 정확히 맞지 않아
-- Incremental Sort가 붙는다. 결정적 tiebreak까지 인덱스에 담는다.
drop index public.post_alive_created_at_idx;
create index post_alive_created_idx
  on public.post (created_at desc, id desc) where deleted_at is null;

-- 말머리 필터 + 최신순. 선두가 category라 "전체" 탭(가장 흔한 화면)은 못 태우므로
-- 위 인덱스와 **둘 다** 필요하다.
create index post_alive_category_created_idx
  on public.post (category, created_at desc, id desc) where deleted_at is null;

-- ⚠ 인기순(like_count)·댓글순(comment_count) 인덱스는 **만들지 않는다.**
--   두 컬럼은 좋아요/댓글마다 트리거가 UPDATE하는 컬럼이라, 인덱스를 걸면 HOT update가
--   불가능해져 매 토글이 새 인덱스 엔트리를 만든다(concurrency.sh가 두들기는 경로다).
--   얻는 것은 limit 30 쿼리의 정렬 회피뿐 — 측정 없이 지불할 비용이 아니다.
--   필요해지면 (like_count desc, id desc) where deleted_at is null로 그때 추가한다.

-- 대부분의 행이 루트라 부분 인덱스로 충분하다. cascade의 where parent_id = $1도 이걸 탄다.
create index comment_parent_id_idx on public.comment (parent_id) where parent_id is not null;

-- ---------------------------------------------------------------------
-- 6. 컬럼 권한
--
-- ⚠ insert/update grant는 컬럼 단위라 **새 컬럼은 기본적으로 쓰기 불가**다.
--   view_count·excerpt에 아무것도 하지 않는 것이 곧 방어다.
-- ---------------------------------------------------------------------
grant insert (category)  on public.post    to authenticated;
grant update (category)  on public.post    to authenticated;
grant insert (parent_id) on public.comment to authenticated;

-- ---------------------------------------------------------------------
-- 7. 조회수 증가 RPC
--
-- ⚠ 이 함수는 이 시스템의 **최초 비로그인 쓰기 경로**다(rls.sql 섹션 11 "anon은 어디에도
--   쓸 수 없다"에 대한 의도된 예외). 조회는 비로그인이 대부분이라 authenticated 전용으로
--   두면 숫자가 의미를 잃는다. 대가로 curl 루프에 의한 부풀리기를 막을 수단이 없다 —
--   막으려면 (post_id, viewer_hash, viewed_on) 로그 테이블이 필요하고 이번 범위 밖이다.
--   그래서 view_count의 신뢰 수준을 컬럼 주석에 명시해 두었다.
--
-- 살아있는 글이 아니면 0행 UPDATE로 조용히 지나간다 — 조회수 증가 실패가 화면 에러가 되면 안 된다.
-- title/content를 건드리지 않으므로 post_touch_updated_at의 WHEN에도 걸리지 않는다
-- (= 조회가 "수정됨" 배지를 유발하지 않는다).
-- ---------------------------------------------------------------------
create or replace function public.increment_post_view(p_post_id bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.post
     set view_count = view_count + 1
   where id = p_post_id and deleted_at is null;
$$;

comment on function public.increment_post_view(bigint) is
  '상세 진입 시 1회 호출. anon에 열려 있다 — rls.sql 섹션 17d 화이트리스트에 포함되어 있다';

revoke execute on function public.increment_post_view(bigint) from public;
grant  execute on function public.increment_post_view(bigint) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 8. 답글 깊이 제한 — 정책이 아니라 트리거
--
-- ⚠ RLS의 with check에 두면 안 된다. WITH CHECK 안의 함수는 has_visible_char와 똑같이
--   **호출자 EXECUTE 권한으로 평가**되므로, 다른 함수들처럼 revoke하는 순간
--   모든 댓글 작성이 42501로 죽는다(이 프로젝트가 20260802000001에서 실측으로 겪은 함정).
--   게다가 정책 위반은 Postgres의 영어 42501뿐이라 "왜 거부됐는지"를 설명하지 못한다.
--   트리거는 P0001로 한국어 사유를 그대로 노출한다(toDbErrorMessage가 P0001을 통과시킨다).
--
-- ⚠ 경합 걱정 없음: parent_id는 update 권한도 정책도 없어 루트가 나중에 답글로 바뀌지 않고,
--   부모가 동시에 삭제되면 FK가 23503으로 막는다 → 검사와 삽입 사이의 TOCTOU가 없다.
--
-- 부모 글의 생존은 comment_insert_own의 post_is_alive(post_id)가 이미 담당한다(중복 검사 안 함).
-- ---------------------------------------------------------------------
create or replace function public.check_comment_depth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent_post_id   bigint;
  v_parent_parent_id bigint;
begin
  if new.parent_id is null then
    return new;
  end if;

  select post_id, parent_id
    into v_parent_post_id, v_parent_parent_id
    from public.comment
   where id = new.parent_id;

  if not found then
    raise exception '답글을 달 댓글을 찾을 수 없어요.' using errcode = 'P0001';
  end if;

  if v_parent_post_id <> new.post_id then
    raise exception '다른 글의 댓글에는 답글을 달 수 없어요.' using errcode = 'P0001';
  end if;

  if v_parent_parent_id is not null then
    raise exception '답글에는 다시 답글을 달 수 없어요.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger comment_depth_guard
  before insert on public.comment
  for each row execute function public.check_comment_depth();

-- ⚠ 이 revoke가 없으면 PUBLIC 기본 EXECUTE 때문에 rls.sql 섹션 17d(anon EXECUTE 전수 검사)가
--   실패한다. 트리거 발화는 EXECUTE 권한을 검사하지 않으므로 동작에는 영향이 없다
--   (sync_post_comment_count 등 트리거 함수 3종과 같은 처리).
revoke execute on function public.check_comment_depth() from public, anon, authenticated;
