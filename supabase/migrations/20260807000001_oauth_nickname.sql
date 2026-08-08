-- =====================================================================
-- 소셜 로그인 유저의 닉네임
--
-- 지금까지 handle_new_user는 **이메일 로컬파트**에서 닉네임을 만들었다.
-- 그런데 OAuth 유저에게는 이메일이 아예 없을 수 있다 — 카카오의 이메일 제공은
-- 별도 심사 항목이라 `email_optional = true`로 열어 두는 것이 정상이고, 그러면
-- auth.users.email이 NULL로 들어온다. 그대로 두면 **카카오 가입자가 전원 user, user-2 …** 가 된다.
-- → 프로바이더가 준 표시 이름(raw_user_meta_data)을 먼저 보고, 없을 때만 이메일로 떨어진다.
--
-- ⚠⚠ **여기서 닉네임 base의 신뢰 등급이 내려간다.** 전에는 GoTrue가 검증한 이메일이었지만
--   이제는 클라이언트·프로바이더가 자유롭게 정하는 값이다. 그래서 20260801000006이
--   "선행 공백 하나로 유일성이 우회된다"며 걸어 둔 btrim 방어로는 **부족하다** —
--   btrim은 U+0020만 깎는다. 실측으로 뚫린 값들:
--
--     'ali' || U+200B || 'ce'  → char_length 6 통과 / btrim 통과 / lower() ≠ 'alice' 통과
--                              → 화면에는 'alice'와 글자 하나까지 동일하게 렌더된다
--     U+00A0 || 'alice'        → 같은 방식으로 통과 (20260801000006이 막았다고 선언한 그 사칭)
--
--   게시글·댓글의 작성자 표기가 전부 닉네임이라 사칭 효과가 직접적이다.
--   → 값을 **정규형으로 강제**한다. 보이지 않는 문자를 지우고 공백류를 하나로 접은 뒤,
--     그 결과와 다른 값은 CHECK가 거부한다. 그러면 lower(nickname) 유일성이 실제 유일성이 된다.
--
-- ⚠ 충돌 재시도(-2, -3, 100회 후 랜덤) · 16자 컷 · constraint_name으로 닉네임 충돌만
--   골라내는 fail-closed 구조는 20260801000005에서 그대로 가져온다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 정규형 — has_visible_char(20260802000001)의 문자 집합을 **둘로 나눠** 쓴다.
--
--   지운다      : 제로폭·서식·제어 문자 (화면에 아무것도 그리지 않고 단어를 나누지도 않는다)
--   공백으로    : 실제로 빈 자리를 그리는 문자 (단어 구분자라 지우면 "Chan Kim"이 "ChanKim"이 된다)
--
-- ⚠ 두 클래스의 합집합이 has_visible_char의 클래스와 **정확히 같아야 한다.**
--   한쪽에만 있는 문자가 생기면 "보이는 글자"의 정의가 두 개가 된다.
--   합집합 검증(원본 = 0001-0020, 007F-00A0, 00AD, 034F, 061C, 1680, 180E, 2000-200F,
--   2028-202F, 205F, 2060-2064, 206A-206F, 3000, FEFF):
--     0001-0008 + 0009-000D + 000E-001F + 0020 = 0001-0020
--     007F-009F + 00A0                          = 007F-00A0
--     2000-200A + 200B-200F                     = 2000-200F
--     2028,2029 + 202A-202E + 202F              = 2028-202F
--
-- ⚠ 지우는 쪽에 U+200D(ZWJ)가 포함된다 → 이모지 ZWJ 시퀀스(👨‍👩‍👦)는 낱개로 분해된다.
--   has_visible_char가 이미 ZWJ를 "보이지 않는 문자"로 다루고 있어 판정을 맞춘 결과다.
-- ---------------------------------------------------------------------
create or replace function public.normalize_nickname(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(
           regexp_replace(
             regexp_replace(
               -- 1) 보이지 않는 문자는 **지운다** — 'ali'+ZWSP+'ce' → 'alice'
               regexp_replace(
                 p_text,
                 U&'[\0001-\0008\000E-\001F\007F-\009F\00AD\034F\061C\180E\200B-\200F\202A-\202E\2060-\2064\206A-\206F\FEFF]',
                 '', 'g'),
               -- 2) 빈 자리를 그리는 문자는 보통 공백으로 — NBSP·전각공백 등이 여기서 흡수된다
               U&'[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000]',
               ' ', 'g'),
             -- 3) 연속 공백은 하나로 — 'a  b'와 'a b'가 서로 다른 닉네임이 되지 않게
             ' {2,}', ' ', 'g'))
$$;

comment on function public.normalize_nickname(text) is
  '닉네임 정규형(보이지 않는 문자 제거 + 공백류 접기 + 앞뒤 다듬기). '
  '문자 집합은 has_visible_char와 합집합이 같아야 한다 — 한쪽만 고치지 말 것';

-- ⚠ **CHECK 제약 안의 함수는 호출자의 EXECUTE 권한으로 평가된다**(has_visible_char에서 실측한
--   그 함정이다 — revoke했더니 모든 글쓰기가 42501로 죽었다). 지금 profiles를 쓰는 것은
--   security definer 트리거(소유자 postgres)뿐이라 당장은 필요 없지만, 나중에
--   `grant update (nickname) to authenticated`를 되살리는 순간 EXECUTE가 없으면 가입·수정이
--   통째로 죽는다. 미리 열어 둔다 — 호출자가 넘긴 문자열을 가공해 돌려줄 뿐이라 새는 정보가 없다.
--   (rls.sql 섹션 17d의 화이트리스트에 has_visible_char와 같은 사유로 등재했다)
revoke execute on function public.normalize_nickname(text) from public;
grant  execute on function public.normalize_nickname(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 표시 이름 추출
--
-- ⚠ `->>` 는 값이 문자열이 아니면 **직렬화된 JSON 텍스트**를 돌려준다(실측):
--     {"name":["a","b"]}      → 닉네임 '["a", "b"]'
--     {"name":{"first":"k"}}  → 닉네임 '{"first": "k"}'
--     {"name":123}            → 닉네임 '123'
--   raw_user_meta_data는 클라이언트가 정하므로 `{`·`"`·`[` 가 든 닉네임을 임의로 선점할 수 있다.
--   jsonb_typeof로 문자열만 받는다.
-- ---------------------------------------------------------------------
create or replace function public.oauth_display_name(p_meta jsonb)
returns text language sql immutable parallel safe set search_path = '' as $$
  select public.normalize_nickname(candidate)
    from unnest(array['name', 'nickname', 'full_name', 'preferred_username', 'user_name']) as k,
         lateral (select p_meta->>k where jsonb_typeof(p_meta->k) = 'string') as t(candidate)
   where candidate is not null
     and public.has_visible_char(public.normalize_nickname(candidate))
   limit 1;
$$;

comment on function public.oauth_display_name(jsonb) is
  '소셜 로그인 메타데이터에서 표시 이름 후보를 고른다(정규형으로 돌려준다). '
  '프로바이더마다 키가 달라 순서대로 훑는다';

-- ⚠ 이쪽은 normalize_nickname과 반대로 **회수한다.** has_visible_char처럼 열어 둘 이유가 없다 —
--   그쪽은 CHECK 제약 안에서 호출자 권한으로 평가되지만, oauth_display_name은 어떤 CHECK·정책에도
--   없고 handle_new_user(security definer) 안에서만 불린다. 열어 두면 rls.sql 섹션 17d의
--   "신규 객체 전수 가드"가 영구히 빨간불이 되어 진짜 구멍까지 함께 무시하게 된다.
revoke execute on function public.oauth_display_name(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 가입 트리거 — base를 정규형으로 만든다. 충돌 재시도·16자 컷·fail-closed 구조는 그대로.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_base       text;
  v_nickname   text;
  v_suffix     int := 1;
  v_constraint text;
begin
  -- 1) 프로바이더 표시 이름(이미 정규형) → 2) 이메일 로컬파트 → 3) 'user'
  v_base := public.oauth_display_name(new.raw_user_meta_data);
  if v_base is null or v_base = '' then
    v_base := public.normalize_nickname(split_part(coalesce(nullif(new.email, ''), 'user'), '@', 1));
  end if;

  -- 접미사 "-999"가 붙어도 20자를 넘지 않도록 16자로 자른다.
  -- ⚠ 자르면 끝에 공백이 남을 수 있어 다시 정규형으로 되돌린다("ab cdefghijklmno p" → 16자 컷).
  --   이 값이 profiles_nickname_canonical을 만족하지 못하면 예외 핸들러가 unique_violation만
  --   잡으므로 **가입 트랜잭션이 통째로 롤백된다** — 트리거가 만든 값이 트리거가 걸어 둔 제약을
  --   항상 만족한다는 불변식은 트리거 자신이 보장해야 한다.
  v_base := public.normalize_nickname(left(v_base, 16));
  if v_base is null or v_base = '' or not public.has_visible_char(v_base) then
    v_base := 'user';
  end if;
  v_nickname := v_base;

  loop
    begin
      insert into public.profiles (id, nickname) values (new.id, v_nickname);
      return new;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint is distinct from 'profiles_nickname_lower_key' then
        raise;  -- 닉네임 충돌이 아니다(예: 이미 프로필이 있는 유저) — 삼키지 않는다
      end if;

      v_suffix := v_suffix + 1;
      if v_suffix > 100 then
        v_nickname := left(v_base, 13) || '-' ||
                      substr(md5(random()::text || clock_timestamp()::text), 1, 6);
      else
        v_nickname := v_base || '-' || v_suffix::text;
      end if;
    end;
  end loop;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 기존 행 정리 → 제약 교체
--
-- ⚠ 제약을 걸기 전에 치운다(20260802000001과 같은 순서). 정규화가 기존 닉네임끼리 충돌시키면
--   여기서 23505로 **크게 실패한다** — 조용히 망가지는 것보다 낫다. 그때는 충돌 행을
--   수동으로 정리하고 다시 적용한다.
-- ---------------------------------------------------------------------
update public.profiles
   set nickname = public.normalize_nickname(nickname)
 where nickname <> public.normalize_nickname(nickname);

-- 정규화 결과가 빈 문자열이 된 행(닉네임이 전부 보이지 않는 문자였던 경우) 구제
update public.profiles
   set nickname = 'user-' || substr(id::text, 1, 8)
 where nickname = '';

-- profiles_nickname_trimmed를 대체한다 — 정규형 검사가 btrim 검사를 완전히 포함한다.
-- 둘 다 두면 같은 뜻의 제약이 두 개가 되어 어느 쪽이 진짜인지 흐려진다(20260802000001과 같은 판단).
alter table public.profiles
  drop constraint profiles_nickname_trimmed,
  add  constraint profiles_nickname_canonical
       check (nickname = public.normalize_nickname(nickname) and nickname <> '');

comment on table public.profiles is
  'auth.users의 공개 정보. 닉네임은 가입 트리거(handle_new_user)가 소셜 표시 이름·이메일에서 '
  '**정규형으로** 만들며 클라이언트는 수정할 수 없다. 정규형 강제(profiles_nickname_canonical)가 '
  'lower(nickname) 유일성을 실제 유일성으로 만든다 — 편집 UI를 붙일 때 '
  'grant update (nickname) + update 정책과 함께 normalize_nickname의 EXECUTE도 확인할 것';
