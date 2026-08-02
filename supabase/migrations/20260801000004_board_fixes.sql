-- =====================================================================
-- 리뷰에서 나온 결함 수정
--
-- 1. 소프트 삭제 경계 — 삭제된 글의 댓글이 공개되고, 댓글을 더 달 수 있었다
-- 2. "수정됨" 오표시 — 좋아요·댓글만 받아도 updated_at이 갱신됐다
-- 3. 탈퇴 시 like_count 영구 드리프트 — 카운터 관리 주체가 RPC 하나뿐이었다
-- 4. email='' 이면 가입 전체가 실패했다
-- 5. 권한 위생 — revoke 나열이 TRUNCATE/REFERENCES를 남겼다
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 소프트 삭제 경계 — 댓글을 post 생존과 묶는다
--
-- post_select_alive는 글을 감췄지만 comment 정책에는 post와의 연결이 없어서
-- 삭제된 글의 post_id만 알면 스레드 전체를 비로그인도 읽을 수 있었다.
-- id가 연번이라 삭제된 글의 id는 목록의 구멍으로 바로 추정된다.
--
-- insert도 마찬가지로 막는다. toggle_post_like는 삭제된 글을 거부하는데
-- 댓글만 뚫려 있어 같은 리소스에 대해 삭제 판정이 불일치했다.
-- ---------------------------------------------------------------------
-- ⚠ 정책에 `exists (select 1 from post p where p.id = comment.post_id ...)`를 인라인으로 쓰면
--   플래너가 상관관계를 잃는다. RLS 술어는 security-barrier 서브쿼리 안으로 들어가
--   바깥의 `post_id = N` 등가류가 전파되지 않고 **`post_id IN (모든 살아있는 글)`로 비상관화**된다.
--   필요한 건 post 1건인데 살아있는 글 전체로 해시 테이블을 만든다.
--
--   실측(글 5만 건, 댓글 300건): 인라인 exists 4.761ms vs 아래 헬퍼 0.607ms — 8배 차이.
--   버퍼는 헬퍼가 더 쓰지만(912 vs 633) 해시 구축 CPU가 지배적이다.
--   결정적인 건 비용의 성격이다 — **헬퍼는 댓글 수에 묶여 상한이 있고(조회 limit 200),
--   인라인 exists는 글 수에 비례해 무한정 늘어난다.**
create or replace function public.post_is_alive(p_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.post p where p.id = p_id and p.deleted_at is null)
$$;

revoke execute on function public.post_is_alive(bigint) from public;
grant  execute on function public.post_is_alive(bigint) to anon, authenticated;

drop policy "comment_select_all" on public.comment;
create policy "comment_select_alive_post" on public.comment
  for select using (public.post_is_alive(post_id));

drop policy "comment_insert_own" on public.comment;
create policy "comment_insert_own" on public.comment
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.post_is_alive(post_id));

-- ---------------------------------------------------------------------
-- 2. "수정됨" 오표시 — 본문이 바뀔 때만 updated_at을 찍는다
--
-- post를 UPDATE하는 주체는 제목·본문 수정만이 아니다. toggle_post_like가
-- like_count를, 댓글 트리거가 comment_count를 UPDATE한다. 트리거가 무조건
-- 발화하던 탓에 **남이 좋아요만 눌러도 내 글에 "수정됨"이 붙었다.**
-- (created_at <> updated_at = 수정됨 이라는 계약을 스스로 깨고 있었다)
--
-- WHEN 절로 본문 변경에만 발화시킨다. deleted_at 변경(소프트 삭제)도 제외되어
-- "삭제 = 수정" 오분류가 함께 사라진다.
-- ---------------------------------------------------------------------
drop trigger post_touch_updated_at on public.post;
create trigger post_touch_updated_at
  before update on public.post
  for each row
  when (
    old.title is distinct from new.title
    or old.content is distinct from new.content
  )
  execute function public.touch_updated_at();

-- 다른 함수들과 달리 search_path가 비어 있었다 — 일관성을 맞춘다.
-- (security definer가 아니라 권한 상승은 불가했지만 규칙은 하나로 둔다)
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. like_count 관리를 트리거로 이관 — 탈퇴 드리프트를 막는다
--
-- comment_count는 트리거가 INSERT/DELETE를 모두 처리해 cascade에 안전했지만
-- like_count는 toggle_post_like RPC만 관리했다. 유저 탈퇴로
-- auth.users → profiles → post_like가 cascade 삭제되는 경로는 RPC를 거치지 않아
-- like_count가 실제 행 수보다 커진 채 영구히 남았다(check >= 0 때문에 항상 과대).
--
-- 카운터의 단일 소스를 트리거로 옮기고, RPC에서는 증감 UPDATE를 걷어낸다.
-- 그래야 "어느 경로로 행이 생기고 사라지든 카운터가 맞다"가 성립한다.
-- ---------------------------------------------------------------------
create or replace function public.sync_post_like_count()
returns trigger
language plpgsql
security definer  -- post의 카운터 컬럼은 일반 유저에게 UPDATE 권한이 없다
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.post set like_count = like_count + 1 where id = new.post_id;
    return new;
  end if;
  -- DELETE: 글이 함께 cascade 삭제되는 경우 대상 행이 없어 0행 update가 되며, 정상이다
  update public.post set like_count = like_count - 1 where id = old.post_id;
  return old;
end;
$$;

create trigger post_like_count_sync
  after insert or delete on public.post_like
  for each row execute function public.sync_post_like_count();

-- ⚠ 트리거는 **앞으로 생길** 드리프트만 막는다. 이미 어긋난 값은 그대로 남고,
--   like_count >= 0 CHECK 때문에 항상 과대 방향이라 자연 수렴도 없다 → 1회 재조정.
--   (title/content를 건드리지 않으므로 post_touch_updated_at의 WHEN에 걸리지 않는다 =
--    이 백필이 "수정됨" 배지를 유발하지 않는다)
update public.post p
   set like_count = coalesce(l.cnt, 0)
  from (select id from public.post) x
  left join (select post_id, count(*) cnt from public.post_like group by 1) l on l.post_id = x.id
 where p.id = x.id and p.like_count <> coalesce(l.cnt, 0);

-- RPC는 이제 "행 잠금 + 존재 검증 + 토글"만 한다. 카운터는 위 트리거가 맡는다.
create or replace function public.toggle_post_like(p_post_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다' using errcode = 'P0001';
  end if;

  -- 게시글 행을 잠근다 — 동시 토글을 직렬화하고 존재·생존 여부를 함께 검증
  perform 1 from public.post
   where id = p_post_id and deleted_at is null
     for update;
  if not found then
    raise exception '존재하지 않는 게시글입니다' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.post_like
     where post_id = p_post_id and user_id = v_user_id
  ) then
    insert into public.post_like (post_id, user_id) values (p_post_id, v_user_id);
    return true;   -- 좋아요 켜짐 (like_count는 트리거가 +1)
  else
    delete from public.post_like where post_id = p_post_id and user_id = v_user_id;
    return false;  -- 좋아요 꺼짐 (like_count는 트리거가 -1)
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. email이 빈 문자열이면 가입 전체가 실패했다
--
-- coalesce는 NULL만 막고 ''는 통과시킨다 → nickname '' → CHECK 위반 →
-- 트리거에 폴백이 없어 auth.users INSERT 트랜잭션이 통째로 롤백된다.
-- 현재 GoTrue는 email 없는 유저에 NULL을 쓰므로 잠복 상태였지만,
-- 이메일을 주지 않는 프로바이더 하나면 가입 기능이 죽는다.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_nickname text;
begin
  -- nullif로 빈 문자열까지 흡수하고, 잘라낸 결과가 비어도 'user'로 떨어지게 한다
  v_nickname := left(split_part(coalesce(nullif(new.email, ''), 'user'), '@', 1), 20);
  if v_nickname is null or btrim(v_nickname) = '' then
    v_nickname := 'user';
  end if;

  insert into public.profiles (id, nickname) values (new.id, v_nickname);
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. 권한 위생
-- ---------------------------------------------------------------------

-- revoke를 나열하면 Supabase 기본 ALL 중 TRUNCATE·REFERENCES·TRIGGER가 남는다.
-- 그리고 TRUNCATE는 RLS를 적용받지 않는다(현재 PostgREST에 TRUNCATE 동사가 없어
-- 악용 경로는 없지만, 유일한 방어선이 권한 계층인 구조에서 나열은 위험한 습관이다).
revoke all on public.post      from anon, authenticated;
revoke all on public.comment   from anon, authenticated;
revoke all on public.post_like from anon, authenticated;
revoke all on public.profiles  from anon, authenticated;

grant select on public.post      to anon, authenticated;
grant select on public.comment   to anon, authenticated;
grant select on public.post_like to anon, authenticated;
grant select on public.profiles  to anon, authenticated;

grant insert (author_id, title, content)  on public.post    to authenticated;
grant update (title, content)             on public.post    to authenticated;
grant insert (post_id, user_id, content)  on public.comment to authenticated;
grant delete                              on public.comment to authenticated;
grant update (nickname)                   on public.profiles to authenticated;

-- 트리거 함수도 EXECUTE가 PUBLIC에 남아 있었다. 반환형이 trigger라 직접 호출은
-- 불가능하지만(확인함) RPC 2개와 규칙을 맞춘다.
revoke execute on function public.handle_new_user()          from public, anon, authenticated;
revoke execute on function public.sync_post_comment_count()  from public, anon, authenticated;
revoke execute on function public.sync_post_like_count()     from public, anon, authenticated;
revoke execute on function public.touch_updated_at()         from public, anon, authenticated;

-- identity 시퀀스는 테이블 revoke에 딸려오지 않아 anon/authenticated에 rwU가 남는다.
-- 현재 악용 경로는 없지만(PostgREST로 nextval 호출 불가, identity INSERT는 시퀀스 권한을
-- 검사하지 않는다) "필요한 것만 준다"는 이 파일의 취지를 시퀀스에도 적용한다.
revoke all on all sequences in schema public from anon, authenticated;

-- ---------------------------------------------------------------------
-- 공백만 있는 제목·본문이 char_length 검사를 통과해 빈 글이 만들어질 수 있었다.
--
-- ⚠ btrim(x)의 1인자 형태는 **스페이스(U+0020) 하나만** 깎는다. 줄바꿈·탭·NBSP·전각공백은
--   그대로 남아 통과한다(실측). 반면 클라이언트의 JS .trim()은 유니코드 공백을 전부 깎으므로,
--   btrim만 쓰면 **DB 검증이 클라이언트보다 약해져** "우회해도 DB가 막는다"가 거짓이 된다.
--   → "비공백 문자가 최소 하나"를 요구한다.
--
-- ⚠ 제약을 걸기 전에 기존 위반 행을 먼저 정리한다. 안 그러면 이 마이그레이션이
--   (정확히 이 버그로 만들어진 행 때문에) 검증 실패로 멈춘다.
-- ---------------------------------------------------------------------
delete from public.comment where content !~ '[^[:space:]]';
delete from public.post    where title !~ '[^[:space:]]' or content !~ '[^[:space:]]';

alter table public.post
  add constraint post_title_not_blank   check (title   ~ '[^[:space:]]'),
  add constraint post_content_not_blank check (content ~ '[^[:space:]]');
alter table public.comment
  add constraint comment_content_not_blank check (content ~ '[^[:space:]]');
