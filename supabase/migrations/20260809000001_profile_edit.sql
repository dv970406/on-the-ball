-- =====================================================================
-- 프로필 편집 — 랜덤 닉네임 + 아바타 + 본인 수정 권한
--
-- 소셜 로그인으로 바뀌면서 닉네임을 프로바이더 표시 이름에서 뽑았는데, 그러면
--   · 사용자가 카카오/구글 프로필을 바꾸면 우리 닉네임과 어긋난다
--   · 표시 이름이 실명인 경우가 많아 커뮤니티에 실명이 노출된다
--   · 무엇보다 **닉네임 base가 클라이언트가 정하는 값**이라 사칭 방어를 계속 짊어져야 한다
-- → 가입 시에는 **축구 테마 랜덤 닉네임**을 주고, 사용자가 프로필 화면에서 바꾸게 한다.
--   프로바이더 표시 이름은 이제 읽지 않는다(oauth_display_name 폐기).
--
-- 아바타도 프로바이더 사진을 쓰지 않고 직접 업로드받는다(Supabase Storage).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 랜덤 닉네임
--
-- ⚠ 조합 길이가 **16자를 넘지 않아야 한다.** 충돌 시 붙는 접미사까지 20자(profiles CHECK)
--   안에 들어와야 하기 때문이다. 아래 목록은 가장 긴 조합이 5+4=9자다.
-- ⚠ volatile이다(random 사용) — CHECK나 인덱스에 쓰지 않는다.
-- ---------------------------------------------------------------------
create or replace function public.random_nickname()
returns text
language sql
volatile
set search_path = ''
as $$
  select (array[
    '왼발의','오른발의','새벽','주말','진지한','조용한','냉정한','무명의',
    '전설의','벤치의','후반전','하프타임','오프사이드','프리킥','코너킥','헤더',
    '롱패스','스루패스','뒷문','성실한','느긋한','열정적인','장꾸','칼같은'
  ])[floor(random() * 24) + 1]
  ||
  (array[
    '골키퍼','수비수','미드필더','스트라이커','윙어','감독','해설위원','심판',
    '서포터','직관러','분석가','전문가','마법사','사냥꾼','장인','관중',
    '소년','팬','매니아','낭만'
  ])[floor(random() * 20) + 1];
$$;

comment on function public.random_nickname() is
  '가입 시 배정하는 축구 테마 랜덤 닉네임(수식어+명사, 480조합). 사용자가 프로필에서 바꾼다';

-- 트리거 안에서만 쓴다 — CHECK·정책에 쓰이지 않으므로 호출자 권한이 필요 없다
revoke execute on function public.random_nickname() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. 아바타 — **URL이 아니라 경로**를 저장한다
--
-- ⚠ 전체 URL을 저장하면 (a) 로컬 127.0.0.1:64321 ↔ 원격 supabase.co가 달라 환경 간
--   데이터가 안 맞고, (b) 사용자가 임의의 외부 URL을 넣어 추적 픽셀을 심을 수 있다.
--   경로만 저장하고 URL은 클라이언트가 조립한다(entities/profile).
-- ⚠ CHECK로 **자기 폴더만** 허용한다 — 남의 아바타 경로를 자기 프로필에 넣지 못하게.
--   Storage 정책이 업로드를 막아도, 이미 존재하는 남의 파일 경로는 참조할 수 있다.
--
-- ⚠ **`starts_with`만으로는 못 막는다**(실측). `{myid}/../{otherid}/x.webp`가 그대로 통과하고,
--   URL을 만드는 순간 브라우저 파서가 `..`를 정규화해 **남의 파일이 뜬다.**
--   아바타가 목록·댓글에 노출되면 그대로 사칭 벡터가 되므로 정규식으로 형태를 못박는다:
--   `{내 uuid}/{파일명}` **정확히 두 세그먼트**, 파일명에 `/`도 `.`으로만 된 이름도 불가.
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists avatar_path text;

-- Postgres에는 `add constraint if not exists`가 없다 → 재실행 가능하게 drop 후 add
alter table public.profiles drop constraint if exists profiles_avatar_path_own;
alter table public.profiles
  add constraint profiles_avatar_path_own
    check (
      avatar_path is null
      or avatar_path ~ ('^' || id::text || '/[A-Za-z0-9_-]+\.[A-Za-z0-9]+$')
    );

comment on column public.profiles.avatar_path is
  'avatars 버킷 안의 경로({user_id}/{파일명}). 전체 URL이 아니다 — 환경마다 호스트가 다르다';

-- ---------------------------------------------------------------------
-- 3. 가입 트리거 — 랜덤 닉네임으로 교체
--
-- ⚠ 충돌 시 접미사(-2)를 붙이지 않고 **다시 뽑는다.** 랜덤이라 재시도가 자연스럽고,
--   `왼발의마법사-2`보다 다른 조합이 낫다. 여러 번 실패하면 그때 임의값을 덧붙인다.
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
    if v_try > 20 then
      v_nickname := left(v_nickname, 13) || '-' ||
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
  '가입 시 profiles 행 생성. 닉네임은 랜덤 배정(random_nickname)이고 사용자가 프로필에서 바꾼다';

-- 프로바이더 표시 이름은 더 이상 읽지 않는다
drop function if exists public.oauth_display_name(jsonb);

-- ---------------------------------------------------------------------
-- 4. 닉네임 정규화를 트리거로 보장한다
--
-- ⚠ 사용자가 직접 수정하게 되면서 **정규형이 아닌 값이 들어올 수 있다.**
--   CHECK(profiles_nickname_canonical)에 그대로 걸리면 23514라는 불친절한 에러가 되므로,
--   쓰기 직전에 정규화해 CHECK가 항상 통과하도록 만든다.
--   (길이 초과는 여전히 CHECK가 잡는다 — 그건 클라이언트가 미리 막는다)
-- ---------------------------------------------------------------------
create or replace function public.normalize_profile_nickname()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.nickname := public.normalize_nickname(new.nickname);
  return new;
end;
$$;

revoke execute on function public.normalize_profile_nickname() from public, anon, authenticated;

drop trigger if exists profiles_normalize_nickname on public.profiles;
create trigger profiles_normalize_nickname
  before insert or update of nickname on public.profiles
  for each row execute function public.normalize_profile_nickname();

-- ---------------------------------------------------------------------
-- 5. 본인 수정 권한 — 20260801000006이 회수한 것을 편집 UI와 함께 되살린다
--
-- 그 마이그레이션이 "편집 UI를 붙일 때 grant update (nickname) + update 정책을 함께
-- 되살릴 것"이라고 적어 둔 지점이다. 당시 우려(선행 공백 사칭)는 이제
-- profiles_nickname_canonical + normalize 트리거가 막는다.
--
-- ⚠ with check를 반드시 함께 둔다 — 없으면 id를 남의 uuid로 바꾸는 소유권 이전이 가능하다.
-- ⚠ 수정 가능한 컬럼을 **열거**한다. created_at·id까지 열면 가입 시각 위조가 가능해진다.
-- ---------------------------------------------------------------------
grant update (nickname, avatar_path) on public.profiles to authenticated;

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using       (id = (select auth.uid()))
  with check  (id = (select auth.uid()));

comment on table public.profiles is
  'auth.users의 공개 정보. 닉네임은 가입 시 랜덤 배정되고 본인이 프로필 화면에서 바꾼다. '
  '정규형 강제(profiles_nickname_canonical)가 lower(nickname) 유일성을 실제 유일성으로 만든다';

-- ---------------------------------------------------------------------
-- 6. 아바타 스토리지 — avatars 버킷
--
-- ⚠ public 버킷이다. profiles가 이미 전체 공개(profiles_select_all)라 아바타만 감춰봐야
--   의미가 없고, 서명 URL을 쓰면 목록 화면에서 N개의 서명을 발급해야 한다.
-- ⚠ 서버에서도 크기·타입을 막는다. 클라이언트 리사이즈는 우회 가능하다.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 경로 규약: {user_id}/{파일명} — 첫 폴더가 곧 소유자다
drop policy if exists "avatars_select_all"    on storage.objects;
drop policy if exists "avatars_insert_own"    on storage.objects;
drop policy if exists "avatars_update_own"    on storage.objects;
drop policy if exists "avatars_delete_own"    on storage.objects;

create policy "avatars_select_all" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "avatars_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars_update_own" on storage.objects
  for update to authenticated
  using      (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
