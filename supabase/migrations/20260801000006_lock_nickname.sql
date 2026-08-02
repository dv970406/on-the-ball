-- =====================================================================
-- 닉네임을 가입 시점 값으로 고정한다
--
-- 20260801000005가 lower(nickname) 유니크 인덱스로 사칭을 막았다고 선언했지만
-- **선행 공백 하나로 그대로 우회된다**(실측):
--
--   char_length(' alice') between 1 and 20   → t  (길이 CHECK 통과)
--   lower(' alice') <> lower('alice')        → t  (유니크 인덱스 통과)
--   HTML은 선행 공백을 접으므로 화면상 'alice'와 구분되지 않는다
--
-- 그리고 grant update (nickname) + profiles_update_own 정책이 열려 있어
-- 로그인 유저가 PostgREST로 직접 실행할 수 있었다.
--
-- 편집 UI가 없으므로 **권한 자체를 회수**하고(쓰지 않는 창구를 닫는다),
-- 나중에 UI와 함께 다시 열 때를 대비해 값의 형태도 제약으로 못박는다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 클라이언트 쓰기 경로를 닫는다
-- ---------------------------------------------------------------------
revoke update (nickname) on public.profiles from authenticated;
drop policy "profiles_update_own" on public.profiles;

comment on table public.profiles is
  'auth.users의 공개 정보. 닉네임은 가입 트리거(handle_new_user)가 정하며 클라이언트는 수정할 수 없다. '
  '편집 UI를 붙일 때 grant update (nickname) + update 정책을 함께 되살릴 것';

-- ---------------------------------------------------------------------
-- 2. 값 자체의 방어 (권한을 다시 열더라도 유지되도록)
--    앞뒤 공백이 없고 비어 있지 않을 것 → lower(nickname) 유일성이 실제로 유일성이 된다.
-- ---------------------------------------------------------------------
-- 앞뒤 공백이 붙은 기존 값 정리.
--
-- ⚠ 충돌 흡수 로직을 두지 않는다. 처음엔 "' alice' → 'alice'인데 'alice'가 이미 있으면"을
--   대비한 재배치 블록을 넣었는데, 셋 다 틀려서 걷어냈다:
--     (1) 그 블록이 이 UPDATE **뒤**에 있어 UPDATE가 터지면 도달조차 못 했다
--     (2) 술어가 lower(nickname) 비교였는데, 마이그레이션 5의 유니크 인덱스 때문에
--         서로 다른 두 행이 같은 lower(nickname)을 가질 수 없어 **항상 거짓**이었다(죽은 코드)
--     (3) `offset 1`이 그룹별이 아니라 전역이라, 중복 그룹이 둘 이상이면
--         두 번째 그룹의 **최초 계정까지 닉네임을 잃었다**
--   죽은 데다 살아나면 틀리는 방어는 없느니만 못하다.
--
-- 충돌이 발생할 수 있는 상황 자체가 없다 — 아래에서 UPDATE 권한을 회수하므로 앞으로
-- 공백 닉네임이 만들어지지 않고, 가입 트리거도 btrim한 값만 넣는다(마이그레이션 5).
-- 만에 하나 레거시 DB에서 충돌하면 이 마이그레이션이 23505로 **크게 실패한다**
-- (조용히 망가지지 않는다). 그때는 충돌 행을 수동 정리하고 다시 적용한다.
update public.profiles
   set nickname = btrim(nickname)
 where nickname <> btrim(nickname);

alter table public.profiles
  add constraint profiles_nickname_trimmed
  check (nickname = btrim(nickname) and nickname <> '');

-- ⚠ 유니크 인덱스 이름(profiles_nickname_lower_key)은 절대 바꾸지 않는다 —
--   handle_new_user가 CONSTRAINT_NAME 문자열로 닉네임 충돌을 판별한다(20260801000005).
--   이름이 어긋나면 충돌이 raise로 빠져 **가입 자체가 죽는다**(fail-closed).
