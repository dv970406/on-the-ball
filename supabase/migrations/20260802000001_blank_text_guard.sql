-- =====================================================================
-- "보이지 않는 글" 차단 — 제로폭·서식 문자만으로 이루어진 제목·본문·댓글
--
-- 20260801000004가 `~ '[^[:space:]]'`로 공백만 있는 글을 막았지만, Postgres의
-- `[:space:]`에는 **제로폭 문자와 BOM이 들어 있지 않다.** 그래서 다음이 통과했다(실측):
--
--   char_length(U&'\FEFF') between 1 and 120  → t   (길이 CHECK 통과)
--   U&'\FEFF' ~ '[^[:space:]]'                → t   (공백 CHECK 통과)
--   → HTTP 201. 목록에는 제목이 완전히 비어 보이는 카드가 생기고,
--     공유 링크의 <title>은 `﻿ · 온더볼`이 된다(실제로 그런 글이 만들어져 있었다).
--
-- 방향도 20260801000004가 세운 불변식과 반대로 뒤집혀 있었다. 그 파일은
-- "btrim만 쓰면 DB 검증이 클라이언트보다 약해져 '우회해도 DB가 막는다'가 거짓이 된다"고
-- 적었는데, JS `.trim()`은 U+FEFF를 깎아내므로 **클라이언트가 막는 값을 DB가 통과시켰다.**
--
-- ⚠ 문자 집합은 `src/shared/lib/text.ts`의 INVISIBLE_ONLY와 **같아야 한다.**
--   한쪽만 고치면 다시 어긋난다(게시글 폼·댓글 폼이 그 파일을 공유한다).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 판정 함수 — CHECK 세 곳이 같은 기준을 쓰도록 단일 소스로 둔다.
--
-- ⚠ **`[:space:]`를 쓰지 않는다.** 그 클래스는 DB collation의 ctype에 묶여 있어
--   같은 값이 로캘마다 다르게 판정된다 — 실측:
--     has_visible_char(U&'\00A0')  ICU(en_US.UTF-8) → f(차단)
--                                  libc en_US.utf8 / C → **t(통과)**
--   클라이언트의 `.trim()`은 NBSP를 깎아내므로, 원격 DB가 libc provider로 만들어졌다면
--   "클라이언트가 막는 값을 DB가 통과시킨다"는 뒤집힌 상태가 되고 **로컬에서는 절대
--   재현되지 않는다.** 그래서 문자를 전부 열거해 collation 비의존으로 만든다
--   (세 collation에서 결과가 같음을 확인했다).
--
-- ⚠ 문자 집합은 `src/shared/lib/text.ts`의 VISIBLE_CHAR와 **글자 하나까지 같아야 한다.**
--
-- immutable이어야 CHECK 제약에 쓸 수 있다. 이제 collation에 의존하지 않으므로 실제로 성립한다.
-- 구성: C0/C1 제어문자 + 모든 공백류 + 화면에 아무것도 그리지 않는 서식 문자
--   U+0001–U+0020 제어문자·스페이스 / U+007F–U+00A0 DEL·C1·NBSP / U+00AD soft hyphen
--   U+034F combining grapheme joiner / U+061C arabic letter mark / U+1680 ogham space
--   U+180E mongolian vowel separator / U+2000–U+200F 각종 공백·제로폭·양방향 마크
--   U+2028–U+202F 줄·문단 구분자·양방향 제어·NNBSP / U+205F medium math space
--   U+2060–U+2064 word joiner 계열 / U+206A–U+206F 비추천 서식 문자
--   U+3000 전각 공백 / U+FEFF BOM
-- (U+0000은 Postgres text가 담을 수 없어 범위를 U+0001부터 잡는다)
-- ---------------------------------------------------------------------
create or replace function public.has_visible_char(p_text text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_text ~ U&'[^\0001-\0020\007F-\00A0\00AD\034F\061C\1680\180E\2000-\200F\2028-\202F\205F\2060-\2064\206A-\206F\3000\FEFF]'
$$;

comment on function public.has_visible_char(text) is
  '보이는 글자가 하나라도 있는지. src/shared/lib/text.ts의 INVISIBLE_ONLY와 문자 집합을 맞출 것';

-- ⚠ **CHECK 제약 안의 함수도 호출자의 EXECUTE 권한으로 평가된다.**
--   처음에 다른 함수들처럼 `revoke execute ... from public, anon, authenticated`를 걸었더니
--   **모든 글쓰기가 `42501 permission denied for function has_visible_char`로 막혔다**(실측).
--   security definer RPC들과 성질이 다른 지점이다 — 이쪽은 쓰는 쪽이 제약 평가라
--   쓰기 권한이 있는 역할이 EXECUTE도 가져야 한다.
--   노출 위험은 없다: 호출자가 넘긴 문자열에 보이는 글자가 있는지만 돌려주는 순수 함수이고,
--   호출자가 이미 아는 사실 외에 어떤 정보도 새지 않는다(post_is_alive를 anon에 연 것과 같은 판단).
revoke execute on function public.has_visible_char(text) from public;
grant  execute on function public.has_visible_char(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 기존 위반 행 정리
--
-- ⚠ 제약을 걸기 전에 먼저 치운다. 안 그러면 (정확히 이 버그로 만들어진 행 때문에)
--   이 마이그레이션이 검증 실패로 멈춘다 — 20260801000004와 같은 순서다.
--
-- ⚠ hard delete다. 보이는 글자가 하나도 없는 글은 내용이 없다는 뜻이라 보존할 값이 없고,
--   post에는 DELETE 정책이 없어 소프트 삭제로는 CHECK를 만족시킬 수 없다
--   (제약은 deleted_at 여부와 무관하게 모든 행에 적용된다).
--   딸린 댓글도 FK cascade로 함께 사라진다 — 20260801000004의 선례와 같은 판단이다.
-- ---------------------------------------------------------------------
delete from public.comment where not public.has_visible_char(content);
delete from public.post
 where not public.has_visible_char(title)
    or not public.has_visible_char(content);

-- ---------------------------------------------------------------------
-- 제약 교체 — 새 검사가 기존 `_not_blank`를 완전히 포함한다(공백류는 그대로 걸러진다).
-- 둘 다 두면 같은 뜻의 제약이 두 개가 되어 어느 쪽이 진짜인지 흐려진다.
-- ---------------------------------------------------------------------
alter table public.post
  drop constraint post_title_not_blank,
  drop constraint post_content_not_blank,
  add  constraint post_title_visible   check (public.has_visible_char(title)),
  add  constraint post_content_visible check (public.has_visible_char(content));

alter table public.comment
  drop constraint comment_content_not_blank,
  add  constraint comment_content_visible check (public.has_visible_char(content));
