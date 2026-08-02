-- =====================================================================
-- 프로필 — auth.users의 공개 얼굴
--
-- auth.users는 클라이언트가 읽을 수 없다. 작성자 닉네임을 화면에 띄우려면
-- public 스키마에 조회 가능한 테이블이 필요하고, post/comment가 이쪽을
-- 참조해야 PostgREST 임베딩(select("*, profiles(nickname)"))이 성립한다.
--
-- 그래서 board_init보다 먼저 온다.
-- =====================================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 20),
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'auth.users의 공개 정보. 가입 시 트리거가 자동 생성한다';

-- ---------------------------------------------------------------------
-- 가입 시 프로필 자동 생성
--
-- security definer 필수 — 트리거가 호출자(가입 중인 익명 컨텍스트) 권한으로 돌면
-- profiles insert 권한이 없어 가입 자체가 실패한다.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- 이메일 로컬파트를 기본 닉네임으로 (사용자가 나중에 바꿀 수 있다)
  insert into public.profiles (id, nickname)
  values (new.id, left(split_part(coalesce(new.email, 'user'), '@', 1), 20));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.profiles enable row level security;

-- 닉네임은 게시글·댓글에 노출되므로 비로그인 포함 전체 공개
create policy "profiles_select_all" on public.profiles
  for select using (true);

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- 삽입은 위 트리거 전용, 삭제는 auth.users cascade 전용 — 클라이언트 경로를 닫는다
revoke insert, update, delete on public.profiles from anon, authenticated;
grant  update (nickname) on public.profiles to authenticated;
