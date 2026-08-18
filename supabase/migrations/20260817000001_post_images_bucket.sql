-- =====================================================================
-- 본문 이미지 스토리지 — post-images 버킷
--
-- ⚠ **avatars 버킷을 재사용하지 않는다.** 아바타 교체는 "1계정 : 1프로필사진"을 전제로
--   `list({user_id})` 후 **폴더를 통째로 비우고** 올린다(features/update-profile). 본문
--   이미지를 같은 폴더에 두면 프로필 사진을 한 번 바꿀 때마다 자기 글의 이미지가 전부 사라진다.
--
-- ⚠ **아바타에는 있는 DB CHECK 대응물이 여기엔 없다.** `profiles.avatar_path`는 컬럼이라
--   `profiles_avatar_path_own`이 "{내 uuid}/{파일명}" 두 세그먼트를 강제할 수 있었지만,
--   본문 이미지 주소는 자유 텍스트인 `post.content` 안에 마크다운으로 들어가므로 제약을 걸
--   자리가 없다. 즉 **방어선은 아래 Storage 정책 하나뿐**이다.
--   남의 폴더에 올리는 것은 막지만 "남의 파일 주소를 자기 본문에 적는 것"은 막지 못한다 —
--   공개 버킷이고 아바타와 달리 **작성자 신원 표시가 아니라서** 사칭 벡터가 되지 않는다.
--
-- ⚠ **탈퇴한 유저의 파일은 아무도 지울 수 없다.** `storage.objects`에는 `auth.users`로의 FK가
--   없어 cascade가 닿지 않고, 삭제 정책이 `auth.uid()` 기준이라 그 uuid의 주인이 사라지면
--   클라이언트 경로가 영영 막힌다. 정리는 서버 훅(Edge Function 또는 `auth.users` after-delete
--   트리거)이 `{uid}/` 프리픽스를 비우는 방식으로만 가능하다 — 아직 붙이지 않았다.
--   (아바타는 상세·댓글에서 "이 사람"을 가리키므로 성격이 다르다)
--
-- ⚠ 서버에서도 크기·타입을 막는다 — 클라이언트 압축은 UX이지 방어가 아니다.
--   클라이언트가 **항상 500KB 이하 webp로 맞춰** 올리므로(품질→치수 사다리,
--   `lib/resize-post-image.ts`) 서버 상한은 그 두 배인 1MiB로 조인다. 상한을 넉넉히 두면
--   우회 업로드에 그만큼의 여지를 그냥 내주는 셈이라, **실제 방어선은 계약에 붙여 둔다.**
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-images', 'post-images', true, 1048576,
        array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 경로 규약: {user_id}/{uuid}.webp
--
-- ⚠ **정규식으로 두 세그먼트를 강제한다.** `(storage.foldername(name))[1] = uid`만으로는
--   `{내uuid}/sub/deep.webp`(하위 폴더)와 `{내uuid}/../{남uuid}/x.webp`(경로 탈출)가 술어를
--   통과한다(psql에서 정책만 평가시켜 실측). 지금은 storage-api가 키를 정규화해 준 덕에
--   실익 있는 공격이 없지만, **아바타에는 `profiles_avatar_path_own`이라는 2번째 층이 있는데
--   본문 이미지에는 이 정책 하나뿐**이라 그 한 층이 형태까지 봐야 한다.
drop policy if exists "post_images_select_all" on storage.objects;
drop policy if exists "post_images_select_own" on storage.objects;
drop policy if exists "post_images_insert_own" on storage.objects;
drop policy if exists "post_images_update_own" on storage.objects;
drop policy if exists "post_images_delete_own" on storage.objects;

/*
 * ⚠ **SELECT를 소유자에게만 연다** — `avatars`처럼 전체 공개로 두면 안 된다.
 *
 *   공개 버킷의 `/object/public/...` 서빙은 **정책을 타지 않으므로** 본문 이미지는 비로그인에게도
 *   그대로 보인다(실측: 정책을 좁힌 뒤에도 공개 URL 200). 이 정책이 좌우하는 것은
 *   **인증 API의 열람과 `list` 열거**다.
 *
 *   열거를 열어 두면 "URL을 알면 볼 수 있다"가 **"uuid만 알면 전수 조회된다"** 로 바뀐다.
 *   결정적인 차이는 **게시되지 않은 이미지**다 — 이 앱은 업로드를 먼저 하고 본문에 마크다운을
 *   넣는 구조라, 올렸다가 안 쓴 사진이 버킷에 남는다(정리는 취소 버튼 경로에서만 돈다).
 *   실측: anon이 `POST /storage/v1/object/list/post-images`로 전체 사용자 uuid와 남의 파일
 *   목록을 받아냈다. 아바타는 공개가 목적이고 폴더를 통째로 비우는 교체 규약이 있어 성격이 다르다.
 */
create policy "post_images_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'post-images'
    and name ~ ('^' || (select auth.uid())::text || '/[^/]+$')
  );

create policy "post_images_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'post-images'
    and name ~ ('^' || (select auth.uid())::text || '/[^/]+$')
  );

create policy "post_images_update_own" on storage.objects
  for update to authenticated
  using      (bucket_id = 'post-images' and name ~ ('^' || (select auth.uid())::text || '/[^/]+$'))
  with check (bucket_id = 'post-images' and name ~ ('^' || (select auth.uid())::text || '/[^/]+$'));

create policy "post_images_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'post-images' and name ~ ('^' || (select auth.uid())::text || '/[^/]+$'));
