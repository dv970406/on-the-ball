-- =====================================================================
-- 관리자 — 어드민 백오피스의 기반
--
-- 이 앱에는 지금까지 관리자 개념이 없었다. 운영 데이터(경기·입축구)는
-- service_role 스크립트나 마이그레이션으로만 들어왔고, 부적절한 글에
-- 대응할 수단도 없었다.
--
-- ⚠ **이 파일은 단독으로 둔다.** 플래그를 켜기 전까지 아무 동작도 열리지
--   않으므로, 원격에 먼저 올린 뒤
--     update public.profiles set is_admin = true where id = '<uuid>';
--   를 수동으로 1회 돌리는 것이 안전하다. 마이그레이션에 uuid를 박지 않는
--   이유는 그 값이 저장소에 남고 로컬/원격이 갈리기 때문이다.
--
-- ⚠ 어드민의 DB 접근은 **전부 security definer RPC를 지난다**(20260906000005).
--   테이블에는 어드민용 정책도 grant도 한 줄도 열지 않는다 — 사유는
--   `docs/conventions/api-and-db.md`의 "어드민 쓰기 경로" 절에 있다.
-- =====================================================================

alter table public.profiles add column is_admin boolean not null default false;

comment on column public.profiles.is_admin is
  '관리자 여부. 앱에는 이 값을 켜는 경로가 없다(컬럼 grant 없음) — DBA가 직접 켠다';

-- ---------------------------------------------------------------------
-- 관리자 판정
--
-- ⚠ **인자를 받지 않는다.** security definer가 바꾸는 것은 "무엇을 할 수
--   있는가"이지 "누가 호출했는가"가 아니다 — 유저 id를 클라이언트가 넘기면
--   남의 명의로 조작할 수 있다(toggle_post_like와 같은 규약).
--
-- ⚠ **stable이어야 한다.** volatile이면 행마다 재평가된다.
--
-- ⚠ **anon에 열지 않는다.** 열 필요가 없는 이유가 이 설계의 성질이다 —
--   이 함수를 부르는 RLS 정책이 하나도 없기 때문이다(어드민 조회조차 RPC를
--   지난다). 그래서 `rls.sql` 섹션 17d의 anon EXECUTE 화이트리스트가 이
--   함수 때문에 늘지 않는다.
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = (select auth.uid())),
    false
  )
$$;

revoke execute on function public.is_admin() from public, anon;
grant  execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------
-- 누가 관리자인지는 공개하지 않는다
--
-- 지금까지 profiles의 SELECT는 테이블 단위 grant였다(20260801000004).
-- is_admin이 생긴 이상 그대로 두면 아무나 관리자 계정을 특정할 수 있다 —
-- 계정 탈취의 표적을 알려주는 값이다.
--
-- 안전한 근거: 코드 전수에 `select("*")`가 0건이고, profiles 조회는
-- `PROFILE_SELECT = "id, nickname, avatar_path"` 하나뿐이며 post·comment의
-- 임베딩도 전부 컬럼을 명시한다.
--
-- ⚠ **대가**: 앞으로 profiles에 컬럼을 더할 때 이 목록도 함께 늘려야 한다.
--   잊으면 그 컬럼만 조용히 42501이 되는데, `rls.sql` 17a는 SELECT를 보지
--   않으므로 잡지 못한다 → 섹션 33b가 이 목록을 전수 대조한다.
--
-- ⚠ UPDATE grant는 (nickname, avatar_path) 그대로다 — is_admin을 더하지
--   않는 것이 자가 승격을 막는 유일한 장치다.
-- ---------------------------------------------------------------------
revoke select on public.profiles from anon, authenticated;
grant  select (id, nickname, created_at, avatar_path)
  on public.profiles to anon, authenticated;

notify pgrst, 'reload schema';
