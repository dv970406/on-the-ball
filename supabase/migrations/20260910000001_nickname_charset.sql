-- =====================================================================
-- 닉네임 문자 집합을 **한글·영문·숫자**로 좁힌다
--
-- 지금까지 닉네임에는 문자 집합 제약이 없었다. 길이(1~200코드포인트)와 정규형
-- (normalize_nickname)만 강제했으므로 아래가 전부 통과했다(실측):
--
--     손흥민⚽@_-!!              ✅   이모지·특수문자
--     漢字 カナ Ωλ               ✅   한자·가나·그리스 문자 + 공백
--     <script>alert(1)</script>  ✅   태그 문자(렌더는 React가 이스케이프하므로 XSS는 아니다)
--
-- 이제 `가-힣` · 자모(`ㄱ-ㅣ`) · `A-Za-z` · `0-9`만 받는다. 공백도 받지 않는다.
--
-- 덤으로 **동형이의(homoglyph) 사칭이 구조적으로 막힌다.** 정규형 강제가
-- 제로폭·NBSP 우회를 막았지만 키릴 'а'(U+0430)·전각 'Ａ'(U+FF21)는 여전히 통과해서
-- 라틴 'a'·'A'와 화면에서 구분되지 않는 닉네임을 만들 수 있었다 — 허용 집합을
-- 열거하면 그 클래스 전체가 사라진다(`has_visible_char`가 약칭에 기대지 않고
-- 문자를 전부 열거한 것과 같은 판단이다).
--
-- ⚠ **NFC 정규화를 함께 들인다.** 없으면 이 제약이 "한글인데 거부됨"을 만든다 —
--   macOS에서 복사한 한글은 자모 분해(U+1112 U+1161 U+11AB = '한')로 오는 일이 있고,
--   그 형태는 `가-힣`(U+AC00–U+D7A3) 범위에 걸리지 않는다(실측 false).
--   그래서 normalize_nickname이 NFC로 접은 뒤 문자를 판정한다.
--
-- ⚠ **NFKC가 아니라 NFC다.** NFKC는 전각 'Ａ'를 'A'로, '①'을 '1'로, '㈜'를 '(주)'로
--   접는다 — 호환 분해까지 끌어들이면 사용자가 입력하지 않은 글자가 저장되고,
--   무엇보다 전각을 반각으로 접는 순간 위에서 막으려던 동형이의 입력이 **통과해 버린다.**
--   전각 영문은 거부하는 쪽이 맞다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 정규형에 NFC를 더한다
--
-- ⚠ 이 함수는 **닉네임 전용이 아니다.** 입축구 제목·선택지·부제도 이걸로 접으므로
--   (`admin_create_survey`·`admin_set_survey_options`·`admin_edit_survey_option`),
--   NFC 추가는 그쪽에도 적용된다 — 같은 글자가 두 형태로 저장되어 `unique`가
--   우회되는 것을 막는 일이라 그 자리에서도 뜻이 같다.
--
-- ⚠ `normalize(text, NFC)`는 **immutable**이다(실측: pg_proc.provolatile = 'i') —
--   그래서 CHECK 제약 안에서 불리는 이 함수의 immutable 선언이 유지된다.
--
-- ⚠ 순서가 규약이다: 보이지 않는 문자를 **먼저** 지운다. NFC를 앞에 두면
--   ZWJ·제로폭이 결합 시퀀스의 일부로 해석될 여지가 남는다.
--
-- ⚠ 클라이언트 짝 `normalizeNickname`(src/shared/lib/text.ts)에 `.normalize("NFC")`를
--   **함께** 넣었다. 한쪽만 고치면 길이 판정과 중복 판정이 갈린다.
-- ---------------------------------------------------------------------
create or replace function public.normalize_nickname(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select normalize(
           btrim(
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
               ' {2,}', ' ', 'g')),
           -- 4) 같은 글자의 분해형·결합형을 한 형태로 — 'ㅎㅏㄴ'(U+1112 U+1161 U+11AB) → '한'
           NFC)
$$;

comment on function public.normalize_nickname(text) is
  '보이는 텍스트의 정규형(보이지 않는 문자 제거 + 공백류 접기 + 앞뒤 다듬기 + NFC). '
  '문자 집합은 has_visible_char와 합집합이 같아야 한다 — 한쪽만 고치지 말 것. '
  '닉네임 전용이 아니다 — 입축구 제목·선택지도 이걸로 접는다';

-- ---------------------------------------------------------------------
-- 2. 허용 문자 판정
--
-- 범위를 **열거**한다:
--   U+AC00–U+D7A3  한글 음절(완성형) — NFC를 거친 한글이 전부 여기로 온다
--   U+3131–U+3163  한글 호환 자모 — 'ㅋㅋ'·'ㅠㅠ'처럼 자모 단독 닉네임이 관용이다
--   A-Za-z 0-9     영문·숫자
--
-- ⚠ **상한이 U+3163('ㅣ')인 것은 실수가 아니다.** 바로 다음 U+3164는 HANGUL FILLER로
--   화면에 아무것도 그리지 않는다 — 범위를 한 글자만 넓혀도 "보이지 않는 닉네임"이
--   되돌아온다(실측으로 거부되는 것을 확인했다).
--
-- ⚠ U+1100 계열(조합용 Hangul Jamo)은 넣지 않는다. NFC가 완성형으로 접어 주므로
--   정상 입력은 여기 닿지 않고, 접히지 않는 잔여 조합(단독 초성 등)은 거부하는 게 맞다.
--
-- ⚠ `-`·`_`를 넣지 않았다. 넣으면 아래 5)의 가입 폴백을 고칠 필요가 없어지지만,
--   "한글·영문·숫자만"이라는 말과 실제 규칙이 갈린다.
--
-- ⚠ **CHECK 제약 안의 함수는 호출자의 EXECUTE 권한으로 평가된다** —
--   has_visible_char·normalize_nickname에서 실측한 그 함정이다(revoke하면 해당 테이블의
--   쓰기가 전부 42501로 죽는다). anon·authenticated에 열어 둔다. 호출자가 넘긴
--   문자열의 형태만 돌려주므로 새는 정보가 없다(rls.sql 섹션 17d 화이트리스트에 등재).
-- ---------------------------------------------------------------------
create or replace function public.is_plain_nickname(p_text text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_text ~ U&'^[\AC00-\D7A3\3131-\3163A-Za-z0-9]+$'
$$;

comment on function public.is_plain_nickname(text) is
  '닉네임 허용 문자(한글 음절·한글 자모·영문·숫자)로만 이루어졌는지. 공백·이모지·특수문자를 거부한다. '
  'src/shared/lib/text.ts의 isPlainNickname과 문자 집합을 맞출 것';

revoke execute on function public.is_plain_nickname(text) from public;
grant  execute on function public.is_plain_nickname(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. 기존 위반 행 정리
--
-- ⚠ CHECK를 걸기 **전에** 치운다. 안 그러면 이 마이그레이션이 검증 실패로 멈춘다
--   (20260802000001·20260801000004와 같은 순서다).
--
-- ⚠ 닉네임은 **지울 수 없다** — post·comment와 달리 profiles 행은 계정이라,
--   위반했다고 행을 없애면 그 사용자가 사라진다. 그래서 값을 고친다.
--
-- 전략: 허용 문자만 남겨 **사용자가 고른 이름의 알아볼 수 있는 부분을 지킨다**
--   ('손흥민⚽' → '손흥민'). 남는 게 없거나 남은 값이 이미 쓰이고 있으면
--   random_nickname()으로 재배정한다 — 가입 트리거와 같은 재추첨 구조다.
--
-- ⚠ 정규형 위반도 함께 본다. 1)의 NFC 추가로 **기존 NFD 행이 방금 canonical 위반이
--   됐기 때문**이다(CHECK는 함수가 바뀔 때 기존 행을 재검증하지 않아 조용히 남는다 —
--   다음 UPDATE에서야 23514로 드러난다).
--
-- ⚠ **결과가 처리 순서에 달려 있다.** 두 행이 같은 값으로 수렴하면(`손흥민⚽`·`손 흥민`)
--   먼저 처리된 쪽이 `손흥민`을 차지하고 나머지는 랜덤 재배정된다 — 둘 중 하나는 반드시
--   이름을 잃으므로 수용한다. 실측으로 네 갈래(문자만 벗김 · 공백 제거 · 남는 게 없음 ·
--   기존 닉네임과 충돌)가 모두 의도대로 도는 것을 확인했다.
-- ---------------------------------------------------------------------
do $$
declare
  r           record;
  v_candidate text;
  v_try       int;
begin
  for r in
    select id, nickname
      from public.profiles
     where not public.is_plain_nickname(nickname)
        or nickname <> public.normalize_nickname(nickname)
  loop
    -- 허용 문자만 남긴다. 20은 **화면 한도**(그래핌)이고, 허용 문자는 전부
    -- 1코드포인트 = 1그래핌이라 left()로 세어도 같은 값이다.
    v_candidate := left(
      regexp_replace(
        public.normalize_nickname(r.nickname),
        U&'[^\AC00-\D7A3\3131-\3163A-Za-z0-9]', '', 'g'),
      20);

    v_try := 0;
    while v_candidate = ''
       or exists (select 1 from public.profiles q
                   where lower(q.nickname) = lower(v_candidate) and q.id <> r.id)
    loop
      v_try := v_try + 1;
      v_candidate := public.random_nickname();
      -- 조합이 포화됐을 때의 탈출 — 아래 5)의 폴백과 같은 형태(하이픈 없음)
      if v_try > 20 then
        v_candidate := left(public.random_nickname(), 14) ||
                       substr(md5(random()::text || clock_timestamp()::text), 1, 6);
      end if;
    end loop;

    update public.profiles set nickname = v_candidate where id = r.id;
    raise notice '닉네임 정리: % → %', r.nickname, v_candidate;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4. CHECK 제약
--
-- ⚠ **profiles_nickname_canonical을 지우지 않는다.** plain이 통과시키는 값은 전부
--   정규형이므로 지금은 canonical이 중복처럼 보이지만, 20260807000001이
--   profiles_nickname_trimmed를 지운 것과는 사정이 다르다 — 그때는 canonical이
--   trimmed를 **영구히** 포함했다. plain은 **정책**이라 나중에 넓어질 수 있고
--   (특수문자를 허용하기로 하는 순간), 그때 canonical이 유일한 정규형 방어선으로
--   돌아온다. 둘의 뜻이 다르다: canonical = 정규형(보안 불변식) / plain = 문자 집합(정책).
--
-- ⚠ 길이 CHECK(profiles_nickname_check, 1~200)도 그대로다. 이건 abuse bound다.
-- ---------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_nickname_plain;
alter table public.profiles
  add constraint profiles_nickname_plain
    check (public.is_plain_nickname(nickname));

comment on column public.profiles.nickname is
  '한글·영문·숫자만(profiles_nickname_plain). 공백·이모지·특수문자는 거부한다. '
  '화면 한도는 20그래핌이고 클라이언트(validateNickname)만 강제한다 — '
  '여기 1~200은 abuse bound이고, lower(nickname) 유니크 인덱스가 중복을 막는다';

-- ---------------------------------------------------------------------
-- 5. 가입 트리거 — 폴백 접미사에서 하이픈을 없앤다
--
-- 🔴 이것 없이 4)의 CHECK만 걸면 **가입이 죽는 경로가 생긴다.** 20260809000001의
--   폴백이 `left(닉,13) || '-' || md5…`라 하이픈이 들어가는데, 그 값은 이제 CHECK
--   위반이다. 480조합이 포화될 때까지 드러나지 않다가 그 순간부터 **해당 사용자의
--   가입 자체가 실패**한다 — 재시도 루프 안이라 무한 루프가 되는 형태다.
--
-- ⚠ 하이픈만 빼고 md5 hex(0-9a-f)는 그대로 쓴다 — 이미 허용 집합 안이다.
--   14 + 6 = 20자로 화면 한도에 맞는다(기존 13 + 1 + 6과 같은 총길이다).
-- ⚠ constraint_name으로 닉네임 충돌만 골라내는 fail-closed 구조는 그대로 유지한다.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_nickname   text;
  v_try        int := 0;
  v_constraint text;
begin
  loop
    v_try := v_try + 1;
    v_nickname := public.random_nickname();
    -- 20회 넘게 부딪히면 조합이 포화된 것이다 — 임의 접미사로 확실히 벗어난다
    -- ⚠ 하이픈을 넣지 않는다(profiles_nickname_plain) — 넣으면 이 경로가 영구히 실패한다
    if v_try > 20 then
      v_nickname := left(v_nickname, 14) ||
                    substr(md5(random()::text || clock_timestamp()::text), 1, 6);
    end if;

    begin
      insert into public.profiles (id, nickname) values (new.id, v_nickname);
      return new;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint is distinct from 'profiles_nickname_lower_key' then
        raise;  -- 닉네임 충돌이 아니다(예: 이미 프로필이 있는 유저) — 삼키지 않는다
      end if;
    end;
  end loop;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

comment on function public.handle_new_user() is
  '가입 시 profiles 행 생성. 닉네임은 랜덤 배정(random_nickname)이고 사용자가 프로필에서 바꾼다. '
  '충돌 폴백 접미사에 하이픈을 쓰지 않는다 — profiles_nickname_plain이 거부한다';
