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
-- ⚠ :login_anon은 role만 바꾸고 request.jwt.claims를 그대로 둔다 — 앞선 :login_alice의 sub가 남아
--   auth.uid()가 계속 그 사람을 가리킨다. 판정이 auth.uid()에 걸린 검사는 claims까지 비워야
--   진짜 비로그인이 된다(정책이 `to authenticated`인 검사는 role만으로 갈려 이 함정에 걸리지 않는다).
\set login_anon  'set local role anon;'
\set QUIET off

begin;

-- ⚠ 시드 INSERT는 반드시 begin 아래에 둔다 — 위에 두면 오토커밋으로 새어나가 실행할 때마다
--   행이 DB에 쌓인다("전체 rollback — 흔적을 남기지 않는다"는 말미 주석이 거짓이 된다).
-- ⚠ 시각을 비교하는 검사는 시드를 과거로 민다 — now()는 **트랜잭션 시작 시각**이라 한 트랜잭션
--   안에서는 insert의 default now()와 트리거의 now()가 같은 값이 된다.

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
-- ⚠ 이적시장 테이블의 비로그인 쓰기는 섹션 35a·36a·36d가 본다.
savepoint s; :login_anon
\echo '[❌차단] profiles update'
update public.profiles set nickname = 'x' where id = :'alice';
rollback to s;

\echo ''
\echo '=== 12. profiles — 행 자체는 가입/탈퇴 트리거만 만들고 지운다 ==='
\echo '    수정 권한 검사는 섹션 24가 갖는다. 여기는 insert/delete만 본다.'
savepoint s; :login_alice
\echo '[❌차단] profiles 직접 insert (가입 트리거 전용)'
insert into public.profiles (id, nickname) values (gen_random_uuid(), 'ghost');
rollback to s;
savepoint s; :login_alice
\echo '[❌차단] profiles 직접 delete (cascade 전용)'
delete from public.profiles where id = :'bob';
rollback to s;

\echo '   ⚠ profiles의 SELECT grant는 컬럼 목록으로 좁혀 두었다 — 컬럼을 더할 때 grant를 빠뜨리면'
\echo '     그 컬럼만 조용히 42501이 되는데 섹션 17a는 SELECT를 보지 않는다. 목록이 늘거나 줄면 여기서 갈린다.'
\echo '[0 기대] anon·authenticated가 SELECT할 수 있는 profiles 컬럼이 화이트리스트와 정확히 같다'
select count(*) from (
  select c.column_name
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = 'profiles'
     and (has_column_privilege('anon',          'public.profiles', c.column_name, 'SELECT')
       or has_column_privilege('authenticated', 'public.profiles', c.column_name, 'SELECT'))
  except
  select unnest(array['id', 'nickname', 'created_at', 'avatar_path'])
) t;
\echo '[0 기대] 그 반대 방향 — 화이트리스트에 있는데 못 읽는 컬럼'
select count(*) from (
  select unnest(array['id', 'nickname', 'created_at', 'avatar_path']) as column_name
  except
  select c.column_name
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = 'profiles'
     and has_column_privilege('authenticated', 'public.profiles', c.column_name, 'SELECT')
) t;

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

-- ---------------------------------------------------------------------
\echo ''
\echo '=== 17. 신규 객체 전수 가드 — 0행이어야 정상 ==='
\echo '  (테이블명을 하드코딩한 검사들과 달리, 앞으로 만들 테이블·함수까지 자동으로 걸린다.'
\echo '   public 스키마의 기본 권한이 anon/authenticated에 ALL이라, 새 마이그레이션이'
\echo '   revoke를 한 번만 잊어도 즉시 구멍이 된다 — 손으로 반복하는 규칙은 언젠가 빠진다)'
reset role;

\echo '⚠ 이 섹션의 네 질의는 전부 **[0행 기대] 라벨을 달고 있어야 한다.** 라벨이 없으면'
\echo '  run-rls.sh의 값 대조(③)가 이 질의를 보지 않아, 행이 나와도 "✅ 통과"로 넘어간다 —'
\echo '  실제로 그랬다(anon에 새 함수를 열었는데 17d가 행을 뱉은 채 통과했다).'
\echo '  전수 가드가 러너에 안 잡히면 가드가 아니다.'
\echo '-- 17a. RLS가 꺼졌거나 anon에 쓰기 권한이 남은 테이블'
\echo '   ⚠ **has_table_privilege만으로는 부족하다.** 컬럼 단위 grant는 그 함수가 false를'
\echo '     돌려준다(실측: 컬럼 목록으로 grant insert를 준 테이블에서도'
\echo '     has_table_privilege(...,INSERT)는 f였다). 그래서 has_any_column_privilege를 함께 본다 —'
\echo '     안 그러면 "revoke를 한 번만 잊어도 즉시 걸린다"는 이 검사의 선언이 컬럼 grant에'
\echo '     대해서는 거짓이 된다.'
\echo '   ⚠ DELETE는 컬럼 단위 권한이 아니라 has_any_column_privilege가 거부한다'
\echo '     (unrecognized privilege type) → 그쪽만 has_table_privilege로 본다.'
\echo '   ⚠ authenticated의 INSERT/UPDATE는 여기서 세지 않는다 — 정상 기능이 그걸로 돈다.'
\echo '     대신 **DELETE와 TRUNCATE**를 본다(관심·댓글·댓글 표만 정당한 DELETE 대상이다).'
\echo '[0행 기대] RLS가 꺼졌거나 anon에 쓰기 권한이 남은 테이블'
select c.relname,
       c.relrowsecurity                                          as rls_on,
       has_any_column_privilege('anon', c.oid, 'INSERT')         as anon_insert,
       has_any_column_privilege('anon', c.oid, 'UPDATE')         as anon_update,
       has_table_privilege('anon', c.oid, 'DELETE')              as anon_delete,
       has_table_privilege('anon', c.oid, 'TRUNCATE')            as anon_truncate,
       has_table_privilege('authenticated', c.oid, 'DELETE')     as auth_delete,
       has_table_privilege('authenticated', c.oid, 'TRUNCATE')   as auth_truncate
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
   and (not c.relrowsecurity
        or has_any_column_privilege('anon', c.oid, 'INSERT')
        or has_any_column_privilege('anon', c.oid, 'UPDATE')
        or has_table_privilege('anon', c.oid, 'DELETE')
        or has_table_privilege('anon', c.oid, 'TRUNCATE')
        or has_table_privilege('authenticated', c.oid, 'TRUNCATE')
        -- 아래 셋만 정당하다 — 전부 자기 행만 지우는 DELETE 정책이 있다.
        --   transfer_deal_watch(관심 빼기) · transfer_deal_comment(내 댓글 삭제) ·
        --   transfer_deal_comment_vote(표 거두기)
        -- 새 테이블에 DELETE를 열면 여기 이름을 더하고 사유를 적는다.
        or (has_table_privilege('authenticated', c.oid, 'DELETE')
            and c.relname not in ('transfer_deal_watch', 'transfer_deal_comment',
                                  'transfer_deal_comment_vote')));

\echo '-- 17b. RLS는 켜졌는데 정책이 하나도 없는 테이블 (전면 차단이 의도인지 확인 필요)'
\echo '[0행 기대] 정책이 없는 RLS 테이블'
select c.relname
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
   and not exists (select 1 from pg_policy p where p.polrelid = c.oid);

\echo '-- 17c. security definer인데 search_path가 고정되지 않은 함수'
\echo '[0행 기대] search_path가 고정되지 않은 definer 함수'
select p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prosecdef
   and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
                    where cfg like 'search\_path=%');

\echo '-- 17d. anon이 EXECUTE 가능한 함수 중 화이트리스트 밖'
\echo '   허용: has_visible_char·normalize_nickname·is_plain_nickname — 전부 **CHECK 평가 함수**다.'
\echo '        CHECK 안의 함수는 호출자 권한으로 평가되므로 닫으면 그 테이블의 쓰기(가입·닉네임'
\echo '        변경)가 전부 42501로 죽는다. 셋 다 호출자가 넘긴 문자열의 형태만 돌려준다.'
\echo '   ⚠ 비로그인이 부르는 RPC·정책 헬퍼를 새로 열면 여기 이름과 사유를 함께 더한다.'
\echo '[0행 기대] 화이트리스트 밖에서 anon에 열린 함수'
select p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and has_function_privilege('anon', p.oid, 'EXECUTE')
   and p.proname not in ('has_visible_char', 'normalize_nickname', 'is_plain_nickname');

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
    or char_length(n) not between 1 and 20
    or not public.is_plain_nickname(n);   -- 20260910000001: 한글·영문·숫자만
rollback to s;

savepoint s;
\echo '[0행 기대] **조합을 포화시켜 폴백 경로를 실제로 태운다** — 480조합을 다 쓰면'
\echo '           handle_new_user가 md5 접미사로 탈출하는데, 그 값도 CHECK를 만족해야 한다'
-- 🔴 이 검사가 지키는 것: 폴백은 한때 `left(닉,13) || '-' || md5…`였고, 하이픈은
--    profiles_nickname_plain(20260910000001)이 거부한다. 그대로 뒀다면 조합이 포화되는
--    순간부터 **그 사용자의 가입이 영구히 실패**했다 — 재시도 루프 안이라 무한 루프가 된다.
--    실측: 500명 연속 가입에서 폴백이 25번 발동했다(즉 이 검사는 실제로 그 경로를 탄다).
-- ⚠ 표현식을 복제해 검사하지 않는다. 폴백은 트리거 **내부** 로직이라 직접 부를 수 없고,
--    복제하면 트리거를 고쳤을 때 검사만 옛 표현식을 통과시킨다 → 실제로 포화시킨다.
-- ⚠ 500은 480(=24×20)을 넘겨야 한다는 뜻이다. 조합 목록을 늘리면 이 수도 함께 올린다.
select nickname, char_length(nickname) as len from (
  select pg_temp.mkuser(null, 'saturate' || g || '@example.com') as nickname
    from generate_series(1, 500) as g
) t
 where not public.is_plain_nickname(nickname)
    or char_length(nickname) not between 1 and 20;
rollback to s;

savepoint s;
\echo '[t 기대] 그 포화 검사가 정말 폴백을 태웠는가 — md5 접미사가 붙은 닉네임이 나온다'
\echo '         (이 검사가 0이 되면 위 검사는 폴백을 전혀 보지 못하고 통과하는 셈이다)'
select count(*) > 0 as fallback_actually_fired from (
  select pg_temp.mkuser(null, 'probe' || g || '@example.com') as nickname
    from generate_series(1, 500) as g
) t
 where nickname ~ '[0-9a-f]{6}$';
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

savepoint s;
\echo '[전부 t 기대] NFC로 접는다 — 자모 분해형과 완성형이 같은 값이 된다'
\echo '              (macOS에서 복사한 한글이 이 형태로 오고, NFC 없이는 가-힣 범위를 벗어난다)'
select public.normalize_nickname(U&'\1112\1161\11AB') = '한'  as nfd_folded,
       public.is_plain_nickname(public.normalize_nickname(U&'\1112\1161\11AB'))
                                                                as nfd_then_plain,
       not public.is_plain_nickname(U&'\1112\1161\11AB')      as raw_nfd_rejected,
       -- ⚠ NFKC가 아니다: 전각 A는 접히지 **않아야** 한다(접히면 동형이의가 통과한다)
       public.normalize_nickname(U&'\FF21') = U&'\FF21'         as fullwidth_kept;
rollback to s;

\echo ''
\echo '--- 23c. 닉네임 허용 문자 (is_plain_nickname · 20260910000001)'
\echo '    한글 음절·한글 자모·영문·숫자만. 공백도 받지 않는다.'
\echo '    ⚠ 문자 집합은 src/shared/lib/text.ts의 isPlainNickname과 한 쌍이다 — 한쪽만 고치지 말 것.'
savepoint s;
\echo '[전부 t 기대] 허용 문자는 통과한다'
select public.is_plain_nickname('손흥민')           as hangul,
       public.is_plain_nickname('ㅋㅋ부장')          as jamo_mixed,
       public.is_plain_nickname(U&'\3160\3160')     as jamo_only,
       public.is_plain_nickname('abc123')           as alnum,
       public.is_plain_nickname('ABCdef')           as mixed_case,
       public.is_plain_nickname('a')                as single_char;
rollback to s;
savepoint s;
\echo '[전부 t 기대] 그 밖의 문자는 거부한다 — 공백·이모지·특수문자·타 문자체계'
\echo '              키릴 a·전각 A는 **사칭 벡터**다(라틴 글자와 화면에서 구분되지 않는다)'
select not public.is_plain_nickname('손 흥민')      as space,
       not public.is_plain_nickname('손흥민⚽')      as emoji,
       not public.is_plain_nickname('son_min')      as underscore,
       not public.is_plain_nickname('son-min')      as hyphen,
       not public.is_plain_nickname('nick.name')    as dot,
       not public.is_plain_nickname('<script>')     as tag,
       not public.is_plain_nickname('漢字')          as hanja,
       not public.is_plain_nickname('カナ')          as kana,
       not public.is_plain_nickname(U&'\0430' || 'lice') as cyrillic_a,
       not public.is_plain_nickname(U&'\FF21' || 'BC')   as fullwidth_a,
       not public.is_plain_nickname('')             as empty;
rollback to s;
savepoint s;
\echo '[t 기대] 자모 범위의 상한이 ㅣ(U+3163)다 — 다음 문자 U+3164는 HANGUL FILLER로'
\echo '         화면에 아무것도 그리지 않는다. 한 글자만 넓혀도 보이지 않는 닉네임이 돌아온다'
select not public.is_plain_nickname(U&'\3164') as hangul_filler_rejected;
rollback to s;
savepoint s;
\echo '[0행 기대] 기존 행이 전부 허용 문자다 (profiles_nickname_plain)'
select id, nickname from public.profiles where not public.is_plain_nickname(nickname);
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
\echo '[❌차단] 이모지 닉네임 (profiles_nickname_plain — 20260910000001)'
update public.profiles set nickname = '손흥민⚽' where id = :'alice';
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 공백이 든 닉네임 — 트리거가 공백을 하나로 접지만 **없애지는 않는다**'
\echo '         (정규화가 통과시킨 값을 CHECK가 받는다는 뜻 — 둘의 역할이 다르다)'
update public.profiles set nickname = '손 흥민' where id = :'alice';
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 키릴 a로 alice 사칭 — 정규형은 통과하지만 허용 문자가 아니다'
\echo '         정규형 강제가 제로폭 우회를 막은 자리에 남아 있던 마지막 동형이의 구멍이다'
update public.profiles set nickname = U&'\0430' || 'lice' where id = :'alice';
rollback to s;

savepoint s; :login_alice
\echo '[한국 기대] NFD 한글(macOS 복붙)은 NFC로 접혀 통과한다 — 거부하면 "한글인데 왜 안 되지"가 된다'
update public.profiles set nickname = U&'\1112\1161\11AB' || '국' where id = :'alice';
reset role;
select nickname from public.profiles where id = :'alice';
rollback to s;

savepoint s; :login_alice
\echo '[성공] 자모 단독 닉네임 — ㅋㅋ·ㅠㅠ는 한국 커뮤니티의 관용 표기다'
update public.profiles set nickname = 'ㅋㅋ부장' where id = :'alice';
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
--   `..`를 정규화해 **남의 파일이 떴다**(실측). 아바타가 다른 사람에게 노출되는 순간 사칭 벡터가
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
\echo '[t/t 기대] 랜덤 닉네임이 배정되는가 — 프로바이더 표시 이름을 더 이상 읽지 않는다'
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
\echo '    ⚠ **버킷 설정 자체가 방어선이다.** 클라이언트 리사이즈는'
\echo '      UX일 뿐 우회 가능하고, 크기·타입을 실제로 막는 것은 file_size_limit과'
\echo '      allowed_mime_types다. 정책만 검사하면 이 값이 조용히 넓어져도 아무도 모른다.'
\echo '[t/2097152/t 기대] public · 2MiB 상한 · webp/jpeg/png만'
select public                                                   as is_public,
       file_size_limit,
       allowed_mime_types @> array['image/webp','image/jpeg','image/png']
         and array_length(allowed_mime_types, 1) = 3             as mime_exact
  from storage.buckets where id = 'avatars';

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
\echo '    화면 한도는 **그래핌**(닉네임 20)이고 클라이언트만 강제한다.'
\echo '    DB는 그래핌을 셀 수 없어(PG에 분절 기능 없음) 코드포인트 K=10배를 상한으로 둔다.'
\echo '    ⚠ 두 단위는 어떤 배수로도 완전 일치하지 않는다 — 1그래핌의 코드포인트 수에'
\echo '      상한이 없기 때문이다. 그래서 클라이언트가 두 한도를 겹쳐 검사한다.'
\echo '      여기서 검사하는 것은 그중 **DB가 실제로 강제하는 쪽**이다.'

savepoint s; :login_alice
\echo '[성공] 닉네임 200 코드포인트 — CHECK와 btree 유니크 인덱스를 **둘 다** 통과한다'
\echo '       ⚠ btree 인덱스 행은 8KB 페이지 기준 2704바이트가 상한이다. 코드포인트 한도를'
\echo '         빼면 어긋남이 CHECK가 아니라 **인덱스**로 옮겨간다(영어 에러라 번역도 안 된다).'
\echo '       ⚠ 여기 성공이 인덱스 통과의 증거다 — lower(nickname)이 유니크 인덱스라'
\echo '         인덱스 행이 상한을 넘으면 이 UPDATE 자체가 실패한다.'
update public.profiles set nickname = repeat('가', 200) where id = :'alice';
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 닉네임 201 코드포인트'
update public.profiles set nickname = repeat('가', 201) where id = :'alice';
rollback to s;

savepoint s;
\echo '[600 / t 기대] **허용 문자 집합이 바이트 상한을 보증한다** (20260910000001)'
\echo '               한글 음절·자모는 UTF-8 3바이트, 영숫자는 1바이트 — 4바이트 문자(이모지 등)는'
\echo '               is_plain_nickname이 애초에 거부하므로 최악이 200×3=600바이트다(< 2704).'
-- ⚠ 한때 이 자리를 이모지 200개(4바이트)로 검사했다. 문자 집합이 좁아지면서 그 입력은
--    CHECK에 먼저 걸려 "기대하지 않은 ERROR"가 됐다 — 최악 문자가 바뀌었으므로 검사도 바뀐다.
-- ⚠ 문자 집합을 넓힐 때 이 곱셈을 다시 한다. 4바이트 문자를 허용하면 800바이트가 되고,
--    그건 여전히 2704 아래지만 **한도를 올리면서 넓히면** 그 여유가 사라질 수 있다.
select octet_length(repeat('가', 200)) as worst_bytes,
       octet_length(repeat('가', 200)) < 2704 as fits_btree;
rollback to s;

\echo ''
\echo '=== 35. 이적 소식 (20260924000001) ==='
\echo '  설계 요약: 유일한 writer는 service_role 동기화 스크립트(scripts/sync-transfer-news.mjs)이고'
\echo '  앱에는 쓰기 경로가 없다. 읽기는 비로그인에게 열려 있다. 저자 미상 항목은 저장하지 않는다.'
\echo '  ⚠ 소스 id를 테스트 전용(rss:rlstest-*)으로 둔다 — 동기화된 실제 행이 섞이면 개수 검사가'
\echo '    조용히 틀어진다.'
savepoint s35;

insert into public.transfer_news (source_id, external_id, body, published_at, attribution, attributed_to, tier, stage, relevance)
values ('rss:rlstest-a', 'x1', 'Liverpool agree deal for Barcola', now() - interval '1 hour', 'outlet', null, 1, 'agreement', 0.8)
returning id as tn1 \gset

\echo ''
\echo '-- 35a. 앱에는 쓰기 경로가 없다 (정책도 grant도 없다) --'

savepoint s; :login_alice
\echo '[❌차단] 소식을 직접 만든다 — 쓰기 정책도 grant도 없다'
insert into public.transfer_news (source_id, external_id, body, published_at, attribution, attributed_to, tier, stage, relevance)
values ('rss:rlstest-a', 'fake', 'Fake here we go', now(), 'verified_author', 'fabrizioromano', 1, 'here_we_go', 1);
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 단계 조작 — 합의를 HERE WE GO로 올린다'
update public.transfer_news set stage = 'here_we_go' where id = :tn1;
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 저자 바꿔치기 — 매체 기사를 기자 본인의 말로 만든다'
update public.transfer_news set attribution = 'verified_author', attributed_to = 'david-ornstein.bsky.social' where id = :tn1;
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 소식을 지운다'
delete from public.transfer_news where id = :tn1;
rollback to s;

savepoint s; :login_anon
\echo '[❌차단] 비로그인 쓰기'
insert into public.transfer_news (source_id, external_id, body, published_at, attribution, tier, stage, relevance)
values ('rss:rlstest-a', 'anon', 'Anon', now(), 'outlet', 2, 'rumour', 0);
rollback to s;

\echo ''
\echo '-- 35b. 읽기는 비로그인에게도 열린다 (개인화가 없는 공개 보도다) --'

savepoint s; :login_anon
\echo '[t 기대] 비로그인이 읽는다 — 원문 대신 공개용 앞부분(body_excerpt)으로'
select count(*) = 1 and bool_and(body_excerpt = body_excerpt) from public.transfer_news where source_id = 'rss:rlstest-a';
rollback to s;

savepoint s; :login_anon
\echo '[❌차단] 원문 전문(body)은 공개 키로 읽을 수 없다 — 재배포 범위를 컬럼 권한이 지킨다'
select body from public.transfer_news where source_id = 'rss:rlstest-a';
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 로그인 사용자도 원문 전문은 못 읽는다'
select body from public.transfer_news where source_id = 'rss:rlstest-a';
rollback to s;

\echo '[t 기대] 공개용 앞부분은 원문의 앞 280자다(생성 컬럼 — writer가 어긋나게 채울 수 없다)'
select body_excerpt = left(body, 280) from public.transfer_news where id = :tn1;

\echo ''
\echo '-- 35c. 스키마 불변식 (writer가 service_role이라 CHECK가 유일한 방어다) --'

savepoint s;
\echo '[❌차단] 저자 미상 등급은 저장할 수 없다 — enum에 그 값이 없다'
\echo '        ⚠ 그 값이 생기면 "오른스테인이 말했다"로 잘못 나갈 행이 다시 성립한다(마이그레이션 머리말)'
insert into public.transfer_news (source_id, external_id, body, published_at, attribution, tier, stage, relevance)
values ('rss:rlstest-a', 'u1', 'Unattributed mirror copy', now(), 'unattributed', 2, 'rumour', 0.5);
rollback to s;

savepoint s;
\echo '[❌차단] 인증 계정 등급인데 저자가 비어 있다 — "누구의 말인지"가 그 등급의 정의다'
insert into public.transfer_news (source_id, external_id, body, published_at, attribution, attributed_to, tier, stage, relevance)
values ('rss:rlstest-a', 'v1', 'Verified but anonymous', now(), 'verified_author', null, 1, 'rumour', 0.5);
rollback to s;

savepoint s;
\echo '[❌차단] 확증된 미러 등급인데 저자가 비어 있다'
insert into public.transfer_news (source_id, external_id, body, published_at, attribution, attributed_to, tier, stage, relevance)
values ('rss:rlstest-a', 'm1', 'Mirror but anonymous', now(), 'linked_mirror', null, 1, 'rumour', 0.5);
rollback to s;

savepoint s;
\echo '[❌차단] 이적료가 금액 없이 통화만 있다 — 셋은 한 덩어리다'
insert into public.transfer_news (source_id, external_id, body, published_at, attribution, tier, stage, fee_currency, relevance)
values ('rss:rlstest-a', 'f1', 'Fee without amount', now(), 'outlet', 2, 'offer', 'EUR', 0.5);
rollback to s;

savepoint s;
\echo '[❌차단] 단일 이적료로 불가능한 액수(350m 초과) — 구단 가치·총지출일 확률이 압도적이다'
insert into public.transfer_news (source_id, external_id, body, published_at, attribution, tier, stage, fee_text, fee_amount, fee_currency, relevance)
values ('rss:rlstest-a', 'f2', 'Club sold for 449m', now(), 'outlet', 2, 'offer', '£449m', 449, 'GBP', 0.5);
rollback to s;

savepoint s;
\echo '[❌차단] 같은 소스의 같은 글을 두 번 — 동기화의 멱등성이 이 제약에 기대고 있다'
insert into public.transfer_news (source_id, external_id, body, published_at, attribution, tier, stage, relevance)
values ('rss:rlstest-a', 'x1', 'Duplicate', now(), 'outlet', 2, 'rumour', 0.1);
rollback to s;

savepoint s;
\echo '[❌차단] 보이지 않는 본문(제로폭 공백만)'
insert into public.transfer_news (source_id, external_id, body, published_at, attribution, tier, stage, relevance)
values ('rss:rlstest-a', 'z1', U&'\200B', now(), 'outlet', 2, 'unknown', 0);
rollback to s;

savepoint s;
\echo '[❌차단] 이적료 0 — numeric(6,2)로 반올림된 0.00도 여기 걸린다(writer는 0.005m 미만을 비운다)'
insert into public.transfer_news (source_id, external_id, body, published_at, attribution, tier, stage, fee_text, fee_amount, fee_currency, relevance)
values ('rss:rlstest-a', 'f3', 'Free transfer €0m', now(), 'outlet', 2, 'official', '€0m', 0, 'EUR', 0.5);
rollback to s;

savepoint s;
\echo '[❌차단] 관련성 1 초과'
insert into public.transfer_news (source_id, external_id, body, published_at, attribution, tier, stage, relevance)
values ('rss:rlstest-a', 'r1', 'Over relevant', now(), 'outlet', 2, 'rumour', 1.01);
rollback to s;

savepoint s;
\echo '[❌차단] 등급 3 — 1(1급 기자·공식)과 2뿐이다'
insert into public.transfer_news (source_id, external_id, body, published_at, attribution, tier, stage, relevance)
values ('rss:rlstest-a', 't3', 'Tier three', now(), 'outlet', 3, 'rumour', 0.1);
rollback to s;

savepoint s;
\echo '[❌차단] 묶음 키 형식(16자리 소문자 hex가 아니다)'
insert into public.transfer_news (source_id, external_id, body, published_at, attribution, tier, stage, cluster_key, relevance)
values ('rss:rlstest-a', 'c1', 'Bad cluster', now(), 'outlet', 2, 'rumour', 'NOT-A-HASH', 0.1);
rollback to s;

savepoint s;
\echo '[❌차단] http(s)가 아닌 원문 링크 — 화면이 그대로 href에 싣는다'
insert into public.transfer_news (source_id, external_id, url, body, published_at, attribution, tier, stage, relevance)
values ('rss:rlstest-a', 'l1', 'javascript:alert(1)', 'Script link', now(), 'outlet', 2, 'rumour', 0.1);
rollback to s;

savepoint s;
\echo '[❌차단] 빈 저자 표기'
insert into public.transfer_news (source_id, external_id, body, published_at, attribution, attributed_to, tier, stage, relevance)
values ('rss:rlstest-a', 'e1', 'Empty author', now(), 'outlet', '', 2, 'rumour', 0.1);
rollback to s;

savepoint s;
\echo '[❌차단] 소스 안 id 301자'
insert into public.transfer_news (source_id, external_id, body, published_at, attribution, tier, stage, relevance)
values ('rss:rlstest-a', repeat('k', 301), 'Long key', now(), 'outlet', 2, 'rumour', 0.1);
rollback to s;

savepoint s;
\echo '[❌차단] 게시 시각이 수집 시각보다 하루 넘게 미래 — 소스별 커서(max(published_at))를 잠근다'
insert into public.transfer_news (source_id, external_id, body, published_at, attribution, tier, stage, relevance)
values ('rss:rlstest-a', 'fut', 'From the future', now() + interval '2 days', 'outlet', 2, 'rumour', 0.1);
rollback to s;

savepoint s;
\echo '[❌차단] 레지스트리 형식이 아닌 소스 id'
insert into public.transfer_news (source_id, external_id, body, published_at, attribution, tier, stage, relevance)
values ('twitter:romano', 'y1', 'X API is paid', now(), 'outlet', 2, 'unknown', 0);
rollback to s;

\echo ''
\echo '-- 35d. 수집한 원문은 바꿀 수 없다 — service_role에도 걸린다 (transfer_news_freeze_collected) --'
\echo '   ⚠ 여기 검사는 전부 superuser로 돈다 — grant·정책은 writer(service_role)를 막지 못하므로'
\echo '     트리거가 superuser에게도 걸리는지가 이 설계의 전부다.'

savepoint s;
\echo '[❌차단] 원문을 고친다 — 기자가 지운 말도 우리 스냅샷에는 남아야 한다'
update public.transfer_news set body = 'Rewritten' where id = :tn1;
rollback to s;

savepoint s;
\echo '[❌차단] 게시 시각을 옮긴다 — 소스별 커서가 이 값의 max다'
update public.transfer_news set published_at = now() + interval '1 day' where id = :tn1;
rollback to s;

savepoint s;
\echo '[❌차단] 재처리 upsert가 원문을 다른 값으로 실으면 멈춘다'
insert into public.transfer_news (source_id, external_id, body, published_at, attribution, tier, stage, relevance)
values ('rss:rlstest-a', 'x1', 'Different body', now(), 'outlet', 1, 'medical', 0.9)
on conflict (source_id, external_id) do update
  set body = excluded.body, published_at = excluded.published_at, stage = excluded.stage;
rollback to s;

savepoint s;
-- 재처리가 실제로 보내는 모양: 수집 컬럼은 읽은 값 그대로, 추출 컬럼만 새 값
insert into public.transfer_news (source_id, external_id, url, provenance_url, author_handle, body, published_at, fetched_at,
                                  attribution, attributed_to, tier, stage, relevance)
select source_id, external_id, url, provenance_url, author_handle, body, published_at, fetched_at,
       attribution, attributed_to, tier, 'medical', 0.95
  from public.transfer_news where id = :tn1
on conflict (source_id, external_id) do update
  set url = excluded.url, provenance_url = excluded.provenance_url, author_handle = excluded.author_handle,
      body = excluded.body, published_at = excluded.published_at, fetched_at = excluded.fetched_at,
      stage = excluded.stage, relevance = excluded.relevance;
\echo '[t 기대] 재처리 경로(원문 그대로 + 추출 컬럼만 새 값)는 통과한다 — 트리거가 재처리까지 막으면 안 된다'
select stage = 'medical' and relevance = 0.95 from public.transfer_news where id = :tn1;
rollback to s;

savepoint s;
delete from public.transfer_news where id = :tn1;
\echo '[t 기대] 삭제는 막지 않는다 — 잘못 들어온 행을 걷어내는 유일한 길이다(트리거는 UPDATE만 본다)'
select not exists (select 1 from public.transfer_news where id = :tn1);
rollback to s;

rollback to s35;

\echo ''
\echo '=== 36. 이적시장 — 파생 딜 · 구단 · 관심 (20260925000001) ==='
\echo '  설계 요약: 딜(transfer_deal)·구단(transfer_club)은 transfer_news에서 파생한 운영 데이터라'
\echo '  유일한 writer가 service_role 파생 스크립트이고 앱에는 쓰기 경로가 없다(transfer_news와 같은 취급).'
\echo '  사용자가 쓰는 것은 관심(transfer_deal_watch)의 자기 행뿐이다.'
\echo '  ⚠ 시드는 테스트 전용 값이다 — 구단 code는 rlstest-*, deal_key는 sha1(''rlstest-player-*'')의'
\echo '    앞 16자리를 미리 적어 둔 것(형식 CHECK 때문에 임의 문자열을 쓸 수 없다), 소스 id는 rss:rlstest-b.'
\echo '    파생기가 넣은 실제 행이 섞이면 개수 검사가 조용히 틀어진다(섹션 35와 같은 함정).'
savepoint s36;

insert into public.transfer_club (code, canonical, name, short_name, league)
values ('rlstest-a', 'RLS Test A', '테스트 A', 'TSA', '프리미어리그'),
       ('rlstest-b', 'RLS Test B', '테스트 B', 'TSB', null);

-- ⚠ updated_at을 과거로 밀어 둔다 — now()가 트랜잭션 시작 시각이라, 기본값으로 시드하면
--   "파생하면 updated_at이 움직인다"를 이 트랜잭션 안에서 증명할 수 없다(now()가 트랜잭션 시작 시각이다).
insert into public.transfer_deal
  (deal_key, player, from_club_code, to_club_code, stage,
   fee_text, fee_amount, fee_currency, prev_fee_amount, fee_low_amount, fee_high_amount, add_on_amount,
   first_reported_at, latest_reported_at, report_count, updated_at)
values ('29cbd7bb142420b0', 'Rlstest Player A', 'rlstest-a', 'rlstest-b', 'talks',
        '€50m', 50, 'EUR', 45, 45, 50, 5,
        now() - interval '3 days', now() - interval '1 hour', 2, now() - interval '1 hour')
returning id as td1 \gset

-- 구단도 이적료도 못 읽은 루머 — 둘 다 null인 딜이 정상값이라는 것을 시드 자체가 증명한다
insert into public.transfer_deal
  (deal_key, player, stage, first_reported_at, latest_reported_at, report_count)
values ('630f2338c2fe7f34', 'Rlstest Player B', 'rumour', now() - interval '1 day', now() - interval '1 day', 1)
returning id as td2 \gset

insert into public.transfer_news (source_id, external_id, body, published_at, attribution, tier, stage, relevance, deal_id)
values ('rss:rlstest-b', 'x1', 'Rlstest Player A in talks with RLS Test B', now() - interval '1 hour', 'outlet', 1, 'talks', 0.8, :td1)
returning id as tn36 \gset

-- bob의 관심 — "내 행만 보인다"의 상대역 (superuser로 넣는다)
insert into public.transfer_deal_watch (user_id, deal_id) values (:'bob', :td1);

\echo ''
\echo '-- 36a. 앱에는 쓰기 경로가 없다 (정책도 grant도 없다) --'

savepoint s; :login_alice
\echo '[❌차단] 딜을 직접 만든다'
insert into public.transfer_deal (deal_key, player, stage, first_reported_at, latest_reported_at, report_count)
values ('61f61e3fdb8eed92', 'Fake Deal', 'here_we_go', now(), now(), 1);
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 단계 조작 — 협상을 HERE WE GO로 올린다'
update public.transfer_deal set stage = 'here_we_go' where id = :td1;
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 딜을 지운다'
delete from public.transfer_deal where id = :td1;
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 구단을 직접 만든다'
insert into public.transfer_club (code, canonical, name, short_name) values ('rlstest-c', 'RLS Test C', '테스트 C', 'TSC');
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 구단 표기를 고친다'
update public.transfer_club set name = '가짜' where code = 'rlstest-a';
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 구단을 지운다'
delete from public.transfer_club where code = 'rlstest-b';
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 보도가 속한 딜을 앱이 바꾼다 — deal_id는 파생기만 쓴다'
update public.transfer_news set deal_id = :td2 where id = :tn36;
rollback to s;

savepoint s; :login_anon
\echo '[❌차단] 비로그인이 딜을 만든다'
insert into public.transfer_deal (deal_key, player, stage, first_reported_at, latest_reported_at, report_count)
values ('61f61e3fdb8eed92', 'Anon Deal', 'rumour', now(), now(), 1);
rollback to s;

\echo ''
\echo '-- 36b. 읽기는 비로그인에게도 열린다 — 임베딩 경로까지 (크롤러가 보드를 색인한다) --'
-- ⚠ :login_anon은 claims를 비우지 않는다(머리말 주석). 여기 검사는 role만으로 갈리지만
--   "비로그인"을 말하는 검사라 claims까지 비워 진짜 비로그인으로 만든다.

savepoint s;
select set_config('request.jwt.claims', '{}', true);
:login_anon
\echo '[2 / 2 기대] 비로그인이 딜과 구단을 읽는다'
select (select count(*) from public.transfer_deal where deal_key in ('29cbd7bb142420b0', '630f2338c2fe7f34')) as deals,
       (select count(*) from public.transfer_club where code like 'rlstest-%')                                  as clubs;
rollback to s;

savepoint s;
select set_config('request.jwt.claims', '{}', true);
:login_anon
\echo '[t 기대] 비로그인이 피드를 읽는다 — deal_id를 포함하되 body는 뺀 컬럼 나열(별표 select는 쓸 수 없다)'
select deal_id = :td1
  from (select id, source_id, external_id, url, provenance_url, author_handle, body_excerpt,
               published_at, fetched_at, attribution, attributed_to, tier, stage, players, clubs,
               fee_text, fee_amount, fee_currency, cluster_key, relevance, deal_id
          from public.transfer_news where id = :tn36) n;
rollback to s;

savepoint s;
select set_config('request.jwt.claims', '{}', true);
:login_anon
\echo '[❌차단] 원문 전문(body)은 deal_id가 생긴 뒤에도 공개 키로 읽을 수 없다'
select body from public.transfer_news where id = :tn36;
rollback to s;

savepoint s;
select set_config('request.jwt.claims', '{}', true);
:login_anon
\echo '[t 기대] 딜 ⟵ 보도 임베딩(transfer_news!deal_id)이 42501 없이 돈다 — 상세의 보도 타임라인'
select count(n.id) = 1
  from public.transfer_deal d
  left join public.transfer_news n on n.deal_id = d.id
 where d.id = :td1;
rollback to s;

savepoint s;
select set_config('request.jwt.claims', '{}', true);
:login_anon
\echo '    ⚠ grant가 있어야 임베딩이 돌고, 정책(to authenticated)이 행을 막는다 — bob이 담았어도'
\echo '      비로그인에게는 빈 배열(= isWatched false)이다. 이 조회가 42501이면 보드가 통째로 죽는다.'
\echo '[0 기대] 딜 ⟵ 관심 임베딩(transfer_deal_watch(user_id))이 비로그인에게 42501 없이 빈 배열로 돈다'
select count(w.user_id)
  from public.transfer_deal d
  left join public.transfer_deal_watch w on w.deal_id = d.id
 where d.id = :td1;
rollback to s;

savepoint s;
select set_config('request.jwt.claims', '{}', true);
:login_anon
\echo '[t 기대] 딜 → 출발·행선지 구단 임베딩(transfer_club!from_club_code · !to_club_code)'
select f.short_name = 'TSA' and t.short_name = 'TSB'
  from public.transfer_deal d
  join public.transfer_club f on f.code = d.from_club_code
  join public.transfer_club t on t.code = d.to_club_code
 where d.id = :td1;
rollback to s;

\echo ''
\echo '-- 36c. 스키마 불변식 (writer가 service_role이라 CHECK가 유일한 방어다) --'

savepoint s;
\echo '[❌차단] stage = unknown — 이적과 무관한 게시물은 딜이 될 수 없다'
insert into public.transfer_deal (deal_key, player, stage, first_reported_at, latest_reported_at, report_count)
values ('61f61e3fdb8eed92', 'Unknown Stage', 'unknown', now(), now(), 1);
rollback to s;

savepoint s;
\echo '[❌차단] 출발과 행선지가 같은 딜'
insert into public.transfer_deal (deal_key, player, from_club_code, to_club_code, stage, first_reported_at, latest_reported_at, report_count)
values ('61f61e3fdb8eed92', 'Same Club', 'rlstest-a', 'rlstest-a', 'talks', now(), now(), 1);
rollback to s;

savepoint s;
insert into public.transfer_deal (deal_key, player, stage, first_reported_at, latest_reported_at, report_count)
values ('61f61e3fdb8eed92', 'No Clubs', 'rumour', now(), now(), 1);
\echo '[t 기대] 구단을 하나도 못 읽은 딜은 정상이다 — from<>to CHECK가 둘 다 null을 거부하면 안 된다'
select exists (select 1 from public.transfer_deal where deal_key = '61f61e3fdb8eed92' and from_club_code is null and to_club_code is null);
rollback to s;

savepoint s;
\echo '[❌차단] 한쪽만 읽힌 딜의 나머지가 모르는 구단 — FK'
insert into public.transfer_deal (deal_key, player, to_club_code, stage, first_reported_at, latest_reported_at, report_count)
values ('61f61e3fdb8eed92', 'Unknown Club', 'rlstest-nope', 'talks', now(), now(), 1);
rollback to s;

savepoint s;
\echo '[❌차단] deal_key 형식 — 16자리 소문자 hex가 아니다'
insert into public.transfer_deal (deal_key, player, stage, first_reported_at, latest_reported_at, report_count)
values ('NOT-A-HASH', 'Bad Key', 'rumour', now(), now(), 1);
rollback to s;

savepoint s;
\echo '[❌차단] deal_key 형식 — 대문자 hex'
insert into public.transfer_deal (deal_key, player, stage, first_reported_at, latest_reported_at, report_count)
values ('61F61E3FDB8EED92', 'Upper Key', 'rumour', now(), now(), 1);
rollback to s;

savepoint s;
\echo '[❌차단] deal_key 중복 — 재파생의 멱등성이 이 제약에 기댄다(upsert on conflict (deal_key))'
insert into public.transfer_deal (deal_key, player, stage, first_reported_at, latest_reported_at, report_count)
values ('29cbd7bb142420b0', 'Duplicate', 'rumour', now(), now(), 1);
rollback to s;

savepoint s;
\echo '[❌차단] 이적료가 금액 없이 통화만 — 셋은 한 덩어리다'
insert into public.transfer_deal (deal_key, player, stage, fee_currency, first_reported_at, latest_reported_at, report_count)
values ('61f61e3fdb8eed92', 'Currency Only', 'offer', 'EUR', now(), now(), 1);
rollback to s;

savepoint s;
\echo '[❌차단] 이적료 없이 직전 보도 이적료만 — 기준값 없는 차이는 그릴 수 없다'
insert into public.transfer_deal (deal_key, player, stage, prev_fee_amount, first_reported_at, latest_reported_at, report_count)
values ('61f61e3fdb8eed92', 'Prev Only', 'offer', 40, now(), now(), 1);
rollback to s;

savepoint s;
\echo '[❌차단] 이적료 없이 옵션만'
insert into public.transfer_deal (deal_key, player, stage, add_on_amount, first_reported_at, latest_reported_at, report_count)
values ('61f61e3fdb8eed92', 'Add-on Only', 'offer', 5, now(), now(), 1);
rollback to s;

savepoint s;
\echo '[❌차단] 보도 범위의 한쪽만(low 없이 high) — 둘은 한 쌍이다'
insert into public.transfer_deal (deal_key, player, stage, fee_text, fee_amount, fee_currency, fee_high_amount, first_reported_at, latest_reported_at, report_count)
values ('61f61e3fdb8eed92', 'Half Range', 'offer', '€50m', 50, 'EUR', 60, now(), now(), 1);
rollback to s;

savepoint s;
\echo '[❌차단] 보도 범위가 뒤집혔다(low > high)'
insert into public.transfer_deal (deal_key, player, stage, fee_text, fee_amount, fee_currency, fee_low_amount, fee_high_amount, first_reported_at, latest_reported_at, report_count)
values ('61f61e3fdb8eed92', 'Inverted Range', 'offer', '€50m', 50, 'EUR', 60, 40, now(), now(), 1);
rollback to s;

savepoint s;
\echo '[❌차단] 단일 이적료로 불가능한 액수(350m 초과)'
insert into public.transfer_deal (deal_key, player, stage, fee_text, fee_amount, fee_currency, first_reported_at, latest_reported_at, report_count)
values ('61f61e3fdb8eed92', 'Club Sale', 'offer', '£449m', 449, 'GBP', now(), now(), 1);
rollback to s;

savepoint s;
\echo '[❌차단] 국적 형식 — ISO 3자리 대문자가 아니다'
insert into public.transfer_deal (deal_key, player, nationality, stage, first_reported_at, latest_reported_at, report_count)
values ('61f61e3fdb8eed92', 'Bad Nationality', 'br', 'rumour', now(), now(), 1);
rollback to s;

savepoint s;
\echo '[❌차단] 생년 범위 밖(1949)'
insert into public.transfer_deal (deal_key, player, birth_year, stage, first_reported_at, latest_reported_at, report_count)
values ('61f61e3fdb8eed92', 'Too Old', 1949, 'rumour', now(), now(), 1);
rollback to s;

savepoint s;
\echo '[❌차단] 보이지 않는 선수명(제로폭 공백만)'
insert into public.transfer_deal (deal_key, player, stage, first_reported_at, latest_reported_at, report_count)
values ('61f61e3fdb8eed92', U&'\200B', 'rumour', now(), now(), 1);
rollback to s;

savepoint s;
\echo '[❌차단] 선수명 121자'
insert into public.transfer_deal (deal_key, player, stage, first_reported_at, latest_reported_at, report_count)
values ('61f61e3fdb8eed92', repeat('a', 121), 'rumour', now(), now(), 1);
rollback to s;

savepoint s;
\echo '[❌차단] 계약 표기 21자'
insert into public.transfer_deal (deal_key, player, contract_text, stage, first_reported_at, latest_reported_at, report_count)
values ('61f61e3fdb8eed92', 'Long Contract', repeat('9', 21), 'rumour', now(), now(), 1);
rollback to s;

savepoint s;
\echo '[❌차단] 주급 표기 21자'
insert into public.transfer_deal (deal_key, player, wage_text, stage, first_reported_at, latest_reported_at, report_count)
values ('61f61e3fdb8eed92', 'Long Wage', repeat('9', 21), 'rumour', now(), now(), 1);
rollback to s;

savepoint s;
\echo '[❌차단] 보도 수 0 — 보도 없는 딜은 파생기가 지운다'
insert into public.transfer_deal (deal_key, player, stage, first_reported_at, latest_reported_at, report_count)
values ('61f61e3fdb8eed92', 'No Reports', 'rumour', now(), now(), 0);
rollback to s;

savepoint s;
\echo '[❌차단] 첫 보도가 마지막 보도보다 나중'
insert into public.transfer_deal (deal_key, player, stage, first_reported_at, latest_reported_at, report_count)
values ('61f61e3fdb8eed92', 'Time Travel', 'rumour', now(), now() - interval '1 day', 1);
rollback to s;

savepoint s;
\echo '[❌차단] 구단 code 형식 — 소문자·숫자·하이픈만(엠블럼 파일명이다)'
insert into public.transfer_club (code, canonical, name, short_name) values ('Rlstest_C', 'RLS Test C', '테스트 C', 'TSC');
rollback to s;

savepoint s;
\echo '[❌차단] 구단 league 값 밖(5대 리그 이름이 아니다)'
insert into public.transfer_club (code, canonical, name, short_name, league) values ('rlstest-c', 'RLS Test C', '테스트 C', 'TSC', '분데스');
rollback to s;

savepoint s;
\echo '[❌차단] 구단 정규 영문명 중복 — 파생기가 canonical로 code를 찾는다'
insert into public.transfer_club (code, canonical, name, short_name) values ('rlstest-c', 'RLS Test A', '테스트 C', 'TSC');
rollback to s;

savepoint s;
\echo '[❌차단] 참조 중인 구단 삭제 — 딜의 출발·행선지가 조용히 비면 안 된다(FK, cascade 아님)'
delete from public.transfer_club where code = 'rlstest-a';
rollback to s;

savepoint s;
update public.transfer_deal set stage = 'offer' where id = :td1;
\echo '[t 기대] 재파생으로 다시 쓰면 updated_at이 움직인다 — WHEN 절 없는 트리거'
select updated_at > now() - interval '30 minutes' from public.transfer_deal where id = :td1;
rollback to s;

savepoint s;
update public.transfer_news set deal_id = :td2 where id = :tn36;
\echo '[t 기대] 파생기는 deal_id를 다시 쓸 수 있다 — 추출 컬럼이라 원문 고정 트리거에 걸리지 않는다'
select deal_id = :td2 from public.transfer_news where id = :tn36;
rollback to s;

savepoint s;
delete from public.transfer_deal where id = :td1;
\echo '[t 기대] 딜을 지우면 보도의 deal_id는 null로 돌아가고 보도는 남는다 (on delete set null)'
select exists (select 1 from public.transfer_news where id = :tn36 and deal_id is null);
rollback to s;

\echo ''
\echo '-- 36d. 관심 — 자기 행만 --'

savepoint s; :login_alice
\echo '[❌차단] 남(bob) 명의로 관심을 담는다'
insert into public.transfer_deal_watch (user_id, deal_id) values (:'bob', :td2);
rollback to s;

savepoint s; :login_anon
\echo '[❌차단] 비로그인 관심'
insert into public.transfer_deal_watch (user_id, deal_id) values (:'alice', :td1);
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] created_at을 실어 시각 위조 — insert grant 목록 밖이다'
insert into public.transfer_deal_watch (user_id, deal_id, created_at) values (:'alice', :td1, now() - interval '1 year');
rollback to s;

savepoint s; :login_alice
insert into public.transfer_deal_watch (user_id, deal_id) values (:'alice', :td1);
\echo '[❌차단] 같은 딜을 두 번 담는다 — 복합 PK(23505, 훅이 멱등으로 흡수한다)'
insert into public.transfer_deal_watch (user_id, deal_id) values (:'alice', :td1);
rollback to s;

savepoint s; :login_alice
insert into public.transfer_deal_watch (user_id, deal_id) values (:'alice', :td1);
\echo '[❌차단] 관심 행 UPDATE(다른 딜로 옮기기) — 정책도 컬럼 권한도 없다(빼기는 delete)'
update public.transfer_deal_watch set deal_id = :td2 where user_id = :'alice';
rollback to s;

savepoint s; :login_alice
insert into public.transfer_deal_watch (user_id, deal_id) values (:'alice', :td1);
\echo '[1 / 0 기대] 내 관심은 보이고 남(bob)의 관심은 0행이다'
select (select count(*) from public.transfer_deal_watch where user_id = :'alice') as mine,
       (select count(*) from public.transfer_deal_watch where user_id = :'bob')   as others;
rollback to s;

savepoint s; :login_alice
insert into public.transfer_deal_watch (user_id, deal_id) values (:'alice', :td1);
\echo '[1 / 0 기대] 목록 임베딩 — 담은 딜은 배열 길이 1, 안 담은 딜은 0 (bob의 관심은 세지 않는다)'
select (select count(w.user_id) from public.transfer_deal d left join public.transfer_deal_watch w on w.deal_id = d.id where d.id = :td1) as watched,
       (select count(w.user_id) from public.transfer_deal d left join public.transfer_deal_watch w on w.deal_id = d.id where d.id = :td2) as not_watched;
rollback to s;

savepoint s; :login_alice
\echo '    ⚠ DELETE의 using 절은 필터로 동작한다 — 권한이 없으면 에러가 아니라 0행이다.'
\echo '[DELETE 0 기대] 남(bob)의 관심은 지워지지 않는다'
delete from public.transfer_deal_watch where user_id = :'bob';
rollback to s;

savepoint s; :login_alice
insert into public.transfer_deal_watch (user_id, deal_id) values (:'alice', :td1);
\echo '[DELETE 1 기대] 내 관심은 뺀다'
delete from public.transfer_deal_watch where user_id = :'alice' and deal_id = :td1;
rollback to s;

savepoint s;
\echo '    (superuser — 파생기가 report_count 0인 딜을 지우는 경로다)'
delete from public.transfer_deal where id = :td1;
\echo '[0 기대] 딜을 지우면 그 딜의 관심이 함께 사라진다 (cascade)'
select count(*) from public.transfer_deal_watch where deal_id = :td1;
rollback to s;

\echo ''
\echo '-- 36e. 자유계약 표시 (20260925000003) — 이적료가 확인된 딜은 FA가 아니다 --'
savepoint s;
\echo '[❌차단] 이적료가 있는 딜을 자유계약으로 — 화면이 금액과 FA 중 무엇을 그릴지 갈린다'
update public.transfer_deal set is_free_agent = true where id = :td1;
rollback to s;

savepoint s;
\echo '[t 기대] 이적료가 없는 딜은 자유계약일 수 있다'
update public.transfer_deal set is_free_agent = true where id = :td2;
select is_free_agent from public.transfer_deal where id = :td2;
rollback to s;

savepoint s;
select set_config('request.jwt.claims', '{}', true);
:login_anon
\echo '[t 기대] 비로그인이 자유계약 여부를 읽는다(테이블 단위 grant가 새 컬럼도 덮는다)'
select count(*) = 1 from public.transfer_deal where id = :td2 and is_free_agent = false;
rollback to s;

rollback to s36;

\echo ''
\echo '=== 37. 이적 소식 한국어 요약 (20260925000002) ==='
\echo '  설계 요약: summary_ko는 요약 단계(LLM, service_role)만 쓰는 추출 컬럼이다. 비로그인도 읽고,'
\echo '  시도 표시(summarized_at)는 열지 않는다. 원문 전문의 우회 재배포를 막는 길이 상한이 있다.'
savepoint s37;

insert into public.transfer_news (source_id, external_id, body, published_at, attribution, attributed_to, tier, stage, relevance)
values ('rss:rlstest-c', 'x1', 'Liverpool agree deal for Barcola', now() - interval '1 hour', 'outlet', null, 1, 'agreement', 0.8)
returning id as ts1 \gset

\echo ''
\echo '-- 37a. 앱은 요약을 쓸 수 없다 --'
savepoint s; :login_alice
\echo '[❌차단] 로그인 유저가 요약을 고친다 — update grant가 없다'
update public.transfer_news set summary_ko = '가짜 요약' where id = :ts1;
rollback to s;

\echo ''
\echo '-- 37b. 읽기 --'
savepoint s;
select set_config('request.jwt.claims', '{}', true);
:login_anon
\echo '[t 기대] 비로그인이 요약을 읽는다(아직 없으면 null)'
select count(*) = 1 from public.transfer_news where id = :ts1 and summary_ko is null;
rollback to s;

savepoint s;
select set_config('request.jwt.claims', '{}', true);
:login_anon
\echo '[❌차단] 비로그인이 시도 표시(summarized_at)를 읽는다 — 운영 표시라 열지 않는다'
select summarized_at from public.transfer_news where id = :ts1;
rollback to s;

\echo ''
\echo '-- 37c. 스키마 불변식 (writer가 service_role이라 CHECK가 유일한 방어다) --'
savepoint s;
\echo '[❌차단] 시도 시각 없는 요약'
update public.transfer_news set summary_ko = '아스날이 영입에 합의했다.' where id = :ts1;
rollback to s;

savepoint s;
\echo '[❌차단] 160자 초과 — 요약이 아니라 전문 번역이 들어오는 것을 막는다'
update public.transfer_news set summary_ko = repeat('가', 161), summarized_at = now() where id = :ts1;
rollback to s;

savepoint s;
\echo '[❌차단] 보이지 않는 요약(제로폭 공백)'
update public.transfer_news set summary_ko = E'​', summarized_at = now() where id = :ts1;
rollback to s;

savepoint s;
\echo '[t 기대] 요약을 쓴다 — 원문 고정 트리거(수집 컬럼)에 걸리지 않는다'
update public.transfer_news set summary_ko = repeat('가', 160), summarized_at = now() where id = :ts1;
select char_length(summary_ko) = 160 from public.transfer_news where id = :ts1;
rollback to s;

savepoint s;
\echo '[t 기대] 무관 판정 — 요약 없이 시도 시각만 남는다'
update public.transfer_news set summarized_at = now() where id = :ts1;
select summary_ko is null and summarized_at is not null from public.transfer_news where id = :ts1;
rollback to s;

rollback to s37;

\echo ''
\echo '=== 37-1. 이적 소식 이동 판정 (20260928000001) ==='
\echo '  설계 요약: verdict*는 판정 단계(LLM, service_role)만 쓰는 비공개 추출 컬럼이다. 앱은 읽지도 쓰지도 못한다.'
\echo '  판정 불가는 값 없이 시도 시각만 남고, 판정에는 선수·시각이 따른다(CHECK가 유일한 방어다).'
savepoint s37v;

insert into public.transfer_news (source_id, external_id, body, published_at, attribution, attributed_to, tier, stage, relevance)
values ('rss:rlstest-v', 'x1', 'Liverpool agree deal for Barcola', now() - interval '1 hour', 'outlet', null, 1, 'agreement', 0.8)
returning id as tv1 \gset

savepoint s; :login_alice
\echo '[❌차단] 로그인 유저가 판정을 쓴다 — update grant가 없다'
update public.transfer_news set verdict = 'move', verdict_player = 'barcola', verdict_at = now() where id = :tv1;
rollback to s;

savepoint s;
select set_config('request.jwt.claims', '{}', true);
:login_anon
\echo '[❌차단] 비로그인이 판정을 읽는다 — 운영 표시라 열지 않는다'
select verdict from public.transfer_news where id = :tv1;
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 로그인 유저가 판정 근거를 읽는다'
select verdict_evidence from public.transfer_news where id = :tv1;
rollback to s;

savepoint s;
\echo '[❌차단] 누구에 대한 판정인지 없는 판정'
update public.transfer_news set verdict = 'move', verdict_at = now() where id = :tv1;
rollback to s;

savepoint s;
\echo '[❌차단] 판정 없는 근거'
update public.transfer_news set verdict_evidence = 'Liverpool agree deal', verdict_player = 'barcola', verdict_at = now() where id = :tv1;
rollback to s;

savepoint s;
\echo '[❌차단] 300자 넘는 근거'
update public.transfer_news set verdict = 'move', verdict_player = 'barcola', verdict_at = now(), verdict_evidence = repeat('a', 301) where id = :tv1;
rollback to s;

savepoint s;
\echo '[❌차단] 판정 값은 enum 밖을 받지 않는다'
update public.transfer_news set verdict = 'maybe', verdict_player = 'barcola', verdict_at = now() where id = :tv1;
rollback to s;

savepoint s;
\echo '[t 기대] 판정을 쓴다 — 원문 고정 트리거(수집 컬럼)에 걸리지 않는다'
update public.transfer_news set verdict = 'not_move', verdict_player = 'barcola', verdict_at = now(), verdict_evidence = repeat('a', 300) where id = :tv1;
select verdict = 'not_move' and char_length(verdict_evidence) = 300 from public.transfer_news where id = :tv1;
rollback to s;

savepoint s;
\echo '[t 기대] 판정 불가 — 값 없이 선수·시도 시각만 남는다'
update public.transfer_news set verdict_player = 'barcola', verdict_at = now() where id = :tv1;
select verdict is null and verdict_at is not null from public.transfer_news where id = :tv1;
rollback to s;

rollback to s37v;

\echo ''
\echo '=== 38. 이름 사전 자동 캐시 (20260925000004) ==='
\echo '  설계 요약: 선수·구단 한국어 표기의 위키데이터 캐시. writer는 service_role 파생 스크립트뿐이고'
\echo '  읽기는 공개다. 찾지 못한 이름도 행으로 남는다(name_ko null).'
savepoint s38;

insert into public.transfer_name_ko (kind, key, name_en, name_ko, wikidata_id)
values ('player', 'rlstest player', 'Rlstest Player', '알엘에스테스트', 'Q1');

savepoint s; :login_alice
\echo '[❌차단] 로그인 유저가 표기를 쓴다 — 쓰기 grant가 없다'
insert into public.transfer_name_ko (kind, key, name_en) values ('club', 'rlstest club', 'Rlstest Club');
rollback to s;

savepoint s;
select set_config('request.jwt.claims', '{}', true);
:login_anon
\echo '[t 기대] 비로그인이 읽는다'
select count(*) = 1 from public.transfer_name_ko where key = 'rlstest player';
rollback to s;

savepoint s;
\echo '[❌차단] 모르는 종류'
insert into public.transfer_name_ko (kind, key, name_en) values ('coach', 'x', 'X');
rollback to s;

savepoint s;
\echo '[❌차단] 출처 없는 한국어 표기 — 사람이 고친 값은 JSON에 둔다(여기는 위키데이터 캐시다)'
insert into public.transfer_name_ko (kind, key, name_en, name_ko) values ('club', 'rlstest club', 'Rlstest Club', '알엘에스');
rollback to s;

savepoint s;
\echo '[❌차단] 위키데이터 id 형식'
insert into public.transfer_name_ko (kind, key, name_en, name_ko, wikidata_id) values ('club', 'rlstest club', 'Rlstest Club', '알엘에스', 'X1');
rollback to s;

savepoint s;
\echo '[t 기대] 찾지 못한 이름도 행으로 남는다(매시간 다시 찾지 않게)'
insert into public.transfer_name_ko (kind, key, name_en) values ('club', 'rlstest club', 'Rlstest Club');
select name_ko is null and wikidata_id is null from public.transfer_name_ko where key = 'rlstest club';
rollback to s;

rollback to s38;

\echo ''
\echo '=== 39. 이적 딜 댓글 · 좋아요/싫어요 (20260927000001) ==='
\echo '  설계 요약: 읽기 공개 · 쓰기/삭제 본인만 · 수정 없음. 답글 깊이 1은 트리거가 P0001로 말한다.'
\echo '  표는 (user_id, comment_id) 행 하나이고 합계는 definer 트리거가 단독 관리한다.'
\echo '  딜 FK는 restrict다 — 파생기가 댓글 달린 딜을 지우지 못하게 구조로 막는다.'
\echo '  ⚠ 딜 시드는 테스트 전용 deal_key(sha1(''rlstest-player-d/e'')의 앞 16자리)를 쓴다(섹션 36과 같은 이유).'
savepoint s39;

insert into public.transfer_deal (deal_key, player, stage, first_reported_at, latest_reported_at, report_count)
values ('3f889b10af07bd9a', 'Rlstest Player D', 'talks', now() - interval '1 day', now() - interval '1 hour', 1)
returning id as tdc1 \gset
insert into public.transfer_deal (deal_key, player, stage, first_reported_at, latest_reported_at, report_count)
values ('4360f429624315b7', 'Rlstest Player E', 'rumour', now() - interval '1 day', now() - interval '1 hour', 1)
returning id as tdc2 \gset

-- bob의 루트 댓글 — 남의 행 역할(superuser로 넣는다)
insert into public.transfer_deal_comment (deal_id, user_id, content)
values (:tdc1, :'bob', 'bob 루트')
returning id as bc \gset

\echo ''
\echo '-- 39a. 댓글 쓰기 · 삭제 --'

savepoint s;
select set_config('request.jwt.claims', '{}', true);
:login_anon
\echo '[❌차단] 비로그인 댓글'
insert into public.transfer_deal_comment (deal_id, user_id, content) values (:tdc1, :'alice', 'x');
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 남(bob) 명의로 댓글'
insert into public.transfer_deal_comment (deal_id, user_id, content) values (:tdc1, :'bob', '사칭');
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 좋아요 수를 실어 위조 — insert grant 목록 밖이다'
insert into public.transfer_deal_comment (deal_id, user_id, content, up_count) values (:tdc1, :'alice', 'x', 999);
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] created_at을 실어 시각 위조 — insert grant 목록 밖이다'
insert into public.transfer_deal_comment (deal_id, user_id, content, created_at) values (:tdc1, :'alice', 'x', now() - interval '1 year');
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 싫어요 수를 실어 위조 — insert grant 목록 밖이다'
insert into public.transfer_deal_comment (deal_id, user_id, content, down_count) values (:tdc1, :'alice', 'x', 999);
rollback to s;

\echo '    ⚠ 위 위조 검사는 컬럼 하나씩만 본다 — grant 목록이 넓어지는 회귀는 아래 전수 대조가 잡는다.'
\echo '[t 기대] authenticated의 쓰기 가능 컬럼이 설계와 정확히 같다(댓글 insert · 표 insert/update)'
select
  (select string_agg(column_name, ',' order by column_name) from information_schema.columns
    where table_schema = 'public' and table_name = 'transfer_deal_comment'
      and has_column_privilege('authenticated', 'public.transfer_deal_comment', column_name, 'INSERT'))
    = 'content,deal_id,parent_id,user_id'
  and not exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'transfer_deal_comment'
      and has_column_privilege('authenticated', 'public.transfer_deal_comment', column_name, 'UPDATE'))
  and (select string_agg(column_name, ',' order by column_name) from information_schema.columns
    where table_schema = 'public' and table_name = 'transfer_deal_comment_vote'
      and has_column_privilege('authenticated', 'public.transfer_deal_comment_vote', column_name, 'INSERT'))
    = 'comment_id,user_id,value'
  and (select string_agg(column_name, ',' order by column_name) from information_schema.columns
    where table_schema = 'public' and table_name = 'transfer_deal_comment_vote'
      and has_column_privilege('authenticated', 'public.transfer_deal_comment_vote', column_name, 'UPDATE'))
    = 'value';

savepoint s; :login_alice
\echo '[❌차단] 보이지 않는 글자(제로폭 공백)만 있는 댓글'
insert into public.transfer_deal_comment (deal_id, user_id, content) values (:tdc1, :'alice', U&'\200B\FEFF');
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 3,001코드포인트 — abuse bound(화면 한도 300그래핌의 10배)'
insert into public.transfer_deal_comment (deal_id, user_id, content) values (:tdc1, :'alice', repeat('가', 3001));
rollback to s;

savepoint s; :login_alice
insert into public.transfer_deal_comment (deal_id, user_id, content) values (:tdc1, :'alice', repeat('가', 3000));
\echo '[t 기대] 3,000코드포인트는 들어간다(경계)'
select exists (select 1 from public.transfer_deal_comment where user_id = :'alice' and char_length(content) = 3000);
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 없는 딜에 댓글 — FK(23503)'
insert into public.transfer_deal_comment (deal_id, user_id, content) values (0, :'alice', 'x');
rollback to s;

savepoint s; :login_alice
insert into public.transfer_deal_comment (deal_id, user_id, content) values (:tdc1, :'alice', '원문') returning id as ac \gset
\echo '[❌차단] 본문 수정 — UPDATE 정책도 grant도 없다'
update public.transfer_deal_comment set content = '고침' where id = :ac;
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 좋아요 수를 직접 조작 — 카운터는 트리거만 쓴다'
update public.transfer_deal_comment set up_count = 999 where id = :bc;
rollback to s;

savepoint s; :login_alice
\echo '    ⚠ DELETE의 using 절은 필터로 동작한다 — 권한이 없으면 에러가 아니라 0행이다.'
delete from public.transfer_deal_comment where id = :bc;
\echo '[t 기대] 남(bob)의 댓글은 지워지지 않는다'
select exists (select 1 from public.transfer_deal_comment where id = :bc);
rollback to s;

savepoint s; :login_alice
insert into public.transfer_deal_comment (deal_id, user_id, content) values (:tdc1, :'alice', '지울 댓글') returning id as ac \gset
delete from public.transfer_deal_comment where id = :ac;
\echo '[f 기대] 내 댓글은 지운다'
select exists (select 1 from public.transfer_deal_comment where id = :ac);
rollback to s;

savepoint s;
select set_config('request.jwt.claims', '{}', true);
:login_anon
\echo '[t 기대] 비로그인이 댓글·작성자·표 수를 읽는다(SSR·크롤러)'
select count(*) = 1
  from public.transfer_deal_comment c
  join public.profiles p on p.id = c.user_id
 where c.id = :bc and p.nickname = 'bob' and c.up_count = 0 and c.down_count = 0;
rollback to s;

\echo ''
\echo '-- 39b. 답글 — 깊이 1 --'

savepoint s; :login_alice
insert into public.transfer_deal_comment (deal_id, user_id, content, parent_id) values (:tdc1, :'alice', '답글', :bc) returning id as ar \gset
\echo '[t 기대] 남의 루트에 답글은 달린다'
select exists (select 1 from public.transfer_deal_comment where id = :ar and parent_id = :bc);
\echo '[❌차단] 답글에 답글 — 트리거(P0001)'
insert into public.transfer_deal_comment (deal_id, user_id, content, parent_id) values (:tdc1, :'alice', '답답글', :ar);
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 다른 딜의 댓글에 답글 — 트리거(P0001)'
insert into public.transfer_deal_comment (deal_id, user_id, content, parent_id) values (:tdc2, :'alice', '엇갈림', :bc);
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 없는 댓글에 답글 — 트리거(P0001)'
insert into public.transfer_deal_comment (deal_id, user_id, content, parent_id) values (:tdc1, :'alice', '허공', 0);
rollback to s;

savepoint s; :login_alice
insert into public.transfer_deal_comment (deal_id, user_id, content, parent_id) values (:tdc1, :'alice', '답글', :bc) returning id as ar \gset
select set_config('rls.reply', :'ar', true), set_config('rls.deal', :'tdc1', true);
\echo '    ⚠ 러너는 "차단됐는가"만 보고 **어떤 코드로** 차단됐는지는 보지 않는다 — 깊이 거부가 42501·23514로'
\echo '      바뀌면 화면이 한국어 사유 대신 뭉뚱그린 문구를 낸다. 코드를 DB 안에서 대조한다.'
\echo '[P0001 확인] 답글에 답글의 거부 코드가 P0001이다(아니면 ERROR)'
do $$
begin
  begin
    insert into public.transfer_deal_comment (deal_id, user_id, content, parent_id)
    values (current_setting('rls.deal')::bigint, (select auth.uid()), '답답글', current_setting('rls.reply')::bigint);
  exception when others then
    if sqlstate <> 'P0001' then
      raise exception '깊이 거부 코드가 P0001이 아니다: %', sqlstate;
    end if;
    return;
  end;
  raise exception '답글에 답글이 차단되지 않았다';
end $$;
rollback to s;

savepoint s; :login_alice
insert into public.transfer_deal_comment (deal_id, user_id, content, parent_id) values (:tdc1, :'alice', 'alice 답글', :bc);
:login_bob
delete from public.transfer_deal_comment where id = :bc;
\echo '[0 기대] 루트를 지우면 남(alice)이 단 답글도 함께 사라진다 (cascade — 화면이 확인 문구로 알린다)'
select count(*) from public.transfer_deal_comment where parent_id = :bc;
rollback to s;

\echo ''
\echo '-- 39c. 좋아요 · 싫어요 --'

savepoint s;
select set_config('request.jwt.claims', '{}', true);
:login_anon
\echo '[❌차단] 비로그인 투표'
insert into public.transfer_deal_comment_vote (user_id, comment_id, value) values (:'alice', :bc, 1);
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 남(bob) 명의로 투표'
insert into public.transfer_deal_comment_vote (user_id, comment_id, value) values (:'bob', :bc, 1);
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 표 값 2 — 1 또는 -1만'
insert into public.transfer_deal_comment_vote (user_id, comment_id, value) values (:'alice', :bc, 2);
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] 표 값 0 — 표 없음은 행이 없는 것이다'
insert into public.transfer_deal_comment_vote (user_id, comment_id, value) values (:'alice', :bc, 0);
rollback to s;

savepoint s; :login_alice
\echo '[❌차단] created_at을 실어 시각 위조 — insert grant 목록 밖이다'
insert into public.transfer_deal_comment_vote (user_id, comment_id, value, created_at) values (:'alice', :bc, 1, now() - interval '1 year');
rollback to s;

savepoint s; :login_alice
insert into public.transfer_deal_comment_vote (user_id, comment_id, value) values (:'alice', :bc, 1);
\echo '[1 / 0 기대] 좋아요 → 트리거가 up_count를 올린다(남의 댓글인데도 — definer)'
select up_count, down_count from public.transfer_deal_comment where id = :bc;
\echo '[❌차단] 같은 댓글에 두 번 투표 — 복합 PK(23505)'
insert into public.transfer_deal_comment_vote (user_id, comment_id, value) values (:'alice', :bc, -1);
rollback to s;

savepoint s; :login_alice
insert into public.transfer_deal_comment_vote (user_id, comment_id, value) values (:'alice', :bc, 1);
update public.transfer_deal_comment_vote set value = -1 where user_id = :'alice' and comment_id = :bc;
\echo '[0 / 1 기대] 좋아요 → 싫어요 전환은 한 쪽을 빼고 다른 쪽을 더한다'
select up_count, down_count from public.transfer_deal_comment where id = :bc;
update public.transfer_deal_comment_vote set value = -1 where user_id = :'alice' and comment_id = :bc;
\echo '[0 / 1 기대] 같은 값으로 다시 UPDATE해도 알짜 0이다'
select up_count, down_count from public.transfer_deal_comment where id = :bc;
delete from public.transfer_deal_comment_vote where user_id = :'alice' and comment_id = :bc;
\echo '[0 / 0 기대] 표를 거두면 원래대로'
select up_count, down_count from public.transfer_deal_comment where id = :bc;
rollback to s;

savepoint s; :login_alice
insert into public.transfer_deal_comment (deal_id, user_id, content) values (:tdc1, :'alice', '옮길 곳') returning id as ac \gset
insert into public.transfer_deal_comment_vote (user_id, comment_id, value) values (:'alice', :bc, 1);
\echo '[❌차단] 표를 다른 댓글로 옮긴다 — comment_id는 update grant 밖이다'
update public.transfer_deal_comment_vote set comment_id = :ac where user_id = :'alice' and comment_id = :bc;
rollback to s;

savepoint s; :login_alice
insert into public.transfer_deal_comment_vote (user_id, comment_id, value) values (:'alice', :bc, 1);
\echo '[❌차단] 표를 남(bob) 명의로 넘긴다 — user_id는 update grant 밖이다'
update public.transfer_deal_comment_vote set user_id = :'bob' where user_id = :'alice' and comment_id = :bc;
rollback to s;

savepoint s;
-- bob의 좋아요(superuser로) — "내 표만 보인다"의 상대역
insert into public.transfer_deal_comment_vote (user_id, comment_id, value) values (:'bob', :bc, 1);
:login_alice
\echo '[0 기대] 남(bob)의 표는 보이지 않는다'
select count(*) from public.transfer_deal_comment_vote where user_id = :'bob';
update public.transfer_deal_comment_vote set value = -1 where user_id = :'bob';
delete from public.transfer_deal_comment_vote where user_id = :'bob';
reset role;
\echo '[1 / 1 / 0 기대] 남(bob)의 표는 바꿀 수도 거둘 수도 없다(0행) — 표 · 좋아요 · 싫어요'
select (select value from public.transfer_deal_comment_vote where user_id = :'bob' and comment_id = :bc),
       up_count, down_count
  from public.transfer_deal_comment where id = :bc;
rollback to s;

savepoint s;
insert into public.transfer_deal_comment_vote (user_id, comment_id, value) values (:'bob', :bc, -1);
:login_alice
insert into public.transfer_deal_comment_vote (user_id, comment_id, value) values (:'alice', :bc, 1);
\echo '[1 / 1 / 1 기대] 목록 임베딩 — 내 표(1)만 보이고 합계는 둘 다 센다 · 내 표 · 좋아요 · 싫어요'
select (select v.value from public.transfer_deal_comment_vote v where v.comment_id = c.id),
       c.up_count, c.down_count
  from public.transfer_deal_comment c where c.id = :bc;
rollback to s;

savepoint s;
insert into public.transfer_deal_comment_vote (user_id, comment_id, value) values (:'bob', :bc, 1);
select set_config('request.jwt.claims', '{}', true);
:login_anon
\echo '[0 기대] 비로그인에게 표 임베딩이 42501 없이 빈 배열로 돈다(grant가 통로, 정책이 거름)'
select count(v.value)
  from public.transfer_deal_comment c
  left join public.transfer_deal_comment_vote v on v.comment_id = c.id
 where c.id = :bc;
rollback to s;

savepoint s;
\echo '    (superuser — 탈퇴 cascade는 RPC도 정책도 거치지 않는다. 트리거만 숫자를 맞춘다)'
insert into public.transfer_deal_comment (deal_id, user_id, content) values (:tdc1, :'alice', 'alice 루트') returning id as ac \gset
insert into public.transfer_deal_comment_vote (user_id, comment_id, value) values (:'bob', :ac, 1), (:'alice', :ac, -1);
delete from auth.users where id = :'bob';
\echo '[0 / 1 기대] bob이 탈퇴하면 그 표가 합계에서 빠진다'
select up_count, down_count from public.transfer_deal_comment where id = :ac;
rollback to s;

savepoint s;
insert into public.transfer_deal_comment (deal_id, user_id, content) values (:tdc1, :'alice', 'a') returning id as ac \gset
insert into public.transfer_deal_comment_vote (user_id, comment_id, value) values (:'alice', :bc, 1), (:'bob', :bc, -1), (:'bob', :ac, 1);
delete from public.transfer_deal_comment_vote where user_id = :'bob' and comment_id = :bc;
update public.transfer_deal_comment_vote set value = -1 where user_id = :'alice' and comment_id = :bc;
\echo '[0행 기대] 표 합계가 실제 표 행 수와 어긋난 댓글'
select c.id, c.up_count, c.down_count, v.up, v.dn
  from public.transfer_deal_comment c
  left join (select comment_id,
                    count(*) filter (where value =  1) as up,
                    count(*) filter (where value = -1) as dn
               from public.transfer_deal_comment_vote group by 1) v on v.comment_id = c.id
 where c.up_count <> coalesce(v.up, 0) or c.down_count <> coalesce(v.dn, 0);
rollback to s;

\echo ''
\echo '-- 39d. 딜 삭제 — 댓글이 달린 딜은 지워지지 않는다 --'

savepoint s;
\echo '    (superuser — 파생기가 보도가 끊긴 딜을 지우는 경로다)'
\echo '[❌차단] 댓글이 달린 딜을 지운다 — FK restrict(23503). 파생기는 애초에 이 딜을 고르지 않는다'
delete from public.transfer_deal where id = :tdc1;
rollback to s;

savepoint s;
delete from public.transfer_deal where id = :tdc2;
\echo '[f 기대] 댓글이 없는 딜은 그대로 지워진다'
select exists (select 1 from public.transfer_deal where id = :tdc2);
rollback to s;

rollback to s39;

rollback;
\echo ''
\echo '=== 끝 (전체 rollback — 행은 남기지 않는다. identity 시퀀스 값은 rollback되지 않는다) ==='
