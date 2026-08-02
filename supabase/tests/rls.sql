-- =====================================================================
-- RLS · 컬럼 권한 · RPC 검증 (수동 실행)
--
--   psql "postgresql://postgres:postgres@127.0.0.1:64322/postgres" \
--     -f supabase/tests/rls.sql
--
-- 전제: alice@test.com / bob@test.com 두 계정이 가입되어 있을 것.
--   bash supabase/tests/seed-users.sh
--
-- 클라이언트가 supabase를 직접 호출하는 구조라 RLS가 유일한 방어선이다.
-- 정책을 고칠 때마다 이 스크립트를 다시 돌린다.
--
-- ⚠ 실패를 기대하는 검사마다 savepoint를 쓴다 — psql은 에러가 나면 트랜잭션을
--   abort시켜서, savepoint 없이 이어 붙이면 뒤쪽 검사가 전부 무의미해진다.
-- =====================================================================
\set ON_ERROR_STOP off
\pset pager off
\set QUIET on

select id as alice from auth.users where email = 'alice@test.com' \gset
select id as bob   from auth.users where email = 'bob@test.com'   \gset

-- alice 세션을 여는 헬퍼 대용 (psql에 함수가 없으므로 매번 두 줄을 반복한다)
\set login_alice 'select set_config(''request.jwt.claims'', json_build_object(''sub'', ''':alice''', ''role'', ''authenticated'')::text, true); set local role authenticated;'
\set login_bob   'select set_config(''request.jwt.claims'', json_build_object(''sub'', ''':bob''',   ''role'', ''authenticated'')::text, true); set local role authenticated;'
\set login_anon  'set local role anon;'
\set QUIET off

begin;

-- ⚠ 시드 INSERT는 반드시 begin 아래에 둔다.
--   전에는 위에 있어서 오토커밋으로 새어나갔고, 실행할 때마다 게시글이 2건씩
--   DB에 쌓였다("전체 rollback — 흔적을 남기지 않는다"는 말미 주석이 거짓이었다).
-- ⚠ created_at·updated_at을 과거로 밀어 둔다.
--   now()는 **트랜잭션 시작 시각**이라 한 트랜잭션 안에서는 insert의 default now()와
--   트리거의 now()가 같은 값이 된다. 기본값으로 시드하면 "본문을 고치면 updated_at이
--   바뀐다"를 이 스크립트 안에서 증명할 수 없다(실제 앱은 요청마다 트랜잭션이 달라 정상).
insert into public.post (author_id, title, content, created_at, updated_at)
values (:'alice', 'alice의 글', '본문', now() - interval '1 hour', now() - interval '1 hour')
returning id as pid \gset
insert into public.post (author_id, title, content, created_at, updated_at)
values (:'bob', 'bob의 글', '본문', now() - interval '1 hour', now() - interval '1 hour')
returning id as bpid \gset

-- ---------------------------------------------------------------------
\echo ''
\echo '=== 1. post 쓰기 권한 (alice) ==='
savepoint s; :login_alice
\echo '[성공] 본인 명의 insert'
insert into public.post (author_id, title, content) values (:'alice', '새 글', '본문');
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 남(bob) 명의 insert'
insert into public.post (author_id, title, content) values (:'bob', '위조', 'x');
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] like_count 조작 (컬럼 권한 없음)'
update public.post set like_count = 9999 where id = :pid;
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] updated_at 직접 지정 (컬럼 권한 없음)'
update public.post set updated_at = now() where id = :pid;
rollback to s;

savepoint s; :login_alice
-- 컬럼 권한이 먼저 막는다. 설령 권한을 줬더라도 새 행이 post_select_alive를
-- 통과하지 못해 RLS가 다시 막는다(2중) — 그래서 소프트 삭제는 RPC로만 가능하다.
\echo '[❌차단] deleted_at 직접 UPDATE'
update public.post set deleted_at = now() where id = :pid;
rollback to s;

savepoint s; :login_alice
\echo '[성공] 본인 글 제목 수정'
update public.post set title = '수정됨' where id = :pid;
rollback to s;

savepoint s; :login_alice
\echo '[UPDATE 0 기대] 남의 글 수정 — 에러가 아니라 조용히 무시된다'
update public.post set title = '탈취' where id = :bpid;
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] post hard delete (DELETE 정책 없음)'
delete from public.post where id = :pid;
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] post_like 직접 insert'
insert into public.post_like (post_id, user_id) values (:pid, :'alice');
rollback to s;

-- ---------------------------------------------------------------------
\echo ''
\echo '=== 2. updated_at 트리거 — 수정하면 서버가 찍는다 ==='
savepoint s; :login_alice
update public.post set content = '본문 v2' where id = :pid;
reset role;
\echo '[t 기대] updated_at > created_at'
select updated_at > created_at as touched from public.post where id = :pid;
rollback to s;

-- ---------------------------------------------------------------------
\echo ''
\echo '=== 3. soft_delete_post RPC ==='
savepoint s; :login_anon
\echo '[❌차단] 비로그인은 함수를 못 부른다'
select public.soft_delete_post(:pid);
rollback to s;

savepoint s; :login_bob
\echo '[❌차단] 남의 글 삭제 → 침묵하지 않고 예외를 던진다'
select public.soft_delete_post(:pid);
rollback to s;

savepoint s; :login_alice
\echo '[성공] 본인 글 소프트 삭제'
select public.soft_delete_post(:pid);
\echo '[0 기대] 본인에게도 안 보인다'
select count(*) as visible from public.post where id = :pid;
reset role;
\echo '[1 기대] 행 자체는 DB에 남아 있다'
select count(*) as row_exists from public.post where id = :pid;
rollback to s;

savepoint s; :login_alice
select public.soft_delete_post(:pid);
\echo '[❌차단] 이미 삭제된 글 재삭제'
select public.soft_delete_post(:pid);
rollback to s;

-- ---------------------------------------------------------------------
\echo ''
\echo '=== 4. toggle_post_like ==='
savepoint s; :login_anon
\echo '[❌차단] 비로그인'
select public.toggle_post_like(:pid);
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 노션 원문 시그니처(2인자)는 아예 존재하지 않는다'
select public.toggle_post_like(:pid, :'bob');
rollback to s;

savepoint s; :login_alice
\echo '[t 기대] 첫 호출 = 좋아요 켜짐'
select public.toggle_post_like(:pid) as turned_on;
reset role;
\echo '[t / 1 기대] post_like에 찍힌 user_id가 alice인지 + like_count'
select l.user_id = :'alice' as is_alice, p.like_count
  from public.post p join public.post_like l on l.post_id = p.id
 where p.id = :pid;

:login_alice
\echo '[f 기대] 두 번째 호출 = 좋아요 꺼짐'
select public.toggle_post_like(:pid) as turned_off;
reset role;
\echo '[0 / 0 기대] 행 삭제 + 카운터 복귀'
select (select count(*) from public.post_like where post_id = :pid) as likes,
       (select like_count from public.post where id = :pid) as like_count;
rollback to s;

savepoint s; :login_alice
select public.soft_delete_post(:pid);
\echo '[❌차단] 삭제된 글에는 좋아요를 누를 수 없다'
select public.toggle_post_like(:pid);
rollback to s;

-- ---------------------------------------------------------------------
\echo ''
\echo '=== 5. comment_count 트리거 — 남의 글에 달아도 증가한다 ==='
\echo '    (트리거가 security definer가 아니면 post_update_own에 걸려 0행으로 조용히 실패)'
savepoint s; :login_alice
\echo '[성공] alice가 bob의 글에 댓글 2개'
insert into public.comment (post_id, user_id, content) values (:bpid, :'alice', '댓글1');
insert into public.comment (post_id, user_id, content) values (:bpid, :'alice', '댓글2');
reset role;
\echo '[2 기대] comment_count'
select comment_count from public.post where id = :bpid;

:login_alice
\echo '[성공] 본인 댓글 삭제'
delete from public.comment where post_id = :bpid and user_id = :'alice' and content = '댓글1';
reset role;
\echo '[1 기대] comment_count 감소'
select comment_count from public.post where id = :bpid;
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 남(bob) 명의로 댓글 위조'
insert into public.comment (post_id, user_id, content) values (:bpid, :'bob', '위조');
rollback to s;

savepoint s;
insert into public.comment (post_id, user_id, content) values (:bpid, :'bob', 'bob 댓글');
:login_alice
\echo '[DELETE 0 기대] 남의 댓글 삭제 — 조용히 무시'
delete from public.comment where post_id = :bpid and user_id = :'bob';
rollback to s;

-- ---------------------------------------------------------------------
-- 아래는 전부 리뷰에서 실제로 터졌던 결함들의 회귀 검사다.
-- ---------------------------------------------------------------------
\echo ''
\echo '=== 6. 회귀: 소프트 삭제된 글의 댓글은 아무에게도 안 보이고, 더 달 수도 없다 ==='
savepoint s;
insert into public.comment (post_id, user_id, content) values (:pid, :'bob', '삭제 전 댓글');
:login_alice
select public.soft_delete_post(:pid);
reset role;

:login_anon
\echo '[0 기대] 비로그인이 삭제된 글의 댓글을 읽는가'
select count(*) as anon_visible from public.comment where post_id = :pid;
reset role;

:login_bob
\echo '[0 기대] 로그인 유저가 삭제된 글의 댓글을 읽는가'
select count(*) as user_visible from public.comment where post_id = :pid;
\echo '[❌차단] 삭제된 글에 댓글 추가'
insert into public.comment (post_id, user_id, content) values (:pid, :'bob', '삭제 후 댓글');
rollback to s;

\echo ''
\echo '=== 7. 회귀: 좋아요·댓글은 "수정됨"을 유발하지 않는다 ==='
savepoint s;
:login_bob
select public.toggle_post_like(:pid);
insert into public.comment (post_id, user_id, content) values (:pid, :'bob', '댓글');
reset role;
\echo '[f 기대] 좋아요·댓글 후 edited (t면 남이 내 글에 "수정됨"을 붙일 수 있다는 뜻)'
select updated_at <> created_at as edited from public.post where id = :pid;
:login_alice
update public.post set title = '진짜 수정' where id = :pid;
reset role;
\echo '[t 기대] 본문을 실제로 고쳤을 때만 edited'
select updated_at <> created_at as edited from public.post where id = :pid;
rollback to s;

\echo ''
\echo '=== 8. 회귀: 유저 탈퇴(cascade)에도 카운터가 어긋나지 않는다 ==='
\echo '    (like_count를 RPC만 관리하면 cascade 삭제 경로에서 과대 드리프트가 남는다)'
savepoint s;
:login_bob
select public.toggle_post_like(:pid);
insert into public.comment (post_id, user_id, content) values (:pid, :'bob', 'bob 댓글');
reset role;
\echo '[1 / 1 기대] 탈퇴 전'
select like_count, comment_count from public.post where id = :pid;
delete from auth.users where id = :'bob';
\echo '[0 / 0 기대] 탈퇴 후'
select like_count, comment_count from public.post where id = :pid;
rollback to s;

\echo ''
\echo '=== 9. 회귀: 공백만 있는 제목·본문·댓글은 거부된다 ==='
savepoint s; :login_alice
\echo '[❌차단] 제목이 공백뿐'
insert into public.post (author_id, title, content) values (:'alice', '     ', '본문');
rollback to s;
savepoint s; :login_alice
\echo '[❌차단] 댓글이 공백뿐'
insert into public.comment (post_id, user_id, content) values (:bpid, :'alice', '   ');
rollback to s;

\echo ''
\echo '=== 10. 회귀: email이 빈 문자열이어도 가입이 죽지 않는다 ==='
savepoint s;
-- ⚠ 데이터 수정 CTE의 결과는 같은 문장의 다른 부분에서 보이지 않는다(스냅샷 규칙) →
--   트리거가 만든 profiles 행을 보려면 문장을 나눠야 한다. 그래서 uuid를 고정한다.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('00000000-0000-0000-0000-0000000000ff', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', '', 'x', now(), now());
\echo '[user 기대] nickname (여기서 에러가 나면 빈 이메일이 가입 전체를 죽인다는 뜻)'
select nickname from public.profiles where id = '00000000-0000-0000-0000-0000000000ff';
rollback to s;

\echo ''
\echo '=== 10-b. 회귀: 이메일 로컬파트에 공백이 있어도 가입이 죽지 않는다 ==='
\echo '    (handle_new_user가 만든 값이 profiles_nickname_trimmed를 위반하면 트랜잭션 전체가 롤백된다.'
\echo '     지금은 GoTrue가 그런 주소를 400으로 막지만, 방어선이 그것 하나뿐이면 안 된다)'
savepoint s;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('00000000-0000-0000-0000-0000000000fd', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', '  spaced  @test.com', 'x', now(), now());
\echo '[spaced 기대] 앞뒤 공백이 깎인 닉네임'
select nickname from public.profiles where id = '00000000-0000-0000-0000-0000000000fd';
rollback to s;

savepoint s;
-- 16자 컷 경계에서 끝에 공백이 남는 경우 (left() 이후에도 다듬는지)
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('00000000-0000-0000-0000-0000000000fc', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'ab cdefghijklmno p@test.com', 'x', now(), now());
\echo '[끝에 공백이 없어야 한다]'
select nickname, nickname = btrim(nickname) as trimmed from public.profiles
 where id = '00000000-0000-0000-0000-0000000000fc';
rollback to s;

\echo ''
\echo '=== 11. anon은 어디에도 쓸 수 없다 ==='
\echo '    (revoke all → grant select 구조라 다음 마이그레이션에서 grant 한 줄 잘못 쓰면 조용히 뚫린다)'
-- ⚠ \echo는 **줄 전체**를 인자로 먹는다. SQL을 같은 줄에 붙이면 실행되지 않고
--   문자열로 출력만 된다(검사인 척하는 검사가 된다). 반드시 줄을 나눈다.
savepoint s; :login_anon
\echo '[❌차단] post insert'
insert into public.post (author_id, title, content) values (:'alice','x','y');
rollback to s;
savepoint s; :login_anon
\echo '[❌차단] post update'
update public.post set title = 'x' where id = :pid;
rollback to s;
savepoint s; :login_anon
\echo '[❌차단] comment insert'
insert into public.comment (post_id, user_id, content) values (:pid, :'alice', 'x');
rollback to s;
savepoint s; :login_anon
\echo '[❌차단] comment delete'
delete from public.comment where post_id = :pid;
rollback to s;
savepoint s; :login_anon
\echo '[❌차단] post_like insert'
insert into public.post_like (post_id, user_id) values (:pid, :'alice');
rollback to s;
savepoint s; :login_anon
\echo '[❌차단] profiles update'
update public.profiles set nickname = 'x' where id = :'alice';
rollback to s;

\echo ''
\echo '=== 12. profiles — 닉네임은 가입 트리거가 정한 값으로 고정된다 ==='
savepoint s; :login_alice
\echo '[❌차단] 본인 닉네임 변경 (편집 UI가 없어 권한을 회수했다)'
update public.profiles set nickname = 'alice-new' where id = :'alice';
rollback to s;
savepoint s; :login_alice
\echo '[❌차단] 남의 닉네임 변경'
update public.profiles set nickname = 'stolen' where id = :'bob';
rollback to s;
savepoint s; :login_alice
\echo '[❌차단] profiles 직접 insert (가입 트리거 전용)'
insert into public.profiles (id, nickname) values (gen_random_uuid(), 'ghost');
rollback to s;
savepoint s; :login_alice
\echo '[❌차단] profiles 직접 delete (cascade 전용)'
delete from public.profiles where id = :'bob';
rollback to s;

\echo ''
\echo '=== 13. 회귀: 닉네임 유일성 (대소문자 무시 + 공백 우회 차단) ==='
savepoint s;
\echo '[❌차단] 대소문자만 다른 중복'
update public.profiles set nickname = 'ALICE' where id = :'bob';
rollback to s;
savepoint s;
\echo '[❌차단] 선행 공백으로 유일성 우회 (화면상 구분되지 않는다)'
update public.profiles set nickname = ' alice' where id = :'bob';
rollback to s;
savepoint s;
\echo '[alice-2 기대] 같은 로컬파트로 가입하면 접미사가 붙는다'
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('00000000-0000-0000-0000-0000000000fe', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'alice@other.com', 'x', now(), now());
select nickname from public.profiles where id = '00000000-0000-0000-0000-0000000000fe';
rollback to s;

\echo ''
\echo '=== 14. 회귀: 소프트 삭제된 글은 수정도 막힌다 ==='
\echo '    (post_update_own에 deleted_at 조건이 없다 — Postgres의 SELECT 정책 전파에 기대는 방어라 검사가 필요)'
savepoint s; :login_alice
select public.soft_delete_post(:pid);
\echo '[UPDATE 0 기대] 삭제된 내 글 수정'
update public.post set title = '되살리기' where id = :pid;
rollback to s;

\echo ''
\echo '=== 15. 회귀: 공백만 있는 본문 (btrim이 아니라 비공백 문자 요구) ==='
savepoint s; :login_alice
\echo '[❌차단] 본문이 공백뿐'
insert into public.post (author_id, title, content) values (:'alice', '제목', '   ');
rollback to s;
savepoint s; :login_alice
\echo '[❌차단] 제목이 줄바꿈뿐'
insert into public.post (author_id, title, content) values (:'alice', E'\n\n', '본문');
rollback to s;
savepoint s; :login_alice
\echo '[❌차단] 댓글이 전각공백뿐'
insert into public.comment (post_id, user_id, content) values (:bpid, :'alice', U&'\3000');
rollback to s;
savepoint s; :login_alice
\echo '[성공] 앞뒤 공백이 있는 정상 제목은 통과해야 한다'
insert into public.post (author_id, title, content) values (:'alice', '  정상 제목  ', '본문');
rollback to s;

-- ---------------------------------------------------------------------
\echo ''
\echo '=== 16. 카운터 정합성 — 0행이어야 정상 ==='
reset role;
select p.id, p.like_count, coalesce(l.cnt,0) as actual_likes,
       p.comment_count, coalesce(c.cnt,0) as actual_comments
  from public.post p
  left join (select post_id, count(*) cnt from public.post_like group by 1) l on l.post_id = p.id
  left join (select post_id, count(*) cnt from public.comment   group by 1) c on c.post_id = p.id
 where p.like_count <> coalesce(l.cnt,0) or p.comment_count <> coalesce(c.cnt,0);

rollback;
\echo ''
\echo '=== 끝 (전체 rollback — DB에 흔적을 남기지 않는다) ==='
