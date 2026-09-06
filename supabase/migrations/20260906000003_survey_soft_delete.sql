-- =====================================================================
-- 입축구 — 소프트 삭제 · 수정 시각 · 어드민 이미지 업로드
--
-- 20260906000002(승부예측)와 같은 형태다. 두 도메인이 서로를 참조하지
-- 않으므로 파일을 갈라 둔다 — 하나가 실패해도 다른 쪽은 온전하고,
-- 원격 적용 중 문제가 생기면 되돌릴 범위가 좁다.
-- =====================================================================

alter table public.survey
  add column updated_at timestamptz not null default now(),
  add column deleted_at timestamptz;

comment on column public.survey.deleted_at is
  '운영 판단으로 감춘 문항. 어드민만 admin_survey_list로 볼 수 있다';

-- ⚠ WHEN 절로 좁힌다 — 삭제/복구가 "수정됨"을 유발하지 않게(post 선례).
--   survey_option에는 updated_at을 두지 않는다: 어드민 목록의 "마지막 수정"은
--   부모가 대표하고, 선택지 편집 RPC가 부모의 updated_at을 함께 민다.
create trigger survey_touch_updated_at
  before update on public.survey
  for each row
  when (old.title is distinct from new.title
     or old.closes_at is distinct from new.closes_at)
  execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 부모 생존 판정 — match_is_alive와 같은 사유·같은 형태
--
-- ⚠ anon EXECUTE를 연다. survey_option의 select 정책에 `to` 절이 없어
--   비로그인 조회도 이 함수를 지나기 때문이다 — 닫으면 입축구가 통째로
--   42501로 죽는다.
-- ---------------------------------------------------------------------
create or replace function public.survey_is_alive(p_survey_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.survey s
     where s.id = p_survey_id and s.deleted_at is null
  )
$$;

revoke execute on function public.survey_is_alive(bigint) from public;
grant  execute on function public.survey_is_alive(bigint) to anon, authenticated;

-- ---------------------------------------------------------------------
-- SELECT 정책 — 관리자에게도 예외를 두지 않는다(사유는 match 쪽 주석과 같다)
--
-- ⚠ survey_option을 함께 묶지 않으면 삭제된 문항의 선택지 라벨이 REST로
--   그대로 읽힌다. 화면 경로는 404라 아무도 눈치채지 못한다.
-- ---------------------------------------------------------------------
drop policy "survey_select_all"        on public.survey;
drop policy "survey_option_select_all" on public.survey_option;

create policy "survey_select_alive" on public.survey
  for select using (deleted_at is null);

create policy "survey_option_select_alive" on public.survey_option
  for select using (public.survey_is_alive(survey_id));

-- ---------------------------------------------------------------------
-- definer 함수 — RLS가 닿지 않으므로 삭제 판정을 안에서 직접 한다
-- ---------------------------------------------------------------------
create or replace function public.survey_is_open(p_survey_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.survey s
     where s.id = p_survey_id
       and s.closes_at > now()
       and s.deleted_at is null
  )
$$;

create or replace function public.survey_results(p_survey_id bigint)
returns table(option_id bigint, vote_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select v.option_id, count(*)
    from public.survey_vote v
   where v.survey_id = p_survey_id
     -- 참여자에게만 열린다(게이팅은 UI가 아니라 여기 있다)
     and exists (
       select 1 from public.survey_vote me
        where me.survey_id = p_survey_id and me.user_id = (select auth.uid())
     )
     -- 감춘 문항은 존재하지 않는 것으로 다룬다
     and exists (
       select 1 from public.survey s
        where s.id = p_survey_id and s.deleted_at is null
     )
   group by v.option_id
$$;

-- ---------------------------------------------------------------------
-- Storage — 어드민 업로드 경로를 연다
--
-- 지금까지 survey-images에는 쓰기 정책이 아예 없어 파일을 스크립트가
-- service_role로 올렸다. 어드민 화면이 생기면서 그 자리가 앱으로 옮겨온다.
--
-- ⚠ 경로 형태는 survey_option.image_path의 CHECK(`^[0-9]+/…$`)가 이미
--   강제한다. 여기서는 "관리자인가"만 본다.
-- ⚠ 크기·타입의 실제 방어선은 여전히 버킷 설정이다(1MiB · webp/jpeg/png).
-- ---------------------------------------------------------------------
create policy "survey_images_insert_admin" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'survey-images' and public.is_admin());

create policy "survey_images_update_admin" on storage.objects
  for update to authenticated
  using      (bucket_id = 'survey-images' and public.is_admin())
  with check (bucket_id = 'survey-images' and public.is_admin());

create policy "survey_images_delete_admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'survey-images' and public.is_admin());

-- ---------------------------------------------------------------------
-- Storage — 어드민이 남의 본문 이미지를 지울 수 있어야 한다
--
-- post-images의 기존 정책은 전부 "자기 폴더만"이라, 어드민이 남의 글에서
-- 이미지를 걷어내도 **파일은 버킷에 그대로 남는다**(고아). 공개 버킷이라
-- URL을 아는 사람에게는 계속 보인다 — 걷어낸 의미가 없어진다.
--
-- ⚠ insert/update는 열지 않는다. 어드민이 하는 일은 제거뿐이다.
-- ---------------------------------------------------------------------
/*
 * ⚠⚠ **DELETE 정책만으로는 파일이 지워지지 않는다.** Storage는 지우기 전에 그 객체 행을
 *   **읽어야** 하는데 `post_images_select_own`이 "자기 폴더만"이라 관리자에게는 남의 파일이
 *   보이지 않는다 → 삭제가 **에러 없이 0행**으로 지나간다(실측: HTTP 200 + `[]`).
 *   이 프로젝트가 테이블에 대해 문서화한 "RLS 위반은 에러가 아니라 0행이다"의 Storage판이고,
 *   화면은 "올라간 파일도 지워요"라고 말한 뒤 공개 URL로 사진이 그대로 남는다.
 * ⚠ SELECT를 여는 것이 노출을 넓히지 않는다 — 이 버킷은 `public: true`라 파일 자체는 원래
 *   URL을 알면 누구나 받을 수 있다. 정책이 가리는 것은 **목록 열거**뿐이고, 관리자에게
 *   열거를 허용하는 것은 이 기능의 목적 그 자체다.
 */
create policy "post_images_select_admin" on storage.objects
  for select to authenticated
  using (bucket_id = 'post-images' and public.is_admin());

create policy "post_images_delete_admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'post-images' and public.is_admin());

notify pgrst, 'reload schema';
