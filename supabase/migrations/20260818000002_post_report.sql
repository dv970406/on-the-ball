-- =====================================================================
-- 신고 — 글 신고 (사유 선택만, 자유 텍스트 없음)
--
-- 설계 원칙
--  * **SELECT 정책을 두지 않는다.** 관리 화면이 없어 읽을 소비자가 0이고, 열면
--    "내가 무엇을 신고했는지"가 조회 표면이 된다. rls.sql 17b(RLS만 켜고 정책이 0개인
--    테이블 금지)는 아래 INSERT 정책 하나로 충족된다 — 17b가 요구하는 것은 "정책 ≥ 1"이지
--    "SELECT 정책"이 아니다.
--    → 클라이언트는 `.insert()`에 `.select()`를 붙이면 안 된다(붙이면 42501).
--
--  * **중복·자기 글 거부는 정책이 아니라 트리거다.** api-and-db.md의 판정 기준 그대로 —
--    "거부 사유를 사용자에게 설명해야 하면 트리거, 단순 접근 차단이면 정책".
--    특히 유니크 위반(23505)을 그냥 흘리면 toDbErrorMessage가 **닉네임 문구인
--    "이미 사용 중인 값이에요."** 로 접어 뜻이 어긋난다. create_post_with_poll이
--    선택지 중복에서 정확히 같은 이유로 P0001을 직접 던진 선례가 있다.
--
--    ⚠ **차단(user_block)은 반대다** — 이미 차단한 사람을 다시 차단하는 것은 목표 상태에
--      이미 도달한 것이라 훅이 23505를 **성공으로 흡수한다**. 신고는 "접수했어요"를 두 번
--      말하면 거짓말이라 설명해야 한다. 같은 23505라도 갈리는 지점이 여기다.
--
--  * **RPC로 내리지 않는다.** 이 쓰기는 RLS를 넘을 이유가 없다("쓰기가 RLS를 넘어야 할
--    때만 RPC"). definer로 올리면 컬럼 권한이 우회되어 삽입 컬럼 목록을 함수가 다시
--    못박아야 하고 보안 표면만 넓어진다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 사유
--
-- ⚠ post_category와 달리 **영문 키**다. 사유는 화면에 문장으로 보여야 해서
--   라벨 맵(features/report-post의 REPORT_REASON_LABEL)이 어차피 필요하고,
--   문구를 다듬어도 저장값이 흔들리지 않아야 한다. 값 목록의 단일 소스는 이 enum이고
--   클라이언트는 생성 타입(Database["public"]["Enums"]["report_reason"])으로 받는다.
-- ---------------------------------------------------------------------
create type public.report_reason as enum ('spam', 'abuse', 'sexual', 'false_info', 'etc');

create table public.post_report (
  post_id     bigint not null references public.post (id) on delete cascade,
  reporter_id uuid   not null references public.profiles (id) on delete cascade,
  reason      public.report_reason not null,
  created_at  timestamptz not null default now(),
  -- "한 사람이 한 글에 한 번" — 복합 PK가 유일성을 겸한다.
  -- identity 컬럼을 두지 않으므로 시퀀스도, "id를 직접 지정"하는 공격면도 없다(post_like 형태).
  primary key (post_id, reporter_id)
);

-- 내 신고 이력을 훑는 경로(탈퇴 cascade)는 PK 선두가 post_id라 인덱스를 못 탄다
create index post_report_reporter_id_idx on public.post_report (reporter_id);

comment on table public.post_report is
  '글 신고 — 사유만 저장한다. SELECT 정책이 없어 아무도 읽을 수 없다(관리 화면 없음). '
  '중복·자기 글 거부는 check_post_report 트리거가 P0001 한국어로 설명한다';

-- ---------------------------------------------------------------------
-- 2. 거부 사유를 말하는 트리거 (check_comment_depth와 같은 형태)
--
-- ⚠ security definer 필수 — 신고자에게 post_report SELECT 권한이 아예 없고(위 설계 원칙),
--   post 쪽도 **차단 필터가 걸린 RLS를 넘어** 작성자를 확인해야 한다.
--   호출자 권한으로 돌면 두 exists가 모두 0행을 보아 검사가 조용히 통과한다.
-- ---------------------------------------------------------------------
create or replace function public.check_post_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- ⚠ **BEFORE ROW 트리거는 RLS의 `with check`보다 먼저 돈다**(ExecInsert: BR 트리거 → WCO).
  --   그래서 정책이 어차피 거부할 행에까지 사유를 말하면 **에러 코드가 오라클이 된다** —
  --   P0001(조건 성립) vs 42501(불성립)로 갈려, 남의 uuid를 `reporter_id`에 실어 보내는 것만으로
  --   "그 사람이 이 글을 신고했는가"와 "이 글의 작성자가 누구인가"가 읽혔다(실측).
  --   아래 두 exists는 definer라 RLS를 넘어 `post`·`post_report`를 읽으므로, 감춰 둔 것이
  --   통째로 에러 채널로 새어 나간다 — **소프트 삭제된 글의 작성자까지** 특정됐다.
  --   → 내 명의가 아니면 아무 말도 하지 않고 판정을 정책에 넘긴다(42501 하나로 수렴).
  if new.reporter_id is distinct from (select auth.uid()) then
    return new;
  end if;

  if exists (
    select 1 from public.post p
     where p.id = new.post_id and p.author_id = new.reporter_id
  ) then
    raise exception '내가 쓴 글은 신고할 수 없어요.' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.post_report r
     where r.post_id = new.post_id and r.reporter_id = new.reporter_id
  ) then
    raise exception '이미 신고한 글이에요.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger post_report_guard
  before insert on public.post_report
  for each row execute function public.check_post_report();

-- ⚠ 이 revoke가 없으면 PUBLIC 기본 EXECUTE 때문에 rls.sql 17d가 실패한다.
--   트리거 발화는 EXECUTE 권한을 검사하지 않으므로 동작에는 영향이 없다
--   (sync_post_like_count 등 기존 트리거 함수와 같은 처리).
revoke execute on function public.check_post_report() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------
alter table public.post_report enable row level security;

-- ⚠ 삭제된 글 신고는 기존 헬퍼가 막는다 — 판정을 여기서 다시 짜지 않는다.
-- ⚠ 트리거는 BEFORE라 동시 요청 두 건이 둘 다 통과하는 창이 남는다. 그 창은 PK가 막고
--   (23505), 훅이 그 코드를 같은 한국어 문구로 접는다(use-cast-poll-vote의 23505 처리와
--   같은 형태). 트리거는 "설명"을, 제약은 "보장"을 담당한다.
create policy "post_report_insert_own" on public.post_report
  for insert to authenticated
  with check (reporter_id = (select auth.uid()) and public.post_is_alive(post_id));

-- ---------------------------------------------------------------------
-- 4. 권한 위생
-- ---------------------------------------------------------------------
revoke all on public.post_report from anon, authenticated;

-- ⚠ select를 주지 않는다(위 설계 원칙). created_at도 grant 목록 밖이라 시각 위조가 막힌다.
grant insert (post_id, reporter_id, reason) on public.post_report to authenticated;

revoke all on all sequences in schema public from anon, authenticated;
