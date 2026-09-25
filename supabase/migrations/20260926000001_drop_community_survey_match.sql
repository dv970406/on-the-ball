-- =====================================================================
-- 커뮤니티·입축구·승부예측·공지·어드민 백오피스를 걷어낸다
--
-- 앱이 이적시장 + 로그인·프로필만 남기면서, 그 기능들이 쓰던 테이블·함수·enum·
-- 스토리지 정책을 전부 지운다. 남는 것은 `profiles`(+ 닉네임 정규화·가입 트리거)와
-- `transfer_*`, 그리고 둘이 함께 쓰는 CHECK 평가 함수·`touch_updated_at`뿐이다.
--
-- ⚠ **되돌릴 수 없다.** 원격에 적용하는 순간 글·댓글·투표·예측·공지 행이 전부 사라진다.
--   필요하면 적용 전에 원격 DB를 백업한다(대시보드 → Database → Backups 또는 `pg_dump`).
--
-- ⚠ **스토리지 버킷(`post-images`·`survey-images`)은 지우지 않는다.** 호스팅 Supabase는
--   `storage.buckets`·`storage.objects`의 직접 DELETE를 트리거로 막는다("Use the Storage API
--   instead") — 여기서 지우면 원격 적용이 통째로 실패한다. 이 마이그레이션은 **쓰기 정책만**
--   걷어내 더는 올릴 수 없게 하고, 버킷과 남은 파일은 대시보드(Storage)에서 비운 뒤 지운다.
--   ⚠ 공개 버킷이라 정책을 걷어도 **이미 올라간 파일의 공개 URL은 계속 열린다.**
--
-- ⚠ 순서가 규약이다: 스토리지 정책(→ `is_admin()` 참조) → 테이블(cascade로 정책·트리거가
--   함께 간다) → 함수 → enum → `profiles.is_admin` 컬럼.
-- =====================================================================

-- ── 스토리지 정책 ─────────────────────────────────────────────────────
drop policy if exists "post_images_select_own"    on storage.objects;
drop policy if exists "post_images_insert_own"    on storage.objects;
drop policy if exists "post_images_update_own"    on storage.objects;
drop policy if exists "post_images_delete_own"    on storage.objects;
drop policy if exists "post_images_select_admin"  on storage.objects;
drop policy if exists "post_images_delete_admin"  on storage.objects;
drop policy if exists "survey_images_select_all"  on storage.objects;
drop policy if exists "survey_images_insert_admin" on storage.objects;
drop policy if exists "survey_images_update_admin" on storage.objects;
drop policy if exists "survey_images_delete_admin" on storage.objects;

-- ── 테이블 ────────────────────────────────────────────────────────────
-- ⚠ cascade — 자식 FK·정책·트리거·시퀀스가 함께 지워진다. `transfer_*`는 이 테이블들을
--   참조하지 않는다(참조하는 것은 `profiles`뿐이다).

-- 커뮤니티
drop table if exists public.post_moderation   cascade;
drop table if exists public.post_report       cascade;
drop table if exists public.post_poll_vote    cascade;
drop table if exists public.post_poll_option  cascade;
drop table if exists public.post_poll         cascade;
drop table if exists public.post_like         cascade;
drop table if exists public.comment           cascade;
drop table if exists public.post              cascade;
drop table if exists public.user_block        cascade;

-- 입축구
drop table if exists public.survey_vote       cascade;
drop table if exists public.survey_option     cascade;
drop table if exists public.survey            cascade;

-- 승부예측
drop table if exists public.match_prediction     cascade;
drop table if exists public.match_event          cascade;
drop table if exists public.match_lineup_player  cascade;
drop table if exists public.match_lineup         cascade;
drop table if exists public.match_stat           cascade;
drop table if exists public.player               cascade;
drop table if exists public.match                cascade;
drop table if exists public.team                 cascade;

-- 공지
drop table if exists public.notice            cascade;

-- ── 함수 ──────────────────────────────────────────────────────────────
-- ⚠ 시그니처까지 적는다 — 오버로드가 생겨도 엉뚱한 함수를 지우지 않게.

-- 어드민 백오피스
drop function if exists public.admin_create_notice(public.notice_type, text, text, timestamptz, timestamptz);
drop function if exists public.admin_create_survey(text, jsonb, timestamptz);
drop function if exists public.admin_edit_post_poll(bigint, text, jsonb);
drop function if exists public.admin_edit_survey_option(bigint, bigint, text, text, text, text, text);
drop function if exists public.admin_mask_post(bigint, text);
drop function if exists public.admin_match_list(boolean);
drop function if exists public.admin_notice_list(boolean);
drop function if exists public.admin_post_list(boolean);
drop function if exists public.admin_restore_match(bigint);
drop function if exists public.admin_restore_notice(bigint);
drop function if exists public.admin_restore_post(bigint);
drop function if exists public.admin_restore_survey(bigint);
drop function if exists public.admin_set_post_content(bigint, text);
drop function if exists public.admin_set_survey_options(bigint, jsonb);
drop function if exists public.admin_soft_delete_match(bigint);
drop function if exists public.admin_soft_delete_notice(bigint);
drop function if exists public.admin_soft_delete_post(bigint);
drop function if exists public.admin_soft_delete_survey(bigint);
drop function if exists public.admin_strip_post_images(bigint, text[]);
drop function if exists public.admin_survey_list(boolean);
drop function if exists public.admin_survey_option_list(bigint);
drop function if exists public.admin_survey_vote_count(bigint);
drop function if exists public.admin_unlock_match(bigint);
drop function if exists public.admin_unmask_post(bigint);
drop function if exists public.admin_update_match(bigint, text, smallint, text, text, timestamptz, smallint, smallint, boolean);
drop function if exists public.admin_update_notice(bigint, public.notice_type, text, text, timestamptz, timestamptz);
drop function if exists public.admin_update_survey(bigint, text, timestamptz);
drop function if exists public.admin_validate_survey_options(jsonb);
drop function if exists public.is_admin();

-- 커뮤니티
drop function if exists public.check_comment_depth();
drop function if exists public.check_post_report();
drop function if exists public.create_post_with_poll(public.post_category, text, text, text, text[]);
drop function if exists public.increment_post_view(bigint);
drop function if exists public.is_blocked(uuid);
drop function if exists public.post_is_alive(bigint);
drop function if exists public.post_is_masked(bigint);
drop function if exists public.post_poll_results(bigint);
drop function if exists public.soft_delete_post(bigint);
drop function if exists public.sync_post_comment_count();
drop function if exists public.sync_post_like_count();
drop function if exists public.toggle_post_like(bigint);

-- 입축구
drop function if exists public.survey_is_alive(bigint);
drop function if exists public.survey_is_open(bigint);
drop function if exists public.survey_results(bigint);

-- 승부예측
drop function if exists public.match_is_alive(bigint);
drop function if exists public.match_is_open(bigint);
drop function if exists public.match_leaderboard(text, smallint, integer);
drop function if exists public.match_prediction_results(bigint);

-- ── enum ─────────────────────────────────────────────────────────────
drop type if exists public.post_category;
drop type if exists public.report_reason;
drop type if exists public.match_pick;
drop type if exists public.match_side;
drop type if exists public.lineup_role;
drop type if exists public.match_event_kind;
drop type if exists public.notice_type;

-- ── profiles ─────────────────────────────────────────────────────────
-- 관리자 판정(`is_admin()`)이 사라져 이 컬럼을 읽는 곳이 없다.
-- ⚠ SELECT grant는 20260906000001이 `(id, nickname, created_at, avatar_path)`로 좁혀 둔 그대로다 —
--   이 컬럼은 애초에 목록 밖이라 grant를 고칠 일이 없다.
alter table public.profiles drop column if exists is_admin;
