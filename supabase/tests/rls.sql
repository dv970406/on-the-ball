-- =====================================================================
-- RLS · 컬럼 권한 · RPC 검증 (수동 실행)
--
--   psql "postgresql://postgres:postgres@127.0.0.1:64322/postgres" \
--     -f supabase/tests/rls.sql
--
-- 전제: alice@test.com / bob@test.com 두 계정이 가입되어 있을 것.
--   `supabase db reset`이 supabase/seed.sql로 자동 생성한다.
--   실행은 supabase/tests/run-rls.sh 를 쓴다(결과를 양방향으로 대조해 준다).
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
insert into public.post (author_id, title, content, created_at, updated_at, category)
values (:'alice', 'alice의 글', '본문', now() - interval '1 hour', now() - interval '1 hour', '잡담')
returning id as pid \gset
insert into public.post (author_id, title, content, created_at, updated_at, category)
values (:'bob', 'bob의 글', '본문', now() - interval '1 hour', now() - interval '1 hour', '잡담')
returning id as bpid \gset

-- ---------------------------------------------------------------------
\echo ''
\echo '=== 1. post 쓰기 권한 (alice) ==='
savepoint s; :login_alice
\echo '[성공] 본인 명의 insert'
insert into public.post (author_id, title, content, category) values (:'alice', '새 글', '본문', '잡담');
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 남(bob) 명의 insert'
insert into public.post (author_id, title, content, category) values (:'bob', '위조', 'x', '잡담');
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
insert into public.post (author_id, title, content, category) values (:'alice', '     ', '본문', '잡담');
rollback to s;
savepoint s; :login_alice
\echo '[❌차단] 댓글이 공백뿐'
insert into public.comment (post_id, user_id, content) values (:bpid, :'alice', '   ');
rollback to s;

\echo ''
\echo '=== 10. 회귀: 이메일이 어떤 형태든 가입이 죽지 않는다 ==='
\echo '    닉네임은 이제 이메일에서 파생되지 않지만(랜덤 배정 — 섹션 23), 그렇다고'
\echo '    이 검사가 무의미해지지 않는다: handle_new_user가 만든 값이 profiles의 어떤'
\echo '    제약이든 위반하면 auth.users insert까지 통째로 롤백되어 **가입 자체가 실패**한다.'
savepoint s;
-- ⚠ 데이터 수정 CTE의 결과는 같은 문장의 다른 부분에서 보이지 않는다(스냅샷 규칙) →
--   트리거가 만든 profiles 행을 보려면 문장을 나눠야 한다. 그래서 uuid를 고정한다.
\echo '[0행 기대] 빈 이메일·공백 로컬파트·아주 긴 로컬파트·NULL 전부 닉네임이 붙는다'
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('00000000-0000-0000-0000-0000000000ff', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', '', 'x', now(), now()),
       ('00000000-0000-0000-0000-0000000000fd', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', '  spaced  @test.com', 'x', now(), now()),
       ('00000000-0000-0000-0000-0000000000fc', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'ab cdefghijklmno p@test.com', 'x', now(), now()),
       ('00000000-0000-0000-0000-0000000000fb', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', null, 'x', now(), now());
select u.id, p.nickname
  from auth.users u left join public.profiles p on p.id = u.id
 where u.id in ('00000000-0000-0000-0000-0000000000ff','00000000-0000-0000-0000-0000000000fd',
                '00000000-0000-0000-0000-0000000000fc','00000000-0000-0000-0000-0000000000fb')
   and (p.nickname is null                                   -- 프로필이 안 생겼다
        or p.nickname <> public.normalize_nickname(p.nickname)); -- 정규형이 아니다
rollback to s;

\echo '=== 11. anon은 어디에도 쓸 수 없다 ==='
\echo '    (revoke all → grant select 구조라 다음 마이그레이션에서 grant 한 줄 잘못 쓰면 조용히 뚫린다)'
-- ⚠ \echo는 **줄 전체**를 인자로 먹는다. SQL을 같은 줄에 붙이면 실행되지 않고
--   문자열로 출력만 된다(검사인 척하는 검사가 된다). 반드시 줄을 나눈다.
savepoint s; :login_anon
\echo '[❌차단] post insert'
insert into public.post (author_id, title, content, category) values (:'alice','x','y', '잡담');
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
\echo '=== 12. profiles — 행 자체는 가입/탈퇴 트리거만 만들고 지운다 ==='
\echo '    ⚠ 이 섹션은 한때 "닉네임 변경 차단"을 검사했다(편집 UI가 없어 20260801000006이'
\echo '      UPDATE 권한을 회수했던 시절). 20260809000001이 편집 UI와 함께 권한을 되살려'
\echo '      그 검사는 거짓이 됐다 — 실행하면 UPDATE 1로 통과하는데도 "차단됨"으로 보였다.'
\echo '      수정 권한 검사는 섹션 24가 갖는다. 여기는 insert/delete만 본다.'
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
\echo '[t 기대] 같은 로컬파트로 가입해도 닉네임이 이메일과 무관하다'
\echo '        (전에는 alice-2가 붙었다 — 이제 배정은 랜덤이라 로컬파트가 새어나가지 않는다)'
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('00000000-0000-0000-0000-0000000000fe', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'alice@other.com', 'x', now(), now());
select nickname not like 'alice%' as email_not_leaked
  from public.profiles where id = '00000000-0000-0000-0000-0000000000fe';
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
insert into public.post (author_id, title, content, category) values (:'alice', '제목', '   ', '잡담');
rollback to s;
savepoint s; :login_alice
\echo '[❌차단] 제목이 줄바꿈뿐'
insert into public.post (author_id, title, content, category) values (:'alice', E'\n\n', '본문', '잡담');
rollback to s;
savepoint s; :login_alice
\echo '[❌차단] 댓글이 전각공백뿐'
insert into public.comment (post_id, user_id, content) values (:bpid, :'alice', U&'\3000');
rollback to s;
savepoint s; :login_alice
\echo '[성공] 앞뒤 공백이 있는 정상 제목은 통과해야 한다'
insert into public.post (author_id, title, content, category) values (:'alice', '  정상 제목  ', '본문', '잡담');
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

-- ---------------------------------------------------------------------
\echo ''
\echo '=== 17. 신규 객체 전수 가드 — 0행이어야 정상 ==='
\echo '  (테이블명을 하드코딩한 검사들과 달리, 앞으로 만들 테이블·함수까지 자동으로 걸린다.'
\echo '   public 스키마의 기본 권한이 anon/authenticated에 ALL이라, 새 마이그레이션이'
\echo '   revoke를 한 번만 잊어도 즉시 구멍이 된다 — 손으로 반복하는 규칙은 언젠가 빠진다)'
reset role;

\echo '-- 17a. RLS가 꺼졌거나 anon/authenticated에 쓰기 권한이 남은 테이블'
select c.relname,
       c.relrowsecurity                                   as rls_on,
       has_table_privilege('anon', c.oid, 'INSERT')       as anon_insert,
       has_table_privilege('anon', c.oid, 'UPDATE')       as anon_update,
       has_table_privilege('anon', c.oid, 'DELETE')       as anon_delete,
       has_table_privilege('anon', c.oid, 'TRUNCATE')     as anon_truncate,
       has_table_privilege('authenticated', c.oid, 'TRUNCATE') as auth_truncate
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
   and (not c.relrowsecurity
        or has_table_privilege('anon', c.oid, 'INSERT')
        or has_table_privilege('anon', c.oid, 'UPDATE')
        or has_table_privilege('anon', c.oid, 'DELETE')
        or has_table_privilege('anon', c.oid, 'TRUNCATE')
        or has_table_privilege('authenticated', c.oid, 'TRUNCATE'));

\echo '-- 17b. RLS는 켜졌는데 정책이 하나도 없는 테이블 (전면 차단이 의도인지 확인 필요)'
select c.relname
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
   and not exists (select 1 from pg_policy p where p.polrelid = c.oid);

\echo '-- 17c. security definer인데 search_path가 고정되지 않은 함수'
select p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prosecdef
   and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
                    where cfg like 'search\_path=%');

\echo '-- 17d. anon이 EXECUTE 가능한 함수 중 화이트리스트 밖'
\echo '   허용: post_is_alive(글 생존 판정) / has_visible_char·normalize_nickname(CHECK 평가에 필요)'
\echo '        increment_post_view(조회수 — 이 시스템의 유일한 비로그인 쓰기 경로, 의도된 예외.'
\echo '        조회는 비로그인이 대부분이라 authenticated 전용이면 숫자가 의미를 잃는다.'
\echo '        대가로 부풀리기를 막을 수 없어 view_count는 "대략치"로 취급한다 — 컬럼 주석 참고)'
select p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and has_function_privilege('anon', p.oid, 'EXECUTE')
   and p.proname not in ('post_is_alive', 'has_visible_char', 'normalize_nickname', 'increment_post_view');

-- ---------------------------------------------------------------------
\echo ''
\echo '=== 18. INSERT 시점 위조 — 컬럼 INSERT 권한이 막아야 한다 ==='
\echo '  (섹션 1은 UPDATE만 검사했다. grant insert 목록이 넓어지는 회귀는 여기서 잡는다)'
savepoint s; :login_alice
\echo '[거부 기대] like_count를 실어 태어날 때부터 부풀린 글'
insert into public.post (author_id, title, content, like_count, category) values (:'alice', 'x', 'y', 9999, '잡담');
rollback to s;

savepoint s; :login_alice
\echo '[거부 기대] deleted_at을 실어 태어날 때부터 숨은 글'
insert into public.post (author_id, title, content, deleted_at, category) values (:'alice', 'x', 'y', now(), '잡담');
rollback to s;

savepoint s; :login_alice
\echo '[거부 기대] created_at을 미래로 실어 목록 상단 고정'
insert into public.post (author_id, title, content, created_at, category)
values (:'alice', 'x', 'y', now() + interval '10 years', '잡담');
rollback to s;

savepoint s; :login_alice
\echo '[거부 기대] id 직접 지정 (identity GENERATED ALWAYS)'
insert into public.post (id, author_id, title, content, category) values (999999, :'alice', 'x', 'y', '잡담');
rollback to s;

-- ---------------------------------------------------------------------
\echo ''
\echo '=== 19. 보이지 않는 글 차단 (has_visible_char) ==='
savepoint s; :login_alice
\echo '[거부 기대] 제목이 BOM(U+FEFF) 한 글자'
insert into public.post (author_id, title, content, category) values (:'alice', U&'\FEFF', '본문', '잡담');
rollback to s;

savepoint s; :login_alice
\echo '[거부 기대] 본문이 제로폭 공백(U+200B)뿐'
insert into public.post (author_id, title, content, category) values (:'alice', '제목', U&'\200B\200B', '잡담');
rollback to s;

savepoint s; :login_alice
\echo '[거부 기대] 제목이 NBSP(U+00A0) 한 글자'
\echo '   ⚠ 이 검사가 핵심이다 — [:space:]는 collation에 따라 NBSP를 공백으로 보지 않아,'
\echo '     그걸 쓰면 libc 로캘 DB에서만 조용히 통과한다(로컬에서는 재현되지 않는다)'
insert into public.post (author_id, title, content, category) values (:'alice', U&'\00A0', '본문', '잡담');
rollback to s;

savepoint s; :login_alice
\echo '[거부 기대] 제목이 전각 공백(U+3000)뿐'
insert into public.post (author_id, title, content, category) values (:'alice', U&'\3000\3000', '본문', '잡담');
rollback to s;

savepoint s; :login_alice
\echo '[거부 기대] 제목이 NEL(U+0085)뿐'
insert into public.post (author_id, title, content, category) values (:'alice', U&'\0085', '본문', '잡담');
rollback to s;

savepoint s; :login_alice
\echo '[성공] 제로폭 문자가 섞여도 보이는 글자가 있으면 통과'
insert into public.post (author_id, title, content, category) values (:'alice', U&'\200B' || '제목', '본문', '잡담');
rollback to s;

\echo '-- 19b. collation 비의존 확인 — 세 열이 전부 f여야 정상'
reset role;
select public.has_visible_char(U&'\00A0')                       as nbsp_default,
       public.has_visible_char(U&'\00A0' collate "C")           as nbsp_c,
       public.has_visible_char(U&'\00A0' collate "en_US.utf8")  as nbsp_libc;

-- ---------------------------------------------------------------------
\echo ''
\echo '=== 20. 말머리(category) ==='
savepoint s; :login_alice
\echo '[성공] 본인 글 말머리 수정 (신규 update grant)'
update public.post set category = '이적설' where id = :pid;
rollback to s;

savepoint s; :login_alice
\echo '[거부 기대 22P02] 목록에 없는 말머리'
insert into public.post (author_id, title, content, category) values (:'alice', 'x', 'y', '먹방');
rollback to s;

savepoint s; :login_alice
\echo '[거부 기대 23502] 말머리 없이 insert — "말머리 필수"의 DB 대응물(default가 없어야 성립)'
insert into public.post (author_id, title, content) values (:'alice', 'x', 'y');
rollback to s;

savepoint s; :login_alice
\echo '[UPDATE 0 기대] 남의 글 말머리 변경 — post_update_own이 필터로 막는다'
update public.post set category = '잡담' where id = :bpid;
rollback to s;

-- ---------------------------------------------------------------------
\echo ''
\echo '=== 21. 조회수 (view_count / increment_post_view) ==='
savepoint s; :login_alice
\echo '[거부 기대] view_count 직접 UPDATE (컬럼 권한 없음)'
update public.post set view_count = 9999 where id = :pid;
rollback to s;

savepoint s; :login_alice
\echo '[거부 기대] view_count를 실어 태어날 때부터 부풀린 글'
insert into public.post (author_id, title, content, category, view_count) values (:'alice', 'x', 'y', '잡담', 9999);
rollback to s;

savepoint s; :login_alice
\echo '[거부 기대] excerpt 직접 지정 (generated column)'
insert into public.post (author_id, title, content, category, excerpt) values (:'alice', 'x', 'y', '잡담', '조작');
rollback to s;

savepoint s; :login_anon
\echo '[성공 기대] 비로그인이 increment_post_view 호출 — **의도된 예외**임을 여기서 고정한다'
select public.increment_post_view(:pid);
reset role;
\echo '[1 기대] 실제로 증가했는가'
select view_count from public.post where id = :pid;
rollback to s;

savepoint s;
\echo '[0 기대] 소프트 삭제된 글은 에러 없이 조용히 무시된다'
select public.soft_delete_post(:pid) from (select set_config('request.jwt.claims', json_build_object('sub', :'alice', 'role', 'authenticated')::text, true)) _;
reset role;
select public.increment_post_view(:pid);
select view_count from public.post where id = :pid;
rollback to s;

savepoint s;
\echo '[f 기대] 조회는 "수정됨"을 유발하지 않는다 (touch_updated_at의 WHEN 절 회귀)'
select public.increment_post_view(:pid);
select created_at <> updated_at as edited from public.post where id = :pid;
rollback to s;

-- ---------------------------------------------------------------------
\echo ''
\echo '=== 22. 답글 (comment.parent_id — 깊이 1) ==='
savepoint s; :login_alice
insert into public.comment (post_id, user_id, content) values (:pid, :'alice', '루트') returning id as rootid \gset
\echo '[성공] 루트 댓글에 답글'
insert into public.comment (post_id, user_id, content, parent_id) values (:pid, :'alice', '답글', :rootid) returning id as replyid \gset
\echo '[거부 기대 P0001] 답글에 다시 답글'
insert into public.comment (post_id, user_id, content, parent_id) values (:pid, :'alice', '답답글', :replyid);
rollback to s;

savepoint s; :login_alice
insert into public.comment (post_id, user_id, content) values (:bpid, :'alice', '남의 글 루트') returning id as otherid \gset
\echo '[거부 기대 P0001] 다른 글의 댓글을 부모로'
insert into public.comment (post_id, user_id, content, parent_id) values (:pid, :'alice', '답글', :otherid);
rollback to s;

savepoint s; :login_alice
\echo '[거부 기대 P0001] 존재하지 않는 부모 (BEFORE 트리거가 FK보다 먼저 — 결정적)'
insert into public.comment (post_id, user_id, content, parent_id) values (:pid, :'alice', '답글', 999999);
rollback to s;

savepoint s; :login_alice
insert into public.comment (post_id, user_id, content) values (:pid, :'alice', '루트') returning id as rootid \gset
insert into public.comment (post_id, user_id, content, parent_id) values (:pid, :'alice', '답글1', :rootid);
insert into public.comment (post_id, user_id, content, parent_id) values (:pid, :'alice', '답글2', :rootid);
reset role;
\echo '[3 기대] comment_count는 답글을 포함한 총합이다'
select comment_count from public.post where id = :pid;
:login_alice
delete from public.comment where id = :rootid;
reset role;
\echo '[0 기대] 루트 삭제 시 cascade가 행마다 트리거를 발화시켜 정확히 감소한다'
select comment_count from public.post where id = :pid;
rollback to s;

savepoint s; :login_bob
insert into public.comment (post_id, user_id, content) values (:pid, :'bob', 'bob 루트') returning id as brootid \gset
reset role; :login_alice
insert into public.comment (post_id, user_id, content, parent_id) values (:pid, :'alice', 'alice 답글', :brootid);
reset role; :login_bob
\echo '[DELETE 1 / 남은 댓글 0 기대] ⚠ 수용된 결정: cascade는 RLS를 우회하므로'
\echo '    루트 작성자(bob)가 자기 댓글을 지우면 남(alice)의 답글까지 사라진다.'
\echo '    화면의 삭제 확인 문구가 이 사실을 알려야 한다.'
delete from public.comment where id = :brootid;
reset role;
select count(*) from public.comment where post_id = :pid;
rollback to s;

savepoint s; :login_alice
insert into public.comment (post_id, user_id, content) values (:pid, :'alice', '루트') returning id as rootid \gset
insert into public.comment (post_id, user_id, content, parent_id) values (:pid, :'alice', '답글', :rootid);
select public.soft_delete_post(:pid);
reset role; :login_anon
\echo '[0 기대] 글이 소프트 삭제되면 답글도 함께 감춰진다 (comment_select_alive_post)'
select count(*) from public.comment where post_id = :pid;
rollback to s;

\echo ''
\echo '=== 23. 가입 시 닉네임 배정 (handle_new_user + random_nickname) ==='
\echo '    프로바이더 표시 이름은 읽지 않는다 — 실명 노출·프로필 변경 시 불일치에 더해,'
\echo '    base가 클라이언트 자유 입력이라 사칭 방어를 영구히 짊어져야 했다.'
\echo '    (그 값이 무시된다는 확인은 섹션 24에 있다. 여기서는 배정 자체의 성질을 본다)'

create or replace function pg_temp.mkuser(p_meta jsonb, p_email text) returns text
language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data,
                          encrypted_password, created_at, updated_at)
  values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          p_email, p_meta, 'x', now(), now());
  return (select nickname from public.profiles where id = v_id);
end $$;

savepoint s;
\echo '[0행 기대] 메타 형태가 어떻든 가입이 깨지지 않는다 — 이제 파싱하지 않으므로'
\echo '           카카오형(name만)·구글형(full_name)·메타 없음·제로폭·비문자열을 모두 받는다'
select v.label from (values
  ('카카오형(name만, 이메일 없음)', '{"name":"홍길동"}'::jsonb, null),
  ('구글형(full_name)',             '{"full_name":"Chan Kim"}'::jsonb, 'chan@gmail.com'),
  ('메타도 이메일도 없음',           null::jsonb,                       null),
  ('제로폭 문자뿐',                  jsonb_build_object('name', U&'\200B\200B'), null),
  ('name이 배열',                    '{"name":["a","b"]}'::jsonb,      null),
  ('사칭 시도(ali<ZWSP>ce)',        jsonb_build_object('name', 'ali' || U&'\200B' || 'ce'), null)
) as v(label, meta, email)
where pg_temp.mkuser(v.meta, v.email) is null;   -- 닉네임이 안 붙은 경우만 남는다
rollback to s;

savepoint s;
\echo '[t 기대] 같은 메타로 두 번 가입해도 닉네임이 갈린다 — 충돌 시 접미사가 아니라 재추첨이다'
select pg_temp.mkuser('{"name":"홍길동"}'::jsonb, null)
    <> pg_temp.mkuser('{"name":"홍길동"}'::jsonb, null) as distinct_nicknames;
rollback to s;

savepoint s;
\echo '[0행 기대] 랜덤 조합 전수 — 어떤 조합도 길이(1~20)·정규형 CHECK를 어기지 않는다'
\echo '           480가지뿐이라 하나만 어겨도 그 사용자는 가입 자체가 실패한다'
-- ⚠ 여기 20은 **컬럼 CHECK가 아니라 생성기의 계약**이다. 20260810000001이 컬럼 상한을
--   200(abuse bound)으로 올렸지만, 사용자에게 보이는 한도는 여전히 20그래핌이라
--   랜덤 배정된 닉네임도 그 안에 들어와야 한다(안 그러면 배정받자마자 편집이 막힌다).
--   컬럼 상한을 따라 200으로 올리면 이 검사는 조용히 무의미해진다 — 올리지 말 것.
select n from (select public.random_nickname() as n from generate_series(1, 2000)) t
 where n <> public.normalize_nickname(n)
    or char_length(n) not between 1 and 20;
rollback to s;

savepoint s;
\echo '[0행 기대] 좁은 이름 공간에서 연속 가입 — 재추첨이 끝까지 도는가 (중복이 나오면 행이 남는다)'
select nickname, count(*) from (
  select pg_temp.mkuser(null, null) as nickname from generate_series(1, 120)
) t group by nickname having count(*) > 1;
rollback to s;

\echo ''
\echo '--- 23b. normalize_nickname 자체의 성질'
\echo '    사용자가 닉네임을 고칠 수 있게 되면서 정규형이 필수가 됐다(적용은 섹션 24).'
\echo '    ⚠ 문자 집합은 has_visible_char의 클래스를 둘로 쪼갠 것이고, 합집합이 원본과 같아야 한다.'
savepoint s;
\echo '[전부 t 기대] 지우는 문자(제로폭·BOM·soft hyphen)는 사라지고,'
\echo '              빈 자리를 그리는 문자(NBSP·전각공백)는 보통 공백으로 접히며 연속 공백은 하나가 된다'
select public.normalize_nickname('ali' || U&'\200B' || 'ce')      = 'alice'    as zwsp_removed,
       public.normalize_nickname('ali' || U&'\00AD' || 'ce')      = 'alice'    as shy_removed,
       public.normalize_nickname(U&'\FEFF' || 'alice')            = 'alice'    as bom_removed,
       public.normalize_nickname(U&'\00A0' || 'alice')            = 'alice'    as nbsp_folded,
       public.normalize_nickname('Chan' || U&'\3000' || 'Kim')    = 'Chan Kim' as ideographic_folded,
       public.normalize_nickname('  Chan   Kim  ')                = 'Chan Kim' as spaces_collapsed,
       public.normalize_nickname('Chan Kim')                      = 'Chan Kim' as inner_space_kept;
rollback to s;
savepoint s;
\echo '[t 기대] 멱등이다 — 트리거가 두 번 발화해도 값이 흔들리지 않아야 한다'
select bool_and(public.normalize_nickname(n) = public.normalize_nickname(public.normalize_nickname(n)))
  from (values ('  a' || U&'\00A0\200B' || ' b  '), ('alice'), (U&'\FEFF'), ('  ')) as v(n);
rollback to s;
savepoint s;
\echo '[0행 기대] 기존 행이 전부 정규형이다 (profiles_nickname_canonical)'
select id, nickname from public.profiles where nickname <> public.normalize_nickname(nickname);
rollback to s;

\echo ''
\echo '=== 24. 프로필 편집 (20260809000001) ==='
\echo '    편집 UI가 생기면서 20260801000006이 회수했던 UPDATE 권한을 되살렸다 —'
\echo '    그때의 우려(사칭)를 정규형 CHECK가 막는지 함께 확인한다.'

savepoint s; :login_alice
\echo '[성공] 본인 닉네임 변경'
update public.profiles set nickname = '왼발의마법사' where id = :'alice';
rollback to s;

savepoint s; :login_alice
\echo '[손흥민 기대] 앞뒤 공백·제로폭은 트리거가 다듬는다 (사용자 입력이 CHECK를 깨지 않게)'
update public.profiles set nickname = '  손' || U&'\200B' || '흥민  ' where id = :'alice';
reset role;
select nickname from public.profiles where id = :'alice';
rollback to s;

savepoint s; :login_alice
\echo '[UPDATE 0 기대] 남의 닉네임 변경 — RLS가 필터로 걸러 조용히 무시된다'
update public.profiles set nickname = '탈취됨' where id = :'bob';
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 남의 폴더를 아바타 경로로 지정 (profiles_avatar_path_own)'
update public.profiles set avatar_path = :'bob' || '/x.webp' where id = :'alice';
rollback to s;

savepoint s; :login_alice
\echo '[성공] 본인 폴더 아바타 경로'
update public.profiles set avatar_path = :'alice' || '/a.webp' where id = :'alice';
rollback to s;

-- ⚠ starts_with만 쓰던 시절에는 아래가 전부 통과했고, URL을 만드는 순간 브라우저 파서가
--   `..`를 정규화해 **남의 파일이 떴다**(실측). 아바타가 댓글·상세에 노출되면서 사칭 벡터가
--   되므로 정규식으로 `{내 uuid}/{파일명}` 두 세그먼트를 강제한다.
savepoint s; :login_alice
\echo '[❌차단] 경로 탈출 — 내 폴더로 시작하지만 ..로 남의 폴더를 가리킨다'
update public.profiles set avatar_path = :'alice' || '/../' || :'bob' || '/x.webp' where id = :'alice';
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 세그먼트 3개 (하위 폴더)'
update public.profiles set avatar_path = :'alice' || '/sub/x.webp' where id = :'alice';
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 확장자 없는 파일명'
update public.profiles set avatar_path = :'alice' || '/x' where id = :'alice';
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 폴더만 있고 파일이 없다'
update public.profiles set avatar_path = :'alice' || '/' where id = :'alice';
rollback to s;

savepoint s; :login_alice
\echo '[성공] null 로 비우기 (사진 삭제 — 업로드 실패 시 정리 경로)'
update public.profiles set avatar_path = null where id = :'alice';
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] created_at 위조 (컬럼 권한 없음 — 수정 가능한 컬럼만 열었다)'
update public.profiles set created_at = now() where id = :'alice';
rollback to s;

savepoint s;
\echo '[t 기대] 랜덤 닉네임이 배정되는가 — 프로바이더 표시 이름을 더 이상 읽지 않는다'
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data,
                        encrypted_password, created_at, updated_at)
values ('00000000-0000-0000-0000-0000000000fd', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', null, '{"name":"홍길동"}'::jsonb, 'x', now(), now());
select nickname <> '홍길동' as ignored_provider_name,
       nickname = public.normalize_nickname(nickname) as canonical
  from public.profiles where id = '00000000-0000-0000-0000-0000000000fd';
rollback to s;

\echo ''
\echo '--- 24b. 아바타 스토리지 정책 (남의 폴더에 못 올린다)'
savepoint s; :login_alice
\echo '[❌차단] bob 폴더에 업로드'
insert into storage.objects (bucket_id, name, owner)
values ('avatars', :'bob' || '/hack.webp', :'alice');
rollback to s;

savepoint s; :login_alice
\echo '[성공] 본인 폴더에 업로드'
insert into storage.objects (bucket_id, name, owner)
values ('avatars', :'alice' || '/me.webp', :'alice');
rollback to s;

\echo ''
\echo '=== 25. 길이 한도 (20260810000001 — abuse bound) ==='
\echo '    화면 한도는 **그래핌**(제목 120·댓글 1000·닉네임 20)이고 클라이언트만 강제한다.'
\echo '    DB는 그래핌을 셀 수 없어(PG에 분절 기능 없음) 코드포인트 K=10배를 상한으로 둔다.'
\echo '    ⚠ 두 단위는 어떤 배수로도 완전 일치하지 않는다 — 1그래핌의 코드포인트 수에'
\echo '      상한이 없기 때문이다. 그래서 클라이언트가 두 한도를 겹쳐 검사한다.'
\echo '      여기서 검사하는 것은 그중 **DB가 실제로 강제하는 쪽**이다.'

savepoint s; :login_alice
\echo '[성공] 제목 1,200 코드포인트 (post_title_check 경계)'
insert into public.post (author_id, title, content, category)
values (:'alice', repeat('가', 1200), '본문', '잡담');
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 제목 1,201 코드포인트'
insert into public.post (author_id, title, content, category)
values (:'alice', repeat('가', 1201), '본문', '잡담');
rollback to s;

savepoint s; :login_alice
\echo '[성공] 이모지 제목 — 그래핌 120개(가족 이모지)가 코드포인트 840으로 들어간다'
\echo '       이게 이번 변경의 핵심 시나리오다. 옛 한도(120)에서는 거부됐다.'
insert into public.post (author_id, title, content, category)
values (:'alice',
        repeat(U&'\+01F468\200D\+01F469\200D\+01F467\200D\+01F466', 120), '본문', '잡담');
rollback to s;

savepoint s; :login_alice
\echo '[성공] 댓글 10,000 코드포인트 (comment_content_check 경계)'
insert into public.comment (post_id, user_id, content)
values (:pid, :'alice', repeat('가', 10000));
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 댓글 10,001 코드포인트'
insert into public.comment (post_id, user_id, content)
values (:pid, :'alice', repeat('가', 10001));
rollback to s;

savepoint s; :login_alice
\echo '[성공] 닉네임 200 코드포인트 (profiles_nickname_check 경계)'
update public.profiles set nickname = repeat('가', 200) where id = :'alice';
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 닉네임 201 코드포인트'
update public.profiles set nickname = repeat('가', 201) where id = :'alice';
rollback to s;

savepoint s; :login_alice
\echo '[성공] 닉네임 200자가 btree 유니크 인덱스(lower(nickname))에도 들어간다'
\echo '       ⚠ btree 인덱스 행은 8KB 페이지 기준 2704바이트가 상한이다. 코드포인트 한도를'
\echo '         빼면 어긋남이 CHECK가 아니라 **인덱스**로 옮겨간다(영어 에러라 번역도 안 된다).'
\echo '         200 × 최대 4바이트 = 800바이트 < 2704 — 이 한도가 인덱스도 함께 지킨다.'
update public.profiles set nickname = repeat(U&'\+01F600', 200) where id = :'alice';
rollback to s;

savepoint s; :login_alice
\echo '[성공] 본문 20,000 코드포인트 — **일부러 올리지 않았다**'
\echo '       한도가 넓어 이모지가 체감되지 않는데 가장 큰 컬럼이라 10배로 푸는 대가가 크고,'
\echo '       20,000자 그래핌 계산이 1.5ms(코드포인트의 14배)라 키 입력마다 돌릴 수도 없다.'
insert into public.post (author_id, title, content, category)
values (:'alice', '제목', repeat('가', 20000), '잡담');
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 본문 20,001 코드포인트'
insert into public.post (author_id, title, content, category)
values (:'alice', '제목', repeat('가', 20001), '잡담');
rollback to s;

rollback;
\echo ''
\echo '=== 끝 (전체 rollback — DB에 흔적을 남기지 않는다) ==='
