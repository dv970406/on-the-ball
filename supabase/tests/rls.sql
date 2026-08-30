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
-- 컬럼 권한이 먼저 막는다. 설령 권한을 줬더라도 새 행이 post_select_visible를
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
\echo '        is_blocked(차단 숨김 판정 — post의 SELECT 정책에 `to` 절이 없어 비로그인 조회도'
\echo '        이 함수를 지난다. 닫으면 목록·상세가 통째로 42501로 죽는다. anon은 auth.uid()가'
\echo '        null이라 항상 false를 받아 아무것도 감춰지지 않는다)'
\echo '        match_prediction_results(승부예측 집계 — 게이팅 축이 "참여"가 아니라 "킥오프"라,'
\echo '        마감 후에는 비로그인에게도 열어야 한다. "커뮤니티의 68%가 이렇게 봤다"가 이 기능의'
\echo '        콘텐츠 자체이고 크롤러도 그것을 본다. 킥오프 전에는 누구에게나 0행이다)'
select p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and has_function_privilege('anon', p.oid, 'EXECUTE')
   and p.proname not in ('post_is_alive', 'has_visible_char', 'normalize_nickname',
                         'increment_post_view', 'is_blocked',
                         'match_prediction_results');

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
\echo '[0 기대] 글이 소프트 삭제되면 답글도 함께 감춰진다 (comment_select_visible)'
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
\echo '--- 24c. 본문 이미지 스토리지 정책 (post-images)'
\echo '    ⚠ 아바타와 달리 DB CHECK 대응물이 없다 — 본문은 자유 텍스트라 경로를 제약할'
\echo '      자리가 없다. 이 정책이 **유일한** 방어선이므로 검사를 빠뜨리면 안 된다.'
\echo '    ⚠ **버킷 설정 자체가 방어선이다.** 클라이언트 압축(500KB webp)은 UX일 뿐이라'
\echo '      우회 가능하고, 실제로 크기·타입을 막는 것은 file_size_limit·allowed_mime_types다.'
\echo '      정책만 검사하면 이 값이 조용히 넓어져도 아무도 모른다.'
\echo '[t/1048576/t 기대] public · 1MiB 상한 · webp/jpeg/png만'
select public                                                   as is_public,
       file_size_limit,
       allowed_mime_types @> array['image/webp','image/jpeg','image/png']
         and array_length(allowed_mime_types, 1) = 3             as mime_exact
  from storage.buckets where id = 'post-images';

savepoint s; :login_alice
\echo '[❌차단] bob 폴더에 업로드'
insert into storage.objects (bucket_id, name, owner)
values ('post-images', :'bob' || '/hack.webp', :'alice');
rollback to s;

savepoint s; :login_alice
\echo '[성공] 본인 폴더에 업로드'
insert into storage.objects (bucket_id, name, owner)
values ('post-images', :'alice' || '/shot.webp', :'alice');
rollback to s;

savepoint s; :login_anon
\echo '[❌차단] 비로그인 업로드'
insert into storage.objects (bucket_id, name, owner)
values ('post-images', :'alice' || '/anon.webp', :'alice');
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 하위 폴더 — 경로는 {uid}/{파일} 두 세그먼트여야 한다'
insert into storage.objects (bucket_id, name, owner)
values ('post-images', :'alice' || '/sub/deep.webp', :'alice');
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 경로 탈출 — foldername[1] 비교만으로는 통과한다(정규식이 막는다)'
insert into storage.objects (bucket_id, name, owner)
values ('post-images', :'alice' || '/../' || :'bob' || '/x.webp', :'alice');
rollback to s;

\echo '    ⚠ 열거(list)를 열어 두면 "URL을 알면 본다"가 "uuid만 알면 전수 조회된다"로 바뀐다.'
\echo '      이 앱은 업로드를 먼저 하고 본문에 넣으므로 **게시하지 않은 사진**이 버킷에 남는다.'
\echo '      공개 URL 서빙은 정책을 타지 않아 본문 이미지는 그대로 보인다(실측).'
savepoint s;
insert into storage.objects (bucket_id, name, owner)
values ('post-images', :'bob' || '/victim.webp', :'bob');
:login_alice
\echo '[0행 기대] 남의 본문 이미지는 열거되지 않는다'
select count(*) as others_files from storage.objects
 where bucket_id = 'post-images' and name like :'bob' || '/%';
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

\echo ''
\echo '=== 26. excerpt가 이미지 마크다운을 먹지 않는다 (20260817000002) ==='
\echo '    공개 URL 한 줄이 150자 안팎이라, 지우지 않으면 사진으로 시작하는 글의'
\echo '    발췌 300자가 통째로 URL이 되어 목록 카드가 빈다.'
savepoint s; :login_alice
\echo '[t 기대] 사진으로 시작하는 글도 본문이 발췌에 남는다'
insert into public.post (author_id, title, content, category)
values (:'alice', '사진 글',
        '![](http://127.0.0.1:64321/storage/v1/object/public/post-images/'
        || :'alice' || '/00000000-0000-4000-8000-000000000000.webp)' || E'\n' || '본문 첫 문장입니다.',
        '잡담');
select excerpt like '%본문 첫 문장입니다.%' as body_survived,
       excerpt not like '%post-images%'    as url_stripped
  from public.post where title = '사진 글';
rollback to s;

\echo ''
\echo '=== 27. 투표 (20260817000003) ==='
\echo '    설계 요약: 득표수 컬럼도 트리거도 없다(post_poll_results가 그때그때 센다).'
\echo '    개별 표는 "내 행만" SELECT라 남의 표가 구조적으로 새지 않고,'
\echo '    집계는 **투표한 사람에게만** 열린다(v1은 UI에서만 가려 게이팅이 아니었다).'

-- alice의 글에 투표를 붙인다. ⚠ 시드는 **superuser로** 넣는다 — authenticated에는
-- post_poll·post_poll_option INSERT 권한이 아예 없다(그게 아래 검사들이 지키는 성질이다).
savepoint s27;
insert into public.post_poll (post_id, question) values (:pid, '누구를 데려와야 할까?');
insert into public.post_poll_option (post_id, label, sort_order)
values (:pid, '윙어', 1), (:pid, '수비형 미드필더', 2);
select id as opt1 from public.post_poll_option where post_id = :pid and sort_order = 1 \gset
select id as opt2 from public.post_poll_option where post_id = :pid and sort_order = 2 \gset

savepoint s; :login_bob
\echo '[❌차단] 남의 글에 투표를 붙인다'
insert into public.post_poll (post_id, question) values (:pid, '가로채기');
rollback to s;

savepoint s; :login_bob
\echo '[❌차단] 남의 글에 선택지를 끼워 넣는다'
insert into public.post_poll_option (post_id, label, sort_order) values (:pid, '몰래', 4);
rollback to s;

-- ⚠ 아래 둘이 이 절의 핵심이다. 한때 "작성자면 넣을 수 있다"로 INSERT를 열어 두고
--   UPDATE/DELETE만 막은 채 "생성 시 고정"이라고 적었는데, 정책에 시점 개념이 없어
--   **진행 중인 투표에 선택지를 끼워 넣는 것**이 통과했다(실측). 검사가 남의 글만 보고
--   작성자 본인의 사후 삽입을 보지 않아 그대로 살아남았다.
savepoint s; :login_alice
\echo '[❌차단] **작성자도** 진행 중인 투표에 선택지를 추가할 수 없다'
insert into public.post_poll_option (post_id, label, sort_order) values (:pid, '뒤늦게', 4);
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] **작성자도** 옛 글에 투표를 나중에 붙일 수 없다'
insert into public.post_poll (post_id, question) values (:bpid, '사후 투표');
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 질문 수정 — 생성 시 고정이라 UPDATE 정책이 없다'
update public.post_poll set question = '바꿔치기' where post_id = :pid;
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 선택지 수정 — 던져진 표의 뜻이 바뀌면 안 된다'
update public.post_poll_option set label = '바꿔치기' where id = :opt1;
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 투표 통째로 삭제'
delete from public.post_poll where post_id = :pid;
rollback to s;

savepoint s; :login_bob
\echo '[성공] 첫 투표'
insert into public.post_poll_vote (post_id, user_id, option_id) values (:pid, :'bob', :opt1);
\echo '[성공] 갈아타기 — option_id만 바꾼다'
update public.post_poll_vote set option_id = :opt2 where post_id = :pid and user_id = :'bob';
\echo '[1행 기대] 갈아타도 표는 하나다'
select count(*) as my_votes from public.post_poll_vote where post_id = :pid and user_id = :'bob';
rollback to s;

savepoint s; :login_bob
insert into public.post_poll_vote (post_id, user_id, option_id) values (:pid, :'bob', :opt1);
\echo '[❌차단] 표를 다른 글로 옮겨 "취소 불가"를 우회 — 컬럼 권한이 막는다'
update public.post_poll_vote set post_id = :bpid where post_id = :pid and user_id = :'bob';
rollback to s;

savepoint s; :login_bob
insert into public.post_poll_vote (post_id, user_id, option_id) values (:pid, :'bob', :opt1);
\echo '[❌차단] 투표 취소 — DELETE 정책이 없다'
delete from public.post_poll_vote where post_id = :pid and user_id = :'bob';
rollback to s;

savepoint s; :login_bob
\echo '[❌차단] 남의 명의로 투표'
insert into public.post_poll_vote (post_id, user_id, option_id) values (:pid, :'alice', :opt1);
rollback to s;

savepoint s; :login_bob
\echo '[❌차단] 한 사람 두 표 (기본키)'
insert into public.post_poll_vote (post_id, user_id, option_id) values (:pid, :'bob', :opt1);
insert into public.post_poll_vote (post_id, user_id, option_id) values (:pid, :'bob', :opt2);
rollback to s;

savepoint s; :login_bob
\echo '[❌차단] 다른 글의 선택지로 투표 — 복합 FK가 막는다'
insert into public.post_poll_vote (post_id, user_id, option_id) values (:bpid, :'bob', :opt1);
rollback to s;

savepoint s;
:login_alice
select public.soft_delete_post(:pid);
:login_bob
\echo '[❌차단] 삭제된 글에 투표'
insert into public.post_poll_vote (post_id, user_id, option_id) values (:pid, :'bob', :opt1);
rollback to s;

-- ⚠ 위 검사와 savepoint를 나눈다. 에러가 트랜잭션을 abort시켜 뒤따르는 select까지
--   함께 죽는다(이 파일 머리의 "실패를 기대하는 검사마다 savepoint" 규약).
savepoint s;
:login_alice
select public.soft_delete_post(:pid);
:login_bob
\echo '[0 / 0 기대] 삭제된 글의 투표·선택지는 보이지 않는다'
select (select count(*) from public.post_poll where post_id = :pid) as polls,
       (select count(*) from public.post_poll_option where post_id = :pid) as opts;
rollback to s;

savepoint s; :login_bob
insert into public.post_poll_vote (post_id, user_id, option_id) values (:pid, :'bob', :opt1);
:login_alice
\echo '[0행 기대] 남의 표는 조회되지 않는다'
select * from public.post_poll_vote where post_id = :pid;
\echo '[0행 기대] 투표하지 않은 사람에게 집계는 닫혀 있다'
select * from public.post_poll_results(:pid);
insert into public.post_poll_vote (post_id, user_id, option_id) values (:pid, :'alice', :opt1);
\echo '[opt1=2 기대] 투표하면 집계가 열린다 (bob·alice 둘 다 opt1)'
select option_id = :opt1 as is_opt1, vote_count from public.post_poll_results(:pid);
update public.post_poll_vote set option_id = :opt2 where post_id = :pid and user_id = :'alice';
\echo '[opt1=1 / opt2=1 기대] 갈아타면 집계가 따라 움직인다'
select (select vote_count from public.post_poll_results(:pid) where option_id = :opt1) as opt1,
       (select vote_count from public.post_poll_results(:pid) where option_id = :opt2) as opt2;
rollback to s;

savepoint s; :login_anon
\echo '[❌차단] 비로그인은 집계 함수를 못 부른다'
select * from public.post_poll_results(:pid);
rollback to s;

savepoint s; :login_bob
insert into public.post_poll_vote (post_id, user_id, option_id) values (:pid, :'bob', :opt1);
:login_anon
-- ⚠ 설명은 **라벨보다 앞**에 둔다. 러너가 라벨 뒤 3줄만 값으로 뽑아서, 사이에 끼우면
--   정작 확인해야 할 숫자가 잘려 나간다.
\echo '    ⚠ post_poll_vote SELECT를 **에러 없이 0행**으로 받아야 한다. grant를 빼면 임베딩이'
\echo '      42501로 죽어 비로그인에게 투표가 통째로 사라진다(실측). post_like와 같은 형태로,'
\echo '      행을 막는 것은 grant가 아니라 정책(to authenticated)이다.'
\echo '[1 / 2 / 0 기대] 비로그인도 투표·선택지는 보고 표만 못 본다'
select (select count(*) from public.post_poll where post_id = :pid)        as polls,
       (select count(*) from public.post_poll_option where post_id = :pid) as opts,
       (select count(*) from public.post_poll_vote where post_id = :pid)   as votes;
rollback to s;

\echo ''
\echo '--- 27b. create_post_with_poll — 글과 투표는 함께 생기거나 함께 없다'
savepoint s; :login_alice
\echo '[❌차단] 선택지 1개'
select public.create_post_with_poll('잡담', '제목', '본문', '질문', array['하나']);
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 선택지 5개'
select public.create_post_with_poll('잡담', '제목', '본문', '질문', array['1','2','3','4','5']);
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 2차원 배열로 개수 검사 우회 — array_ndims가 막는다'
select public.create_post_with_poll('잡담', '제목', '본문', '질문', array[array['a','b'],array['c','d']]);
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 같은 라벨 두 번 — unique(post_id, label)'
select public.create_post_with_poll('잡담', '제목', '본문', '질문', array['같은거','같은거']);
rollback to s;

/*
 * 원자성 — 글 insert는 성공하고 **그 뒤 post_poll에서** 실패하는 입력으로 확인한다.
 *
 * ⚠ 한때 실패 호출과 누수 확인을 **다른 savepoint**에 두었는데, 실패를 롤백한 뒤에 세고
 *   있어서 함수가 원자적이든 아니든 결과가 항상 0이었다 — 증명하려던 것을 증명하지 못하는
 *   죽은 검사였다.
 * ⚠ 그렇다고 그냥 붙여 놓으면 안 된다. 함수 밖으로 나온 예외는 **트랜잭션을 abort시켜**
 *   뒤따르는 select까지 죽는다(실측). `begin … exception` 블록이 암묵 서브트랜잭션을
 *   만들어 주므로 그 안에서 삼켜야 바깥이 살아남는다.
 * ⚠ 성공해 버리면(=원자성이 깨지면) 아래 `raise`가 P0001로 새어나와 러너의 "기대하지 않은
 *   ERROR"에 걸린다 — 조용히 통과할 수 없게 만든 장치다.
 */
savepoint s; :login_alice
\echo '[0 기대] 투표에서 실패하면 이미 insert된 글도 함께 롤백된다 (원자성)'
do $$
begin
  -- ⚠ 실패 지점이 **post insert보다 뒤**여야 원자성을 증명한다. 함수 머리의 사전 검사
  --   (선택지 개수·NULL·중복·질문 공백)는 전부 insert 앞에서 걸리므로 여기 쓸 수 없다 —
  --   한때 "질문이 제로폭 공백뿐"으로 썼다가, 그 검사가 앞으로 옮겨지자 이 검사가
  --   증명하려던 것을 증명하지 못하게 됐다. 길이 CHECK는 post_poll insert 시점이라 뒤에 있다.
  perform public.create_post_with_poll('잡담', '원자성 확인', '본문', repeat('가', 1001), array['a','b']);
  raise exception '원자성 검사가 통과해 버렸다 — 함수가 실패하지 않았다';
exception
  when check_violation then null;   -- 기대한 실패
end $$;
select count(*) as leaked from public.post where title = '원자성 확인';
rollback to s;

savepoint s; :login_anon
\echo '[❌차단] 비로그인은 글+투표 생성 함수를 못 부른다'
select public.create_post_with_poll('잡담', '제목', '본문', '질문', array['a','b']);
rollback to s;

savepoint s; :login_alice
select public.create_post_with_poll('잡담', '투표 글', '본문', '누가 MVP?', array['가','나','다']) as new_id \gset
\echo '[1 / 3 기대] 글·투표·선택지가 함께 생긴다'
select (select count(*) from public.post_poll where post_id = :new_id) as polls,
       (select count(*) from public.post_poll_option where post_id = :new_id) as opts;
rollback to s;

\echo ''
\echo '    ⚠ definer라 **컬럼 권한도 RLS도 우회한다** — 삽입 컬럼을 함수 본문이 못박고 있다는'
\echo '      사실이 유일한 방어다. 그 목록이 넓어지는 회귀를 여기서 잡는다(섹션 18과 같은 취지).'
savepoint s; :login_bob
select public.create_post_with_poll('잡담', '위조 시도', '본문', '질문', array['a','b']) as fid \gset
\echo '[bob / 0 / 0 / t 기대] 작성자는 호출자로 확정되고 카운터·시각을 실을 자리가 없다'
select author_id = :'bob' as author_is_caller, like_count, comment_count,
       created_at = updated_at as not_edited
  from public.post where id = :fid;
rollback to s;

\echo ''
\echo '    ⚠ 라벨을 정규형으로 접지 않으면 unique (post_id, label)이 **그냥 우회된다** —'
\echo '      '\''찬성'\'' · '\''찬성 '\'' · '\''찬'\''+제로폭공백+'\''성'\''이 서로 다른 값이라 통과하고'
\echo '      화면에는 똑같이 생긴 선택지가 여럿 뜬다(표를 쪼개는 도구가 된다).'
savepoint s; :login_alice
\echo '[❌차단] 제로폭·NBSP·꼬리 공백으로 위장한 같은 라벨'
select public.create_post_with_poll('잡담', '제목', '본문', '질문',
  array['찬성', '찬성 ', U&'\CE2C'||U&'\200B'||U&'\C131']);
rollback to s;

savepoint s; :login_alice
select public.create_post_with_poll('잡담', '제목', '본문', '질문',
  array[' 찬성 ', U&'\BC18'||U&'\00A0'||U&'\B300']) as nid \gset
\echo '[찬성 / 반대 기대] 저장되는 값이 정규형이라 화면 문구와 갈리지 않는다'
select label from public.post_poll_option where post_id = :nid order by sort_order;
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] NULL 선택지 — 영어 23502가 아니라 P0001로 사유가 나가야 한다'
select public.create_post_with_poll('잡담', '제목', '본문', '질문', array['a', null]);
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 보이는 글자가 없는 선택지(제로폭 공백 한 자)'
select public.create_post_with_poll('잡담', '제목', '본문', '질문', array['a', U&'\200B']);
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 질문이 NULL'
select public.create_post_with_poll('잡담', '제목', '본문', null, array['a','b']);
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 질문 1,001 코드포인트 (화면 한도 100그래핌의 K=10배)'
select public.create_post_with_poll('잡담', '제목', '본문', repeat('가', 1001), array['a','b']);
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 선택지 401 코드포인트 (화면 한도 40그래핌의 K=10배)'
select public.create_post_with_poll('잡담', '제목', '본문', '질문', array[repeat('나', 401), 'b']);
rollback to s;

\echo ''
\echo '--- 27c. 소프트 삭제된 글의 투표는 어느 경로로도 새지 않는다'
\echo '    ⚠ post_poll_results는 security definer라 **RLS를 우회한다** — 정책에 건 post_is_alive가'
\echo '      닿지 않아, 빠뜨렸더니 삭제된 글의 집계가 투표자에게 영구히 열려 있었다.'
\echo '      id가 연번이라 post_poll_results(N)을 훑으면 "삭제됐지만 투표가 있던 글"이 식별됐다.'
savepoint s;
:login_bob
insert into public.post_poll_vote (post_id, user_id, option_id) values (:pid, :'bob', :opt1);
:login_alice
select public.soft_delete_post(:pid);
:login_bob
\echo '[0행 / 0행 기대] 삭제 후 집계도, 내 표도 보이지 않는다'
select (select count(*) from public.post_poll_results(:pid))                            as results,
       (select count(*) from public.post_poll_vote where post_id = :pid)                as my_votes;
rollback to s;

rollback to s27;

\echo ''
\echo '=== 28. 차단 (20260818000001) ==='
\echo '    설계 요약: 숨김을 조회 훅이 아니라 **정책**이 한다(post_select_visible ·'
\echo '    comment_select_visible). 단방향이라 차단당한 쪽은 제약도 없고 사실도 알 수 없다.'
\echo '    자기차단 금지 CHECK는 취향이 아니라 **정책의 전제**다 — 아래 "내 글 수정" 검사 참고.'

savepoint s28;

savepoint s; :login_bob
\echo '[❌차단] 남(alice) 명의로 차단 행을 만든다'
insert into public.user_block (blocker_id, blocked_id) values (:'alice', :'bob');
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 자기 자신 차단 — user_block_not_self'
insert into public.user_block (blocker_id, blocked_id) values (:'alice', :'alice');
rollback to s;

savepoint s; :login_anon
\echo '[❌차단] 비로그인 차단'
insert into public.user_block (blocker_id, blocked_id) values (:'alice', :'bob');
rollback to s;

savepoint s; :login_alice
insert into public.user_block (blocker_id, blocked_id) values (:'alice', :'bob');
\echo '[❌차단] 차단 행 UPDATE — 정책도 컬럼 권한도 없다(행은 불변, 해제는 delete)'
update public.user_block set blocked_id = :'alice' where blocker_id = :'alice';
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] created_at을 실어 시각 위조 — insert grant 목록 밖이다'
insert into public.user_block (blocker_id, blocked_id, created_at)
values (:'alice', :'bob', now() - interval '1 year');
rollback to s;

savepoint s; :login_alice
insert into public.user_block (blocker_id, blocked_id) values (:'alice', :'bob');
:login_bob
\echo '    ⚠ DELETE의 using 절은 필터로 동작한다 — 권한이 없으면 에러가 아니라 0행이다.'
\echo '[DELETE 0 기대] 남의 차단 행은 지워지지 않는다'
delete from public.user_block where blocker_id = :'alice';
rollback to s;

-- ---- 숨김이 실제로 걸리는가 ----
savepoint s; :login_alice
insert into public.user_block (blocker_id, blocked_id) values (:'alice', :'bob');
\echo '[0 / 0 기대] 차단하면 그 사람의 글도 댓글도 보이지 않는다'
select (select count(*) from public.post    where author_id = :'bob') as posts,
       (select count(*) from public.comment where user_id   = :'bob') as comments;
rollback to s;

savepoint s; :login_alice
insert into public.user_block (blocker_id, blocked_id) values (:'alice', :'bob');
:login_bob
\echo '    ⚠ 단방향이다 — 차단당한 쪽에는 아무 제약이 없고 사실도 드러나지 않는다.'
\echo '[1 / 0 기대] bob에게는 자기 글이 그대로 보이고, 자기가 차단당했는지는 알 수 없다'
select (select count(*) from public.post where id = :bpid)              as my_post,
       (select count(*) from public.user_block where blocked_id = :'bob') as knows;
rollback to s;

savepoint s; :login_alice
insert into public.user_block (blocker_id, blocked_id) values (:'alice', :'bob');
-- ⚠ **`:login_anon`은 role만 바꾸고 `request.jwt.claims`는 그대로 둔다.** 그래서 앞선
--   `:login_alice`의 sub가 남아 auth.uid()가 여전히 alice를 가리킨다 — 실제로 이 검사가
--   그것 때문에 0을 돌려줬다(비로그인인데 차단이 걸렸다). 판정이 auth.uid()에 걸린 검사는
--   claims까지 비워야 진짜 비로그인이 된다. 정책이 `to authenticated`인 검사들(섹션 27 등)은
--   role만으로 갈리므로 이 함정에 걸리지 않는다.
select set_config('request.jwt.claims', '{}', true);
:login_anon
\echo '[1 기대] 비로그인에게는 그대로 보인다 (auth.uid()가 null → is_blocked는 항상 false)'
select count(*) from public.post where id = :bpid;
rollback to s;

savepoint s; :login_alice
insert into public.user_block (blocker_id, blocked_id) values (:'alice', :'bob');
\echo '    ⚠ 이 검사가 지키는 것은 **"남을 차단해도 내 쓰기가 멀쩡하다"** 이지 자기차단 CHECK가'
\echo '      아니다 — CHECK를 지워도 alice는 bob만 차단하므로 여기는 그대로 UPDATE 1로 통과한다'
\echo '      (실측). CHECK 회귀는 위의 [❌차단] 자기 자신 차단 검사가 잡는다: CHECK가 없으면'
\echo '      그 insert가 성공해 run-rls.sh의 ②(차단 기대인데 통과)에 걸린다.'
\echo '[UPDATE 1 기대] 차단 중에도 내 글 수정은 된다'
update public.post set title = '수정됨' where id = :pid;
rollback to s;

savepoint s; :login_alice
insert into public.user_block (blocker_id, blocked_id) values (:'alice', :'bob');
delete from public.user_block where blocker_id = :'alice' and blocked_id = :'bob';
\echo '[1 기대] 해제하면 다시 보인다'
select count(*) from public.post where id = :bpid;
rollback to s;

savepoint s; :login_alice
insert into public.user_block (blocker_id, blocked_id) values (:'alice', :'bob');
\echo '    ⚠ **의도된 경계다.** definer 함수는 RLS를 우회하므로 차단이 닿지 않는다.'
\echo '      넷 다 "내게 보이지 않아 도달 경로가 없는 글"에만 남으므로 수용한다 —'
\echo '      여기에 차단을 넣으면 뷰어 종속성이 definer 전반으로 번진다.'
\echo '[성공] definer RPC는 차단을 보지 않는다'
select public.toggle_post_like(:bpid) as liked;
rollback to s;

rollback to s28;

\echo ''
\echo '=== 29. 신고 (20260818000002) ==='
\echo '    설계 요약: SELECT 정책이 없어 **아무도 읽을 수 없다**(관리 화면이 없다).'
\echo '    중복·자기 글 거부는 정책이 아니라 트리거가 P0001 한국어로 설명한다 —'
\echo '    23505를 그냥 흘리면 toDbErrorMessage가 닉네임 문구로 접어 뜻이 어긋난다.'

savepoint s29;

savepoint s; :login_alice
\echo '[성공] 남의 글 신고'
insert into public.post_report (post_id, reporter_id, reason) values (:bpid, :'alice', 'spam');
rollback to s;

savepoint s;
reset role;
create temp table dup_probe (code text);
grant insert, select on dup_probe to authenticated;
:login_alice
insert into public.post_report (post_id, reporter_id, reason) values (:bpid, :'alice', 'spam');
select set_config('rls.bpid', :'bpid', true);
select set_config('rls.alice', :'alice', true);
\echo '    ⚠ **코드까지 본다.** 라벨만으로는 23505와 P0001을 구분하지 못하는데(러너는 ERROR'
\echo '      유무만 본다), 23505로 새면 toDbErrorMessage가 닉네임 문구 "이미 사용 중인 값이에요"로'
\echo '      접어 **트리거를 둔 이유 자체가 무너진다.** 그게 이 기능이 유니크 제약에만 기대지'
\echo '      않는 이유다.'
\echo '[P0001 기대] 같은 글 두 번 — 트리거가 한국어 사유를 말한다'
do $$
declare
  v_bpid  bigint := current_setting('rls.bpid')::bigint;
  v_alice uuid   := current_setting('rls.alice')::uuid;
begin
  insert into public.post_report (post_id, reporter_id, reason) values (v_bpid, v_alice, 'abuse');
  insert into dup_probe values ('통과!');
exception when others then insert into dup_probe values (sqlstate);
end $$;
select code from dup_probe;
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 내가 쓴 글 신고 (P0001)'
insert into public.post_report (post_id, reporter_id, reason) values (:pid, :'alice', 'spam');
rollback to s;

savepoint s; :login_alice
\echo '    ⚠ 대상 글을 **:pid(alice의 글)** 로 둔다. :bpid는 bob 자신의 글이라 트리거의'
\echo '      "내가 쓴 글" 분기가 먼저 걸려 P0001로 죽고, 정작 검사하려던'
\echo '      post_report_insert_own의 `reporter_id = auth.uid()` 절을 한 번도 타지 않는다.'
\echo '[❌차단] 남(bob) 명의로 신고 — RLS 신원 절이 막는다'
insert into public.post_report (post_id, reporter_id, reason) values (:pid, :'bob', 'spam');
rollback to s;

/*
 * 남의 명의 insert는 **42501 하나로 수렴해야 한다.**
 *
 * ⚠ BEFORE ROW 트리거는 RLS `with check`보다 **먼저** 돈다. 그래서 트리거가 정책이 어차피
 *   거부할 행에까지 사유를 말하면 **에러 코드가 오라클이 된다** — 실제로 그랬다:
 *   남의 uuid를 `reporter_id`에 실어 보내는 것만으로 P0001("이미 신고한 글이에요" /
 *   "내가 쓴 글은 신고할 수 없어요") vs 42501이 갈려 **"그 사람이 이 글을 신고했는가"와
 *   "이 글의 작성자가 누구인가"** 가 읽혔다. 트리거가 definer라 소프트 삭제된 글까지 읽혔다.
 *
 * ⚠ **run-rls.sh는 어떤 코드로 차단됐는지 보지 않는다**(차단 기대인데 통과했는지만 본다).
 *   그래서 이 회귀는 라벨만으로는 영영 안 잡힌다 → sqlstate를 직접 찍어 대조한다.
 * ⚠ psql은 `$$ … $$` 안을 치환하지 않고 NOTICE는 stdout으로도 가지 않는다 →
 *   값은 GUC로 넣고 결과는 임시 테이블에 담아 **select로** 내보낸다.
 */
savepoint s;
reset role;
create temp table oracle_probe (step text primary key, code text);
grant insert, select on oracle_probe to authenticated;
:login_bob
insert into public.post_report (post_id, reporter_id, reason) values (:pid, :'bob', 'spam');
:login_alice
select set_config('rls.pid', :'pid', true);
select set_config('rls.bpid', :'bpid', true);
select set_config('rls.bob', :'bob', true);
\echo '[42501 / 42501 기대] 남의 명의 insert는 사유를 말하지 않는다 (오라클 회귀)'
do $$
declare
  v_pid  bigint := current_setting('rls.pid')::bigint;
  v_bpid bigint := current_setting('rls.bpid')::bigint;
  v_bob  uuid   := current_setting('rls.bob')::uuid;
begin
  -- ① bob이 **이미 신고한** 글 — 트리거의 중복 분기가 말하면 P0001로 샌다
  begin
    insert into public.post_report (post_id, reporter_id, reason) values (v_pid, v_bob, 'spam');
    insert into oracle_probe values ('1', '통과!');
  exception when others then insert into oracle_probe values ('1', sqlstate);
  end;
  -- ② bob이 **작성자인** 글 — 트리거의 자기글 분기가 말하면 P0001로 샌다
  begin
    insert into public.post_report (post_id, reporter_id, reason) values (v_bpid, v_bob, 'spam');
    insert into oracle_probe values ('2', '통과!');
  exception when others then insert into oracle_probe values ('2', sqlstate);
  end;
end $$;
select string_agg(code, ' / ' order by step) as codes from oracle_probe;
rollback to s;

savepoint s;
reset role;
create temp table oracle_probe2 (code text);
grant insert, select on oracle_probe2 to authenticated;
:login_bob
select public.soft_delete_post(:bpid);
:login_alice
select set_config('rls.bpid', :'bpid', true);
select set_config('rls.bob', :'bob', true);
\echo '    ⚠ 트리거가 definer라 삭제되어 **아무에게도 안 보이는** 글의 작성자까지 읽혔다.'
\echo '[42501 기대] 소프트 삭제된 글에도 사유를 말하지 않는다 (오라클 회귀)'
do $$
declare
  v_bpid bigint := current_setting('rls.bpid')::bigint;
  v_bob  uuid   := current_setting('rls.bob')::uuid;
begin
  insert into public.post_report (post_id, reporter_id, reason) values (v_bpid, v_bob, 'spam');
  insert into oracle_probe2 values ('통과!');
exception when others then insert into oracle_probe2 values (sqlstate);
end $$;
select code from oracle_probe2;
rollback to s;

savepoint s; :login_anon
\echo '[❌차단] 비로그인 신고 — anon에는 INSERT 권한도 정책도 없다'
insert into public.post_report (post_id, reporter_id, reason) values (:bpid, :'alice', 'spam');
rollback to s;

savepoint s;
:login_alice
select public.soft_delete_post(:pid);
:login_bob
\echo '[❌차단] 삭제된 글 신고 — post_is_alive가 막는다'
insert into public.post_report (post_id, reporter_id, reason) values (:pid, :'bob', 'spam');
rollback to s;

savepoint s; :login_alice
insert into public.post_report (post_id, reporter_id, reason) values (:bpid, :'alice', 'spam');
\echo '    ⚠ 42501을 내는 것은 **grant 부재**다(정책이 없다는 사실은 여기서 증명되지 않는다).'
\echo '      SELECT 정책을 실수로 열어도 grant가 없으면 여전히 42501이라 이 검사는 통과한다 —'
\echo '      정책 유무는 섹션 17b(RLS는 켜졌는데 정책이 0개인 테이블)가 반대편에서 지킨다.'
\echo '[❌차단] 본인이 넣은 신고도 다시 읽을 수 없다 (SELECT grant가 없다)'
select count(*) from public.post_report;
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] created_at을 실어 시각 위조 — grant 목록 밖이다'
insert into public.post_report (post_id, reporter_id, reason, created_at)
values (:bpid, :'alice', 'spam', now() - interval '1 year');
rollback to s;

rollback to s29;

-- ---------------------------------------------------------------------
\echo ''
\echo '=== 30. 입축구 (20260823000001) ==='
\echo '    설계 요약: 운영진 문항이라 **앱에서 만들 수 있는 경로가 없다**(정책도 grant도 없다).'
\echo '    유일한 생성 경로가 마이그레이션이므로 아래 insert 차단들이 그 성질을 지킨다.'
\echo '    글에 딸린 투표(섹션 27)와 갈리는 점은 부모가 없다는 것뿐 — 나머지 규약은 같다.'

-- 시드는 **superuser로** 넣는다. authenticated에는 survey·survey_option 권한이 아예 없다
-- (그게 아래 검사들이 지키는 성질이다).
savepoint s30;
insert into public.survey (title) values ('가장 좋아하는 포지션은?') returning id as sid \gset
insert into public.survey (title) values ('두 번째 입축구')         returning id as sid2 \gset
insert into public.survey_option (survey_id, label, sort_order)
values (:sid, '공격수', 1), (:sid, '미드필더', 2), (:sid, '수비수', 3);
insert into public.survey_option (survey_id, label, sort_order)
values (:sid2, '예', 1), (:sid2, '아니오', 2);
select id as sopt1 from public.survey_option where survey_id = :sid  and sort_order = 1 \gset
select id as sopt2 from public.survey_option where survey_id = :sid  and sort_order = 2 \gset
select id as sopt_other from public.survey_option where survey_id = :sid2 and sort_order = 1 \gset

\echo ''
\echo '-- 30a. 문항은 앱에서 만들 수도 고칠 수도 없다 --'

savepoint s; :login_alice
\echo '[❌차단] 입축구를 직접 만든다 — 쓰기 정책도 grant도 없다'
insert into public.survey (title) values ('내가 만든 입축구');
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 진행 중인 입축구에 선택지를 끼워 넣는다 (섹션 27과 같은 성질)'
insert into public.survey_option (survey_id, label, sort_order) values (:sid, '골키퍼', 4);
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 질문 수정 — 던져진 표의 뜻이 바뀌면 안 된다'
update public.survey set title = '바꿔치기' where id = :sid;
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 선택지 수정'
update public.survey_option set label = '바꿔치기' where id = :sopt1;
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 입축구 통째로 삭제'
delete from public.survey where id = :sid;
rollback to s;

savepoint s;
\echo '[❌차단] sort_order 5 — 선택지 상한 4는 CHECK가 강제한다 (superuser도 못 넘는다)'
insert into public.survey_option (survey_id, label, sort_order) values (:sid, '다섯째', 5);
rollback to s;

\echo ''
\echo '-- 30a-2. 분할 카드 표현 컬럼 (subtitle · bg_color · text_color) --'

savepoint s;
\echo '[❌차단] bg_color만 지정 — 대비를 보장할 수 없으니 쌍이어야 한다'
insert into public.survey_option (survey_id, label, sort_order, bg_color)
values (:sid2, '반쪽 색', 3, '#171717');
rollback to s;

savepoint s;
\echo '[❌차단] text_color만 지정 — 반대 방향도 같다'
insert into public.survey_option (survey_id, label, sort_order, text_color)
values (:sid2, '반쪽 색', 3, '#ffffff');
rollback to s;

savepoint s;
\echo '[❌차단] hex가 아닌 색 이름'
insert into public.survey_option (survey_id, label, sort_order, bg_color, text_color)
values (:sid2, '색 이름', 3, 'red', '#ffffff');
rollback to s;

savepoint s;
\echo '[❌차단] 3자리 축약 hex — 6자리만 받는다(클라이언트가 길이를 가정하지 않게)'
insert into public.survey_option (survey_id, label, sort_order, bg_color, text_color)
values (:sid2, '축약 hex', 3, '#fff', '#000000');
rollback to s;

savepoint s;
\echo '[❌차단] 부제가 보이지 않는 문자뿐 (has_visible_char)'
insert into public.survey_option (survey_id, label, sort_order, subtitle)
values (:sid2, '빈 부제', 3, U&'\200B');
rollback to s;

savepoint s;
\echo '[성공] 색 쌍 + 부제를 갖춘 정상 선택지'
insert into public.survey_option (survey_id, label, sort_order, subtitle, bg_color, text_color)
values (:sid2, '정상', 3, '부제입니다', '#171717', '#ffffff');
rollback to s;

\echo '[0 기대] **색이 일부 선택지에만 있는 입축구** — 분할 카드가 깨지는 유일한 경로다'
\echo '         (한 입축구 안에서 전부 갖거나 전부 없거나는 행 간 제약이라 CHECK로 못 쓴다)'
select count(*) from public.survey s
 where exists (select 1 from public.survey_option o
                where o.survey_id = s.id and o.bg_color is not null)
   and exists (select 1 from public.survey_option o
                where o.survey_id = s.id and o.bg_color is null);

\echo '[0 기대] **선택지가 2개 미만인 입축구** — 하한 2의 유일한 보증이다'
\echo '         (행 수는 CHECK로 셀 수 없어 이 검사가 마이그레이션 실수를 대신 잡는다)'
select count(*) from public.survey s
 where (select count(*) from public.survey_option o where o.survey_id = s.id) < 2;

\echo ''
\echo '-- 30b. 참여 --'

savepoint s; :login_bob
\echo '[성공] 첫 참여'
insert into public.survey_vote (survey_id, user_id, option_id) values (:sid, :'bob', :sopt1);
\echo '[1 기대] 내 표가 보인다'
select count(*) from public.survey_vote where survey_id = :sid;
\echo '[성공] 갈아타기 — option_id만 바꾼다'
update public.survey_vote set option_id = :sopt2 where survey_id = :sid and user_id = :'bob';
\echo '[t 기대] 갈아탄 선택지가 반영됐는가'
select option_id = :sopt2 from public.survey_vote where survey_id = :sid and user_id = :'bob';
rollback to s;

savepoint s; :login_bob
\echo '[❌차단] 남(alice) 명의로 참여'
insert into public.survey_vote (survey_id, user_id, option_id) values (:sid, :'alice', :sopt1);
rollback to s;

savepoint s; :login_anon
\echo '[❌차단] 비로그인 참여 (정책이 to authenticated다)'
insert into public.survey_vote (survey_id, user_id, option_id) values (:sid, :'bob', :sopt1);
rollback to s;

savepoint s; :login_bob
insert into public.survey_vote (survey_id, user_id, option_id) values (:sid, :'bob', :sopt1);
\echo '[❌차단] 한 사람 두 표 (복합 PK)'
insert into public.survey_vote (survey_id, user_id, option_id) values (:sid, :'bob', :sopt2);
rollback to s;

savepoint s; :login_bob
\echo '[❌차단] **다른 입축구의 선택지**로 참여 — 복합 FK가 막는다'
insert into public.survey_vote (survey_id, user_id, option_id) values (:sid, :'bob', :sopt_other);
rollback to s;

savepoint s; :login_bob
insert into public.survey_vote (survey_id, user_id, option_id) values (:sid, :'bob', :sopt1);
\echo '[❌차단] 내 표를 **다른 입축구로 옮긴다** — "취소 불가"를 우회하는 경로다'
\echo '         (컬럼 UPDATE 권한이 option_id 하나뿐이라 막힌다)'
update public.survey_vote set survey_id = :sid2, option_id = :sopt_other
 where survey_id = :sid and user_id = :'bob';
rollback to s;

savepoint s; :login_bob
\echo '[❌차단] created_at을 실어 시각 위조 — insert grant 목록 밖이다'
insert into public.survey_vote (survey_id, user_id, option_id, created_at)
values (:sid, :'bob', :sopt1, now() - interval '1 year');
rollback to s;

savepoint s; :login_bob
insert into public.survey_vote (survey_id, user_id, option_id) values (:sid, :'bob', :sopt1);
\echo '[❌차단] 참여 취소 — DELETE 정책도 grant도 없다 (갈아타기만 된다)'
delete from public.survey_vote where survey_id = :sid and user_id = :'bob';
rollback to s;

\echo ''
\echo '-- 30c. 결과 게이팅 — 참여한 사람만 집계를 본다 --'

savepoint s;
:login_bob
insert into public.survey_vote (survey_id, user_id, option_id) values (:sid, :'bob', :sopt1);

\echo '[1 / 1 기대] 참여자(bob)에게는 집계가 열린다 (행 1개 · 1표)'
select count(*) as rows, coalesce(sum(vote_count), 0) as votes from public.survey_results(:sid);

:login_alice
\echo '[0 기대] **미참여자(alice)에게는 0행** — 게이팅이 화면이 아니라 함수 안에 있다'
select count(*) from public.survey_results(:sid);
\echo '[0 기대] 남의 표는 애초에 보이지 않는다 (SELECT 정책이 "내 행만")'
select count(*) from public.survey_vote;

\echo '[성공] alice도 참여하면'
insert into public.survey_vote (survey_id, user_id, option_id) values (:sid, :'alice', :sopt2);
\echo '[2 / 2 기대] 집계가 열리고 두 사람의 표가 각각 잡힌다'
select count(*) as rows, coalesce(sum(vote_count), 0) as votes from public.survey_results(:sid);

\echo '[성공] alice가 bob과 같은 선택지로 갈아탄다'
update public.survey_vote set option_id = :sopt1 where survey_id = :sid and user_id = :'alice';
\echo '[1 / 2 기대] 집계가 따라 움직인다 — 행이 하나로 합쳐지고 총합은 그대로다'
select count(*) as rows, coalesce(sum(vote_count), 0) as votes from public.survey_results(:sid);
rollback to s;

savepoint s;
:login_anon
\echo '[❌차단] 비로그인은 survey_results EXECUTE 권한 자체가 없다'
select count(*) from public.survey_results(:sid);
rollback to s;

savepoint s; :login_anon
\echo '[3 기대] 다만 입축구와 선택지는 비로그인에게도 보인다 (참여만 로그인이 필요하다)'
\echo '         ⚠ 시드에도 입축구가 있어 전체 개수는 세지 않는다 — 이 섹션이 만든 것만 본다'
select (select count(*) from public.survey where id = :sid)
     + (select count(*) from public.survey where id = :sid2)
     + (select count(*) from public.survey_option where survey_id = :sid and sort_order = 1) as visible;
\echo '[0 기대] survey_vote는 grant는 있지만 정책이 to authenticated라 0행이다'
\echo '         (grant를 빼면 임베딩이 42501로 죽어 비로그인에게 입축구가 통째로 안 보인다)'
select count(*) from public.survey_vote;
rollback to s;

\echo ''
\echo '-- 30c-2. 면 배경 이미지 (image_path · survey-images 버킷) --'

savepoint s;
\echo '[❌차단] 경로 탈출 — `..`가 낀 경로는 URL 정규화로 남의 폴더를 가리킨다(아바타 실측 사례)'
insert into public.survey_option (survey_id, label, sort_order, image_path)
values (:sid2, '탈출', 3, '4/../9/x.png');
rollback to s;

savepoint s;
\echo '[❌차단] 세그먼트 하나짜리 경로 (폴더가 survey id여야 한다)'
insert into public.survey_option (survey_id, label, sort_order, image_path)
values (:sid2, '한칸', 3, 'x.png');
rollback to s;

savepoint s;
\echo '[❌차단] 전체 URL을 넣는다 — 컬럼은 **경로**만 담는다(호스트가 환경마다 다르다)'
insert into public.survey_option (survey_id, label, sort_order, image_path)
values (:sid2, 'URL', 3, 'http://127.0.0.1:64321/storage/v1/object/public/survey-images/4/x.png');
rollback to s;

savepoint s;
\echo '[❌차단] 허용하지 않는 확장자'
insert into public.survey_option (survey_id, label, sort_order, image_path)
values (:sid2, 'svg', 3, '4/x.svg');
rollback to s;

savepoint s;
\echo '[성공] 정상 경로'
insert into public.survey_option (survey_id, label, sort_order, image_path)
values (:sid2, '정상', 3, '4/messi.png');
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 로그인 유저가 survey-images에 업로드 — 쓰기 정책이 없다'
insert into storage.objects (bucket_id, name, owner) values ('survey-images', '4/hack.png', :'alice');
rollback to s;

\echo '    ⚠ **버킷 설정 자체가 방어선이다.** 이 버킷에는 쓰기 정책이 없어 앱에서 올릴 수'
\echo '      없지만, service_role로 도는 배포 스크립트는 이 값만 통과하면 무엇이든 올린다.'
\echo '      정책만 검사하면 크기·타입이 조용히 넓어져도 아무도 모른다(24c와 같은 이유).'
\echo '[t/1048576/t 기대] 공개 · 1MiB 상한 · webp/jpeg/png만'
select public                                                   as is_public,
       file_size_limit,
       allowed_mime_types @> array['image/webp','image/jpeg','image/png']
         and array_length(allowed_mime_types, 1) = 3             as mime_exact
  from storage.buckets where id = 'survey-images';

\echo ''
\echo '-- 30d. 기간(마감) — 쓰기만 막고 읽기는 열어 둔다 --'

-- 마감된 입축구를 하나 만든다. ⚠ superuser라 created_at·closes_at을 직접 넣을 수 있다
--   (authenticated에는 survey 쓰기 권한이 아예 없다).
savepoint s;
insert into public.survey (title, created_at, closes_at)
values ('마감된 입축구', now() - interval '30 days', now() - interval '23 days')
returning id as csid \gset
insert into public.survey_option (survey_id, label, sort_order)
values (:csid, '예', 1), (:csid, '아니오', 2);
select id as copt1 from public.survey_option where survey_id = :csid and sort_order = 1 \gset
select id as copt2 from public.survey_option where survey_id = :csid and sort_order = 2 \gset

savepoint s2; :login_bob
\echo '[❌차단] **마감된 입축구에 투표** — 이번 기능의 실제 방어선이다'
insert into public.survey_vote (survey_id, user_id, option_id) values (:csid, :'bob', :copt1);
rollback to s2;

-- 마감 전에 던진 표가 있는 상황을 만든다(소유자로 넣어 정책을 지나지 않는다)
insert into public.survey_vote (survey_id, user_id, option_id) values (:csid, :'bob', :copt1);

savepoint s2; :login_bob
\echo '[UPDATE 0 기대] 마감된 입축구에서 갈아타기 — using이 후보에서 빼 조용히 0행이 된다'
update public.survey_vote set option_id = :copt2
 where survey_id = :csid and user_id = :'bob';
rollback to s2;

savepoint s2; :login_bob
\echo '[1 기대] 마감돼도 **내 표는 조회된다** (SELECT 정책에 만료를 걸지 않았다)'
select count(*) from public.survey_vote where survey_id = :csid;
\echo '[1 / 1 기대] 마감돼도 **참여자는 결과를 본다** (survey_results에도 걸지 않았다)'
select count(*) as rows, coalesce(sum(vote_count), 0) as votes from public.survey_results(:csid);
rollback to s2;

savepoint s2; :login_alice
\echo '[0 기대] 마감됐어도 미참여자에게는 여전히 0행 — 게이팅은 그대로다'
select count(*) from public.survey_results(:csid);
rollback to s2;

savepoint s2; :login_bob
\echo '[성공] 진행 중인 입축구에는 여전히 투표된다 (만료 조건이 과잉 차단하지 않는다)'
insert into public.survey_vote (survey_id, user_id, option_id) values (:sid2, :'bob', :sopt_other);
rollback to s2;
rollback to s;

savepoint s;
\echo '[❌차단] closes_at이 created_at보다 앞선다 (CHECK)'
insert into public.survey (title, created_at, closes_at)
values ('거꾸로', now(), now() - interval '1 day');
rollback to s;

savepoint s;
insert into public.survey (title) values ('기본 기간') returning id as dsid \gset
\echo '[t 기대] 기본값이 created_at + 7일인가'
select closes_at = created_at + interval '7 days' as seven_days
  from public.survey where id = :dsid;
rollback to s;

rollback to s30;

-- ---------------------------------------------------------------------
\echo ''
\echo '=== 31. 승부예측 (20260830000002) ==='
\echo '    설계 요약: 일정·결과는 운영 데이터라 앱에서 만들 수 없다(정책도 grant도 없다).'
\echo '    사용자가 쓰는 표면은 match_prediction 하나뿐이고, 마감은 킥오프가 정한다.'
\echo '    입축구(섹션 30)와 갈리는 핵심은 **집계 게이팅의 축**이다 — 저쪽은 "참여했는가",'
\echo '    이쪽은 "킥오프가 지났는가"이고 지난 뒤에는 비로그인에게도 열린다.'

-- 시드는 **superuser로** 넣는다. authenticated에는 team·match 권한이 아예 없다
-- (그게 아래 검사들이 지키는 성질이다).
-- ⚠ 시각을 리터럴로 박지 않는다 — now() 기준 상대값이라야 시간이 흘러도 "예정/종료"의
--   뜻이 유지된다(입축구의 closes_at 검사와 같은 이유).
-- ⚠ **팀 코드를 테스트 전용 네임스페이스로 둔다.** 처음엔 실제 구단 슬러그를 썼는데,
--   동기화 스크립트(`scripts/sync-matches.mjs`)가 팀 이름을 슬러그로 만들어 **같은 코드를
--   먼저 넣어 두면** 이 seed가 `team_pkey` 중복으로 죽는다. 그러면 뒤따르는 `\gset`이 전부
--   비어 40건이 연쇄로 실패한다(실측) — 검사가 죽었는데 원인은 검사와 무관한 자리다.
--   `match.external_id`는 숫자 문자열(API id)이라 'm-open' 같은 값과 겹칠 일이 없다.
savepoint s31;
insert into public.team (code, name, short_name, external_id) values
  ('rlstest-a', '알파FC',  'AAA', 'rlstest-t-a'),
  ('rlstest-b', '베타FC',  'BBB', 'rlstest-t-b'),
  ('rlstest-c', '감마FC',  'CCC', 'rlstest-t-c');

insert into public.match (season, matchday, home_team, away_team, kickoff_at, external_id)
values ('2025-26', 12, 'rlstest-a', 'rlstest-b', now() + interval '3 days', 'm-open')
returning id as m_open \gset
insert into public.match (season, matchday, home_team, away_team, kickoff_at, external_id)
values ('2025-26', 11, 'rlstest-c', 'rlstest-a', now() - interval '2 days', 'm-past')
returning id as m_past \gset

\echo ''
\echo '-- 31a. 일정·결과는 앱에서 만들 수도 고칠 수도 없다 --'

savepoint s; :login_alice
\echo '[❌차단] 팀을 직접 만든다 — 쓰기 정책도 grant도 없다'
insert into public.team (code, name, short_name) values ('fake', '가짜FC', 'FAK');
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 경기를 직접 만든다'
insert into public.match (season, matchday, home_team, away_team, kickoff_at, external_id)
values ('2025-26', 1, 'rlstest-a', 'rlstest-c', now() + interval '1 day', 'm-fake');
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 스코어 조작 — 정답이 여기서 파생되므로 이게 곧 적중 조작이다'
update public.match set home_score = 9, away_score = 0 where id = :m_past;
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 킥오프를 미뤄 마감을 늘린다'
update public.match set kickoff_at = now() + interval '10 days' where id = :m_past;
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 경기 삭제'
delete from public.match where id = :m_open;
rollback to s;

\echo ''
\echo '-- 31b. 예측 — 명의·중복·취소 --'

savepoint s; :login_bob
\echo '[성공 기대] 킥오프 전이면 예측할 수 있다'
insert into public.match_prediction (match_id, user_id, pick) values (:m_open, :'bob', 'home');
\echo '[성공 기대] 킥오프 전이면 갈아탈 수 있다 (오클릭 구제·라인업 발표 반영)'
update public.match_prediction set pick = 'draw' where match_id = :m_open and user_id = :'bob';
\echo '[1 기대] 갈아타도 행은 하나다 (기본키가 "한 사람 한 표"를 겸한다)'
select count(*) as my_rows from public.match_prediction where match_id = :m_open and user_id = :'bob';
rollback to s;

-- ⚠ **시드를 과거로 민다.** `now()`는 트랜잭션 시작 시각이라, 같은 트랜잭션에서 넣고 고치면
--   insert의 default와 트리거가 찍는 값이 **같아져** 검사가 아무것도 증명하지 못한다
--   (섹션 2의 updated_at 검사가 같은 함정을 밟았다). 시각을 실을 수 있는 것은 컬럼 권한을
--   지나지 않는 superuser뿐이므로 시드는 로그인 전에 넣는다.
savepoint s;
insert into public.match_prediction (match_id, user_id, pick, created_at, updated_at)
values (:m_open, :'bob', 'home', now() - interval '1 hour', now() - interval '1 hour');
:login_bob
update public.match_prediction set pick = 'draw' where match_id = :m_open and user_id = :'bob';
\echo '[t 기대] 갈아탄 흔적이 남는다 (updated_at > created_at — 트리거가 찍는다)'
select updated_at > created_at as touched
  from public.match_prediction where match_id = :m_open and user_id = :'bob';
rollback to s;

savepoint s;
insert into public.match_prediction (match_id, user_id, pick, created_at, updated_at)
values (:m_open, :'bob', 'home', now() - interval '1 hour', now() - interval '1 hour');
:login_bob
update public.match_prediction set pick = 'home' where match_id = :m_open and user_id = :'bob';
\echo '[f 기대] **같은 값으로 덮으면 흔적이 남지 않는다** (트리거의 when 절이 좁힌다 —'
\echo '        post_touch_updated_at이 좋아요 UPDATE에도 발화해 "수정됨"이 잘못 붙었던 사고)'
select updated_at > created_at as touched
  from public.match_prediction where match_id = :m_open and user_id = :'bob';
rollback to s;

savepoint s; :login_bob
insert into public.match_prediction (match_id, user_id, pick) values (:m_open, :'bob', 'home');
\echo '[❌차단] 같은 경기에 두 번째 표 — 제약이 막는다(애플리케이션 로직이 아니다)'
insert into public.match_prediction (match_id, user_id, pick) values (:m_open, :'bob', 'away');
rollback to s;

savepoint s; :login_bob
\echo '[❌차단] 남의 명의로 예측'
insert into public.match_prediction (match_id, user_id, pick) values (:m_open, :'alice', 'home');
rollback to s;

savepoint s; :login_anon
\echo '[❌차단] 비로그인 예측'
insert into public.match_prediction (match_id, user_id, pick) values (:m_open, :'bob', 'home');
rollback to s;

savepoint s; :login_bob
insert into public.match_prediction (match_id, user_id, pick) values (:m_open, :'bob', 'home');
\echo '[❌차단] 예측 취소 — DELETE는 **grant 자체가 없어** 42501이다'
\echo '        (정책 부재는 0행이지만 grant 부재가 먼저 걸린다 — 두 겹이 다 서 있다)'
delete from public.match_prediction where match_id = :m_open and user_id = :'bob';
rollback to s;

savepoint s; :login_bob
insert into public.match_prediction (match_id, user_id, pick) values (:m_open, :'bob', 'home');
\echo '[❌차단] 표를 다른 경기로 옮겨 "취소 불가"를 우회 — match_id에 UPDATE 권한이 없다'
update public.match_prediction set match_id = :m_past where match_id = :m_open and user_id = :'bob';
rollback to s;

savepoint s; :login_bob
insert into public.match_prediction (match_id, user_id, pick) values (:m_open, :'bob', 'home');
\echo '[❌차단] 소유권 이전 — user_id에 UPDATE 권한이 없다(with check도 함께 막는다)'
update public.match_prediction set user_id = :'alice' where match_id = :m_open and user_id = :'bob';
rollback to s;

savepoint s; :login_bob
\echo '[❌차단] created_at 위조 — 컬럼 INSERT 권한이 없다'
insert into public.match_prediction (match_id, user_id, pick, created_at)
values (:m_open, :'bob', 'home', now() - interval '30 days');
rollback to s;

savepoint s; :login_bob
insert into public.match_prediction (match_id, user_id, pick) values (:m_open, :'bob', 'home');
:login_alice
\echo '[0 기대] 남의 예측은 애초에 보이지 않는다 (SELECT 정책이 "내 행만")'
select count(*) as others from public.match_prediction where match_id = :m_open;
rollback to s;

\echo ''
\echo '-- 31c. 마감은 킥오프가 정한다 --'

savepoint s; :login_bob
\echo '[❌차단] 킥오프가 지난 경기에 예측'
insert into public.match_prediction (match_id, user_id, pick) values (:m_past, :'bob', 'home');
rollback to s;

savepoint s;
insert into public.match_prediction (match_id, user_id, pick) values (:m_past, :'bob', 'home');
:login_bob
\echo '[UPDATE 0 기대] 킥오프 후 갈아타기 — using이 후보에서 빼 조용히 0행이 된다'
update public.match_prediction set pick = 'away' where match_id = :m_past and user_id = :'bob';
\echo '[1 기대] 마감돼도 **내 예측은 조회된다** (SELECT 정책에 마감을 걸지 않았다)'
select count(*) as mine from public.match_prediction where match_id = :m_past and user_id = :'bob';
rollback to s;

savepoint s;
update public.match set voided_at = now() where id = :m_open;
:login_bob
\echo '[❌차단] 취소된 경기에 예측 (match_is_open이 voided_at도 본다)'
insert into public.match_prediction (match_id, user_id, pick) values (:m_open, :'bob', 'home');
rollback to s;

\echo ''
\echo '-- 31d. 집계 게이팅 — 축이 "참여"가 아니라 "킥오프"다 --'

savepoint s;
insert into public.match_prediction (match_id, user_id, pick) values (:m_open, :'bob', 'home');
:login_bob
\echo '[0 기대] 킥오프 전에는 **참여자 본인에게도** 안 보인다'
\echo '        ⚠ 여기를 미참여자(alice)로 조회하면 게이팅이 survey_results처럼 "참여했으면'
\echo '          보인다"로 퇴행해도 검사가 그대로 통과한다 — 그 퇴행이야말로 이 기능의 전제를'
\echo '          무너뜨리는 회귀(마감 전 분포 노출 → 다수파 추종 → 적중률 오염)라 본인으로 본다.'
select count(*) as rows_for_participant from public.match_prediction_results(:m_open);
:login_alice
\echo '[0 기대] 미참여자에게도 물론 안 보인다'
select count(*) as rows_for_others from public.match_prediction_results(:m_open);
:login_anon
\echo '[0 기대] 비로그인에게도 안 보인다 (마감 후에만 열린다)'
select count(*) as rows_for_anon from public.match_prediction_results(:m_open);
rollback to s;

savepoint s;
insert into public.match_prediction (match_id, user_id, pick) values (:m_past, :'bob', 'home');
insert into public.match_prediction (match_id, user_id, pick) values (:m_past, :'alice', 'home');
:login_anon
\echo '[1 / 2 기대] 킥오프 후에는 **비로그인에게도** 열린다 (크롤러가 보는 콘텐츠다)'
select count(*) as rows, sum(vote_count) as votes from public.match_prediction_results(:m_past);
rollback to s;

savepoint s;
insert into public.match_prediction (match_id, user_id, pick) values (:m_past, :'bob', 'home');
:login_alice
\echo '[t 기대] 참여하지 않아도 마감 후면 보인다 — 입축구와 정반대다(저쪽은 미참여자에게 0행)'
select count(*) > 0 as visible_to_non_participant from public.match_prediction_results(:m_past);
rollback to s;

\echo ''
\echo '-- 31e. 채점 — 정답은 컬럼이 아니라 스코어에서 파생된다 --'

savepoint s;
\echo '[t 기대] 스코어가 없으면 result도 없다 (= 아직 채점 대상이 아니다)'
select result is null as unscored from public.match where id = :m_past;

update public.match set home_score = 2, away_score = 1, finished_at = now() where id = :m_past;
\echo '[home 기대] 스코어를 넣으면 정답이 파생된다'
select result from public.match where id = :m_past;

\echo '[t 기대] **스코어를 정정하면 정답이 따라 움직인다** — 재채점을 손으로 하지 않는 근거다'
update public.match set home_score = 0 where id = :m_past;
select result = 'away' as rescored from public.match where id = :m_past;

\echo '[t 기대] 무효 처리하면 result가 null이 되어 채점에서 빠진다'
\echo '        (voided_at을 따로 거르는 술어를 두지 않기 위해서다 — 빠뜨리는 조회가 반드시 생긴다)'
update public.match set voided_at = now() where id = :m_past;
select result is null as excluded from public.match where id = :m_past;
rollback to s;

savepoint s;
update public.match set home_score = 1, away_score = 1, finished_at = now() where id = :m_past;
insert into public.match_prediction (match_id, user_id, pick) values (:m_past, :'bob', 'draw');
insert into public.match_prediction (match_id, user_id, pick) values (:m_past, :'alice', 'home');
\echo '[1 / 2 기대] 적중률은 컬럼이 아니라 원본과 result를 대조해 그때그때 센다'
\echo '        ⚠ **반드시 이 경기로 좁힌다.** 좁히지 않으면 DB에 이미 있는 채점 완료 경기가'
\echo '          전부 합산된다 — 지금 통과하는 것은 동기화된 경기에 스코어가 없어서일 뿐이고,'
\echo '          종료 경기가 하나만 들어와도 값이 틀어진다(실측: 3/8). 게다가 run-rls.sh는'
\echo '          값 검사를 자동 대조하지 않아 "✅ 통과"인 채로 지나간다(31a의 팀 코드 충돌과'
\echo '          같은 원인 — 운영 데이터가 검사에 새어 든다).'
select count(*) filter (where p.pick = m.result) as hits, count(*) as total
  from public.match_prediction p
  join public.match m on m.id = p.match_id
 where p.match_id = :m_past and m.result is not null and m.voided_at is null;
rollback to s;

\echo ''
\echo '-- 31f. 스키마 불변식 --'

savepoint s;
\echo '[❌차단] 같은 팀끼리 붙는 경기'
insert into public.match (season, matchday, home_team, away_team, kickoff_at, external_id)
values ('2025-26', 1, 'rlstest-a', 'rlstest-a', now() + interval '1 day', 'm-self');
rollback to s;

savepoint s;
\echo '[❌차단] 한쪽 스코어만 — result가 뜻을 갖지 못한다'
update public.match set home_score = 1 where id = :m_past;
rollback to s;

savepoint s;
\echo '[❌차단] 스코어 없이 종료 표시'
update public.match set finished_at = now() where id = :m_past;
rollback to s;

savepoint s;
\echo '[❌차단] 시즌 형식 위반 (동기화 스크립트의 필드 오매핑을 여기서 잡는다)'
insert into public.match (season, matchday, home_team, away_team, kickoff_at, external_id)
values ('2025', 1, 'rlstest-a', 'rlstest-c', now() + interval '1 day', 'm-badseason');
rollback to s;

savepoint s;
\echo '[❌차단] 라운드 39 — EPL 상한 밖'
insert into public.match (season, matchday, home_team, away_team, kickoff_at, external_id)
values ('2025-26', 39, 'rlstest-a', 'rlstest-c', now() + interval '1 day', 'm-badround');
rollback to s;

savepoint s;
\echo '[❌차단] external_id 중복 — 동기화 재실행이 행을 늘리면 안 된다'
insert into public.match (season, matchday, home_team, away_team, kickoff_at, external_id)
values ('2025-26', 5, 'rlstest-b', 'rlstest-c', now() + interval '1 day', 'm-past');
rollback to s;

rollback to s31;

rollback;
\echo ''
\echo '=== 끝 (전체 rollback — DB에 흔적을 남기지 않는다) ==='
