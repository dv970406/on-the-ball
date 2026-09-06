-- =====================================================================
-- 어드민 RPC — 어드민의 DB 접근은 **전부 여기를 지난다**
--
-- 테이블에는 어드민용 정책도 grant도 한 줄도 열지 않는다. 이유가 넷이다.
--
--  1) **원자성.** 정책은 문장 단위 스냅샷 판정이라 "표가 0건일 때만 선택지
--     변경"을 지키지 못한다 — 어드민이 선택지를 끼워 넣는 순간 다른
--     사용자의 투표가 동시에 커밋되면 둘 다 통과한다. post_poll에서 실제로
--     뚫렸던 "진행 중인 투표에 선택지 끼워 넣기"와 같은 구멍이다.
--  2) **행 수 불변식.** "선택지 2~4개"는 CHECK로 셀 수 없어 지금은 rls.sql
--     섹션 30의 "0행" 질의가 대신 지킨다. 그게 성립하는 근거는 "입력이
--     우리가 쓴 마이그레이션뿐"인데, 어드민이 런타임에 지울 수 있게 되는
--     순간 그 전제가 사라진다. 여러 행을 한 번에 바꾸는 함수만이 이걸 다시
--     **구조**로 만든다.
--  3) **거부 사유.** 정책 위반은 영어 42501 하나뿐이다. "표가 이미 있어
--     선택지 개수를 바꿀 수 없어요"는 P0001로만 말할 수 있다.
--  4) **기존 검사가 살아남는다.** seed가 alice를 관리자로 만들므로 rls.sql
--     섹션 1·3·30a·31a의 `[❌차단]`이 관리자 컨텍스트에서 돈다. 정책+grant
--     방식이면 그 검사들이 전부 뒤집히는데, 그 실패를 "테스트가 낡았다"고
--     읽어 alice→bob으로 고치는 순간 보호막을 스스로 걷게 된다.
--     지금 형태면 **한 줄도 고치지 않아도 전부 통과한다** — 테이블 DML
--     표면이 여전히 0이기 때문이다.
--
-- ⚠ **이 파일이 되돌릴 수 있는 유일한 파일이다.** 어드민 규칙은 운영하며
--   반드시 바뀌므로 `create or replace` 한 번으로 고쳐지는 자리에 모아 두고,
--   되돌릴 수 없는 DDL(0001~0004)과 섞지 않는다.
--
-- ⚠ 모든 쓰기 함수의 첫 줄이 `is_admin()` 확인이다. 유저 id를 인자로 받지
--   않는다 — definer가 바꾸는 것은 "무엇을 할 수 있는가"이지 "누가
--   호출했는가"가 아니다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. 가려진 본문의 원본 보관
--
-- admin_mask_post가 본문을 파괴하지 않게 하는 장치다.
--
-- ⚠ **정책을 `using (false)`로 둔다.** RLS를 켜고 정책을 0개로 두면 rls.sql
--   17b("정책이 하나도 없는 테이블")에 걸리는데, 여기서 정책이 없는 것은
--   실수가 아니라 의도이므로 그 의도를 명시적 거부로 적는다.
-- ⚠ post.grant select를 컬럼 목록으로 좁혀 원본을 숨기는 방법은 쓰지 않는다 —
--   post의 모든 조회가 그 목록에 묶여 폭발 반경이 너무 크다.
-- ---------------------------------------------------------------------
create table public.post_moderation (
  post_id          bigint primary key references public.post (id) on delete cascade,
  original_content text not null,
  masked_at        timestamptz not null default now(),
  reason           text check (reason is null or char_length(reason) between 1 and 200)
);

comment on table public.post_moderation is
  '가려진 글의 원본 본문. 어드민 RPC만 읽고 쓴다(정책은 명시적 거부, grant 없음)';

alter table public.post_moderation enable row level security;

create policy "post_moderation_none" on public.post_moderation
  for select using (false);

revoke all on public.post_moderation from anon, authenticated;

-- =====================================================================
-- 1. 조회 — `returns setof <table>`, `language sql stable`
--
-- ⚠ **`language sql`이어야 한다.** plpgsql로 쓰면 함수가 인라인되지 않아
--   PostgREST가 붙인 order/limit이 **전체를 물질화한 뒤** 적용된다. 결과는
--   정확하고 느리기만 해서 빌드도 린트도 rls.sql도 잡지 못한다.
--
-- ⚠ setof 테이블이라 PostgREST가 select=·order=·limit=·리소스 임베딩을
--   그대로 붙여 주고, 생성 타입도 Tables[...]["Row"][]로 나와 기존 매퍼를
--   재사용할 수 있다.
--
-- ⚠ 비관리자에게는 **예외가 아니라 0행**이다(survey_results의 게이팅과 같은
--   형태). 쓰기만 P0001로 설명한다.
--
-- p_deleted: null=전부 / true=삭제된 것만 / false=살아 있는 것만
-- =====================================================================

create or replace function public.admin_match_list(p_deleted boolean default null)
returns setof public.match
language sql stable security definer set search_path = '' as $$
  select m.* from public.match m
   where public.is_admin()
     and (p_deleted is null
          or (p_deleted and m.deleted_at is not null)
          or (not p_deleted and m.deleted_at is null))
$$;

create or replace function public.admin_survey_list(p_deleted boolean default null)
returns setof public.survey
language sql stable security definer set search_path = '' as $$
  select s.* from public.survey s
   where public.is_admin()
     and (p_deleted is null
          or (p_deleted and s.deleted_at is not null)
          or (not p_deleted and s.deleted_at is null))
$$;

create or replace function public.admin_post_list(p_deleted boolean default null)
returns setof public.post
language sql stable security definer set search_path = '' as $$
  select p.* from public.post p
   where public.is_admin()
     and (p_deleted is null
          or (p_deleted and p.deleted_at is not null)
          or (not p_deleted and p.deleted_at is null))
$$;

create or replace function public.admin_notice_list(p_deleted boolean default null)
returns setof public.notice
language sql stable security definer set search_path = '' as $$
  select n.* from public.notice n
   where public.is_admin()
     and (p_deleted is null
          or (p_deleted and n.deleted_at is not null)
          or (not p_deleted and n.deleted_at is null))
$$;

-- 삭제된 문항의 선택지는 survey_option_select_alive가 감추므로, 어드민이
-- 복구 전에 내용을 확인하려면 이 경로가 필요하다.
create or replace function public.admin_survey_option_list(p_survey_id bigint)
returns setof public.survey_option
language sql stable security definer set search_path = '' as $$
  select o.* from public.survey_option o
   where public.is_admin() and o.survey_id = p_survey_id
$$;

-- ---------------------------------------------------------------------
-- 표 수.
--
-- ⚠ **화면이 survey_vote를 직접 셀 수 없다.** 그 테이블의 SELECT 정책은 "내 행만"이라
--   참여하지 않은 관리자에게는 언제나 0이 온다 — 그 값으로 버튼을 잠그면 잠금이
--   **항상 풀린 채**가 되어 어드민이 "왜 저장이 거부되지"를 겪는다.
-- ⚠ 이 값은 버튼을 미리 잠그는 **힌트**일 뿐이다. 최종 판정은 admin_set_survey_options가
--   지우고 넣은 뒤 다시 세는 검사가 한다(정책은 스냅샷이라 창이 남는다).
-- ---------------------------------------------------------------------
create or replace function public.admin_survey_vote_count(p_survey_id bigint)
returns bigint
language sql stable security definer set search_path = '' as $$
  select case when public.is_admin()
              then (select count(*) from public.survey_vote v where v.survey_id = p_survey_id)
              else 0::bigint end
$$;

-- =====================================================================
-- 2. 승부예측
-- =====================================================================

-- ---------------------------------------------------------------------
-- ⚠ **수정하면 동기화 잠금이 함께 걸린다.** 안 걸면 scripts/sync-matches.mjs가
--   다음 실행에서 season·matchday·팀·kickoff_at·스코어·voided_at을 통째로
--   덮어써 이 수정이 조용히 원복된다.
-- ⚠ `result`는 generated stored라 인자에 없다 — 스코어에서 파생되고
--   무효 경기에서 null이 되는 규칙까지 DB가 단독으로 소유한다.
-- ⚠ finished_at·home_score·away_score는 CHECK로 묶인 쌍이라 함수가 짝을 맞춘다.
--   호출부가 맞추게 두면 그 계약이 클라이언트로 새어 나간다.
-- ---------------------------------------------------------------------
create or replace function public.admin_update_match(
  p_id         bigint,
  p_season     text,
  p_matchday   smallint,
  p_home_team  text,
  p_away_team  text,
  p_kickoff_at timestamptz,
  -- ⚠ **기본값을 준다.** Postgres 함수 인자는 언제나 nullable인데 supabase 생성기가 그
  --   사실을 표현하지 못해 `p_home_score: number`로 나온다 — null(=결과 없음)이 정상
  --   입력인데 타입이 거부한다. 기본값이 있으면 `p_home_score?: number`가 되어 호출부가
  --   "넣지 않음"으로 표현할 수 있다(match.result가 generated인데 Insert에 남는 것과 같은
  --   클래스의 DX 문제이고, 이쪽은 시그니처로 고칠 수 있다).
  p_home_score smallint    default null,
  p_away_score smallint    default null,
  p_voided     boolean     default false
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_finished timestamptz;
  v_voided   timestamptz;
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있어요.' using errcode = 'P0001';
  end if;

  if (p_home_score is null) <> (p_away_score is null) then
    raise exception '스코어는 양쪽을 함께 넣거나 함께 비워 주세요.' using errcode = 'P0001';
  end if;

  if p_home_team = p_away_team then
    raise exception '같은 팀끼리 맞붙을 수 없어요.' using errcode = 'P0001';
  end if;

  /*
   * ⚠⚠ **킥오프 전 경기에는 스코어를 넣을 수 없다.**
   *   넣으면 `finished_at`이 킥오프보다 이른 시각으로 박히고 `result`(generated)가 확정되는데,
   *   `match_is_open`은 킥오프만 보므로 **예측이 여전히 열려 있다** — 화면에 결과가 뜬 채로
   *   예측할 수 있고, 그 표가 곧바로 적중률 분모·분자에 들어간다(실측).
   *   동기화 스크립트는 이 상태를 만들 수 없다(제공자가 킥오프 전에 최종 스코어를 주지 않는다)
   *   — **어드민 경로가 생기면서 처음 도달 가능해진 상태**라 여기서 막는다.
   *   라운드를 잘못 골라 다음 주 경기에 스코어를 적는 오타 한 번으로 재현된다.
   */
  if p_home_score is not null and p_kickoff_at > now() then
    raise exception '킥오프 전 경기에는 스코어를 넣을 수 없어요. 킥오프 시각을 먼저 확인해 주세요.'
      using errcode = 'P0001';
  end if;

  select m.finished_at, m.voided_at into v_finished, v_voided
    from public.match m where m.id = p_id;

  if not found then
    raise exception '경기를 찾을 수 없어요.' using errcode = 'P0001';
  end if;

  update public.match m set
    season     = p_season,
    matchday   = p_matchday,
    home_team  = p_home_team,
    away_team  = p_away_team,
    kickoff_at = p_kickoff_at,
    home_score = p_home_score,
    away_score = p_away_score,
    -- 스코어가 들어오면 종료 시각을 세우고, 지우면 함께 지운다(CHECK가 쌍을 요구한다)
    finished_at = case when p_home_score is null then null else coalesce(v_finished, now()) end,
    voided_at   = case when p_voided then coalesce(v_voided, now()) else null end,
    -- 종료·무효 경기에는 진행 분이 남을 수 없다(match_live_minute_not_ended)
    live_minute = case
                    when p_home_score is null and not p_voided then m.live_minute
                    else null
                  end,
    admin_locked_at = now()
  where m.id = p_id;
end;
$$;

-- 잠금 해제 — 다시 동기화가 이 경기를 관리한다
create or replace function public.admin_unlock_match(p_id bigint)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있어요.' using errcode = 'P0001';
  end if;
  update public.match set admin_locked_at = null where id = p_id;
end;
$$;

create or replace function public.admin_soft_delete_match(p_id bigint)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있어요.' using errcode = 'P0001';
  end if;
  update public.match set deleted_at = now() where id = p_id and deleted_at is null;
  -- ⚠ 조용히 성공하지 않는다 — 다른 관리자가 방금 지운 항목에 "삭제했어요"가 뜨면 안 된다
  --   (`admin_update_*`가 "찾을 수 없어요"를 던지는 것과 형태를 맞춘다).
  if not found then
    raise exception '경기를 찾을 수 없거나 이미 지워졌어요.' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.admin_restore_match(p_id bigint)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있어요.' using errcode = 'P0001';
  end if;
  update public.match set deleted_at = null where id = p_id;
  if not found then
    raise exception '경기를 찾을 수 없어요.' using errcode = 'P0001';
  end if;
end;
$$;

-- =====================================================================
-- 3. 입축구
-- =====================================================================

-- ---------------------------------------------------------------------
-- 선택지 묶음의 규칙을 한 곳이 소유한다.
--
--  · 라벨은 정규형이어야 하고 보이는 글자가 있어야 하며 서로 달라야 한다
--    (접지 않으면 unique(survey_id, label)이 제로폭 문자로 그냥 우회된다)
--  · 색은 bg/text가 **쌍**이거나 둘 다 없어야 한다(DB CHECK와 같은 규칙)
--  · 색은 **한 문항 안에서 전부 있거나 전무**여야 한다 — 한 면만 색이 없으면
--    splitCount가 분할 카드를 포기해 카드가 통째로 다른 모양이 된다
-- ---------------------------------------------------------------------
create or replace function public.admin_validate_survey_options(p_options jsonb)
returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_n int;
  v_colored int;
  v_labels text[];
begin
  if p_options is null or jsonb_typeof(p_options) <> 'array' then
    raise exception '선택지를 입력해 주세요.' using errcode = 'P0001';
  end if;

  v_n := jsonb_array_length(p_options);
  if v_n not between 2 and 4 then
    raise exception '선택지는 2개에서 4개까지예요.' using errcode = 'P0001';
  end if;

  select array_agg(public.normalize_nickname(o.value ->> 'label'))
    into v_labels
    from jsonb_array_elements(p_options) as o(value);

  if exists (select 1 from unnest(v_labels) l
              where l is null or not public.has_visible_char(l)) then
    raise exception '선택지를 입력해 주세요.' using errcode = 'P0001';
  end if;

  -- ⚠ 23505를 그대로 내보내면 toDbErrorMessage가 닉네임 문구인
  --   "이미 사용 중인 값이에요."로 접어 뜻이 어긋난다.
  if (select count(distinct l) from unnest(v_labels) l) <> v_n then
    raise exception '같은 선택지를 두 번 쓸 수 없어요.' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_options) as o(value)
     where (nullif(o.value ->> 'bgColor', '') is null)
        <> (nullif(o.value ->> 'textColor', '') is null)
  ) then
    raise exception '배경색과 글자색은 함께 넣어 주세요.' using errcode = 'P0001';
  end if;

  select count(*) into v_colored
    from jsonb_array_elements(p_options) as o(value)
   where nullif(o.value ->> 'bgColor', '') is not null;

  if v_colored <> 0 and v_colored <> v_n then
    raise exception '색은 모든 선택지에 넣거나 모두 비워 주세요.' using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function public.admin_validate_survey_options(jsonb) from public, anon, authenticated;

create or replace function public.admin_create_survey(
  p_title     text,
  p_options   jsonb,
  -- ⚠ 기본값이 붙는 인자는 **뒤로 모아야** 한다(SQL 문법) → 순서가 (제목, 선택지, 마감)이다.
  --   비우면 DB 기본값(생성 + 7일)이 적용된다.
  p_closes_at timestamptz default null
)
returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint;
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있어요.' using errcode = 'P0001';
  end if;

  if p_title is null or not public.has_visible_char(p_title) then
    raise exception '제목을 입력해 주세요.' using errcode = 'P0001';
  end if;

  perform public.admin_validate_survey_options(p_options);

  insert into public.survey (title, closes_at)
  values (public.normalize_nickname(p_title), coalesce(p_closes_at, now() + interval '7 days'))
  returning id into v_id;

  insert into public.survey_option
         (survey_id, label, sort_order, subtitle, bg_color, text_color, image_path)
  select v_id,
         public.normalize_nickname(o.value ->> 'label'),
         (o.ord)::smallint,
         nullif(public.normalize_nickname(coalesce(o.value ->> 'subtitle', '')), ''),
         nullif(o.value ->> 'bgColor',   ''),
         nullif(o.value ->> 'textColor', ''),
         nullif(o.value ->> 'imagePath', '')
    from jsonb_array_elements(p_options) with ordinality as o(value, ord);

  return v_id;
end;
$$;

create or replace function public.admin_update_survey(
  p_id        bigint,
  p_title     text,
  p_closes_at timestamptz default null
)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있어요.' using errcode = 'P0001';
  end if;

  if p_title is null or not public.has_visible_char(p_title) then
    raise exception '제목을 입력해 주세요.' using errcode = 'P0001';
  end if;

  /*
   * ⚠ **`coalesce`가 없으면 마감 칸을 비운 저장이 통째로 실패한다.** `survey.closes_at`은
   *   `not null`이라 null이 들어오면 23502이고, `toDbErrorMessage`가 "필수 값이 비어 있어요."로
   *   접어 **어느 칸이 문제인지도 말하지 못한다**(실측). 등록(`admin_create_survey`)만
   *   기본값 coalesce를 갖고 있어 "비우면 기본값"이라는 설명이 create에서만 참이었다.
   * ⚠ 수정에서 비우면 **기존 마감을 유지한다.** 컬럼이 not null이라 "비움"이 표현할 수 있는
   *   상태가 아니므로, 공지의 `closes_at`(null = 무기한)처럼 전체 치환으로 둘 수 없다.
   */
  update public.survey
     set title = public.normalize_nickname(p_title),
         closes_at = coalesce(p_closes_at, closes_at)
   where id = p_id;

  if not found then
    raise exception '입축구를 찾을 수 없어요.' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 선택지 **묶음 교체** — 표가 0건일 때만.
--
-- ⚠ 개수를 바꿀 수 있는 유일한 경로다. 표가 있으면 아래 admin_edit_survey_option
--   (개수를 못 바꾸는 형태)만 남는다.
-- ⚠ **지우고 넣은 뒤 다시 센다.** 정책은 스냅샷 판정이라 "지금 0건"을 본
--   뒤에도 다른 사용자의 투표가 같은 순간 커밋될 수 있다 — 끝에서 한 번 더
--   세고 0이 아니면 raise해 트랜잭션째 되돌린다.
-- ---------------------------------------------------------------------
create or replace function public.admin_set_survey_options(
  p_survey_id bigint,
  p_options   jsonb
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_votes bigint;
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있어요.' using errcode = 'P0001';
  end if;

  perform 1 from public.survey where id = p_survey_id;
  if not found then
    raise exception '입축구를 찾을 수 없어요.' using errcode = 'P0001';
  end if;

  /*
   * ⚠⚠ **여기서 잠그지 않으면 사용자의 표가 조용히 사라진다.**
   *   `survey_vote → survey_option` FK가 `on delete cascade`라, 아래 `delete from
   *   survey_option`이 **경합으로 방금 들어온 표를 함께 지운다.** 그러면 끝에서 다시 세어도
   *   0이 나온다 — 재검사가 찾으려던 증거를 자기가 지운 셈이라 **구조적으로 발화할 수 없다**
   *   (두 세션으로 실측: B가 투표를 커밋하는 사이 A의 교체가 예외 없이 성공하고 표가 0이 됐다).
   *
   *   `for update`가 그 창을 닫는다. `survey_vote` insert는 참조하는 선택지 행에
   *   `for key share`를 잡으므로 이 잠금과 충돌한다 — 미커밋 투표가 있으면 여기서 **기다렸다가**
   *   그 표를 세게 되고, 반대로 우리가 먼저 잠그면 투표가 기다렸다가 23503으로 거부된다
   *   (표가 조용히 사라지는 대신 투표한 사람이 사실을 알게 된다).
   *
   * ⚠ FK를 `on delete restrict`로 바꾸는 선택지도 있지만, 그러면 문항 hard delete 경로가
   *   함께 막힌다 — 잠금은 이 함수 안에서만 값을 치른다.
   */
  perform 1 from public.survey_option where survey_id = p_survey_id for update;

  select count(*) into v_votes from public.survey_vote where survey_id = p_survey_id;
  if v_votes > 0 then
    raise exception '이미 참여한 사람이 있어 선택지를 바꿀 수 없어요. 문구·색만 고칠 수 있어요.'
      using errcode = 'P0001';
  end if;

  perform public.admin_validate_survey_options(p_options);

  delete from public.survey_option where survey_id = p_survey_id;

  insert into public.survey_option
         (survey_id, label, sort_order, subtitle, bg_color, text_color, image_path)
  select p_survey_id,
         public.normalize_nickname(o.value ->> 'label'),
         (o.ord)::smallint,
         nullif(public.normalize_nickname(coalesce(o.value ->> 'subtitle', '')), ''),
         nullif(o.value ->> 'bgColor',   ''),
         nullif(o.value ->> 'textColor', ''),
         nullif(o.value ->> 'imagePath', '')
    from jsonb_array_elements(p_options) with ordinality as o(value, ord);

  /*
   * ⚠ **여기에 "다시 센다"를 두지 않는다.** 한때 뒀는데 cascade 때문에 언제나 0이라
   *   **발화할 수 없는 검사**였다 — 작동한다고 믿게 만드는 코드가 없는 것보다 나쁘다.
   *   창을 닫는 것은 위의 `for update`다.
   */

  update public.survey set updated_at = now() where id = p_survey_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 선택지 **한 칸**의 문구·색·이미지 수정 — 표가 있어도 언제나 가능하다.
--
-- ⚠ **개수를 못 바꾼다는 것이 시그니처로 표현된다.** 이 함수에는 선택지를
--   더하거나 뺄 방법이 없다.
-- ⚠ 라벨을 서로 맞바꾸면 unique(survey_id, label)에 걸린다 — 23505는
--   toDbErrorMessage가 닉네임 문구로 접으므로 여기서 P0001로 바꿔 던진다.
-- ---------------------------------------------------------------------
create or replace function public.admin_edit_survey_option(
  p_option_id  bigint,
  p_survey_id  bigint,
  p_label      text,
  p_subtitle   text default null,
  p_bg_color   text default null,
  p_text_color text default null,
  p_image_path text default null
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_survey_id bigint;
  v_label text := public.normalize_nickname(coalesce(p_label, ''));
  v_n int;
  v_colored int;
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있어요.' using errcode = 'P0001';
  end if;

  if not public.has_visible_char(v_label) then
    raise exception '선택지를 입력해 주세요.' using errcode = 'P0001';
  end if;

  if (nullif(p_bg_color, '') is null) <> (nullif(p_text_color, '') is null) then
    raise exception '배경색과 글자색은 함께 넣어 주세요.' using errcode = 'P0001';
  end if;

  /*
   * ⚠ **문항 id를 함께 받아 대조한다.** 없으면 화면이 들고 있던 stale한 선택지 id가
   *   에러가 아니라 **다른 문항의 선택지를 조용히 고친다**(그쪽 `updated_at`까지 민다).
   */
  begin
    update public.survey_option
       set label      = v_label,
           subtitle   = nullif(public.normalize_nickname(coalesce(p_subtitle, '')), ''),
           bg_color   = nullif(p_bg_color, ''),
           text_color = nullif(p_text_color, ''),
           image_path = nullif(p_image_path, '')
     where id = p_option_id and survey_id = p_survey_id
     returning survey_id into v_survey_id;
  exception when unique_violation then
    raise exception '같은 선택지를 두 번 쓸 수 없어요.' using errcode = 'P0001';
  end;

  if v_survey_id is null then
    raise exception '선택지를 찾을 수 없어요.' using errcode = 'P0001';
  end if;

  /*
   * ⚠⚠ **문항 전체의 색 불변식을 다시 본다.** 이 함수는 한 칸만 보므로 쌍(bg↔text)만
   *   검사해서는 "한 문항 안에서 전부 있거나 전무"를 지키지 못한다 — 색이 있는 문항에서
   *   한 칸의 색만 지우면 `splitCount`가 분할 카드를 포기해 **카드 모양이 통째로 바뀌고**
   *   `rls.sql` 섹션 30의 "색이 일부에만 있는 입축구가 0행" 검사가 깨진다(실측).
   *   생성·묶음 교체 경로는 `admin_validate_survey_options`가 막는데 여기만 새고 있었다.
   */
  select count(*), count(*) filter (where bg_color is not null)
    into v_n, v_colored
    from public.survey_option where survey_id = v_survey_id;

  if v_colored <> 0 and v_colored <> v_n then
    raise exception '색은 모든 선택지에 넣거나 모두 비워 주세요. 하나만 비면 분할 카드가 깨져요.'
      using errcode = 'P0001';
  end if;

  -- 부모의 "마지막 수정"이 자식 편집을 대표한다(survey_option에는 updated_at이 없다)
  update public.survey set updated_at = now() where id = v_survey_id;
end;
$$;

create or replace function public.admin_soft_delete_survey(p_id bigint)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있어요.' using errcode = 'P0001';
  end if;
  update public.survey set deleted_at = now() where id = p_id and deleted_at is null;
  -- ⚠ 조용히 성공하지 않는다 — 다른 관리자가 방금 지운 항목에 "삭제했어요"가 뜨면 안 된다
  --   (`admin_update_*`가 "찾을 수 없어요"를 던지는 것과 형태를 맞춘다).
  if not found then
    raise exception '입축구를 찾을 수 없거나 이미 지워졌어요.' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.admin_restore_survey(p_id bigint)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있어요.' using errcode = 'P0001';
  end if;
  update public.survey set deleted_at = null where id = p_id;
  if not found then
    raise exception '입축구를 찾을 수 없어요.' using errcode = 'P0001';
  end if;
end;
$$;

-- =====================================================================
-- 4. 공지사항
-- =====================================================================

create or replace function public.admin_create_notice(
  p_type      public.notice_type,
  p_title     text,
  p_body      text,
  p_opens_at  timestamptz default null,
  p_closes_at timestamptz default null
)
returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint;
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있어요.' using errcode = 'P0001';
  end if;

  if p_title is null or not public.has_visible_char(p_title) then
    raise exception '제목을 입력해 주세요.' using errcode = 'P0001';
  end if;
  if p_body is null or not public.has_visible_char(p_body) then
    raise exception '내용을 입력해 주세요.' using errcode = 'P0001';
  end if;
  if p_closes_at is not null and p_closes_at <= coalesce(p_opens_at, now()) then
    raise exception '노출 종료는 시작보다 뒤여야 해요.' using errcode = 'P0001';
  end if;

  insert into public.notice (type, title, body, opens_at, closes_at)
  values (p_type, p_title, p_body, coalesce(p_opens_at, now()), p_closes_at)
  returning id into v_id;

  return v_id;
end;
$$;

-- ⚠ **전체 치환이다.** 부분 갱신(null=안 바꿈)으로 두면 closes_at을
--   null(무기한)로 되돌릴 방법이 사라진다.
create or replace function public.admin_update_notice(
  p_id        bigint,
  p_type      public.notice_type,
  p_title     text,
  p_body      text,
  p_opens_at  timestamptz default null,
  p_closes_at timestamptz default null
)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있어요.' using errcode = 'P0001';
  end if;

  if p_title is null or not public.has_visible_char(p_title) then
    raise exception '제목을 입력해 주세요.' using errcode = 'P0001';
  end if;
  if p_body is null or not public.has_visible_char(p_body) then
    raise exception '내용을 입력해 주세요.' using errcode = 'P0001';
  end if;
  if p_closes_at is not null and p_closes_at <= coalesce(p_opens_at, now()) then
    raise exception '노출 종료는 시작보다 뒤여야 해요.' using errcode = 'P0001';
  end if;

  update public.notice
     set type = p_type, title = p_title, body = p_body,
         opens_at = coalesce(p_opens_at, now()), closes_at = p_closes_at
   where id = p_id;

  if not found then
    raise exception '공지를 찾을 수 없어요.' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.admin_soft_delete_notice(p_id bigint)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있어요.' using errcode = 'P0001';
  end if;
  update public.notice set deleted_at = now() where id = p_id and deleted_at is null;
  -- ⚠ 조용히 성공하지 않는다 — 다른 관리자가 방금 지운 항목에 "삭제했어요"가 뜨면 안 된다
  --   (`admin_update_*`가 "찾을 수 없어요"를 던지는 것과 형태를 맞춘다).
  if not found then
    raise exception '공지를 찾을 수 없거나 이미 지워졌어요.' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.admin_restore_notice(p_id bigint)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있어요.' using errcode = 'P0001';
  end if;
  update public.notice set deleted_at = null where id = p_id;
  if not found then
    raise exception '공지를 찾을 수 없어요.' using errcode = 'P0001';
  end if;
end;
$$;

-- =====================================================================
-- 5. 피드 — **본문을 자유 편집하지 않는다**
--
-- 아래 함수 어느 것도 `content`를 인자로 받지 않는다. 그것이 "어드민은 남의
-- 글을 고쳐 쓰지 않는다"의 유일한 구조적 보증이다 — 새 본문을 클라이언트가
-- 계산해 보내면 그게 곧 자유 편집이다.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 가려진 글인가 — `post_update_own` 정책이 부른다.
--
-- ⚠⚠ **이게 없으면 가리기가 사실상 아무것도 하지 않는다.** `post_update_own`이
--   `author_id = auth.uid()`만 보므로 작성자가 곧바로 본문을 다시 써 넣을 수 있었다(실측).
--   더 나쁜 것은 그 다음이다 — 그 상태에서 관리자가 `admin_unmask_post`를 부르면
--   **작성자가 새로 쓴 글이 지워지고 문제 원문이 다시 게시된다.**
-- ⚠ 인라인 `exists`를 정책에 쓰지 않는다(상관관계를 잃어 부모 테이블을 훑는다) →
--   `post_is_alive`·`is_blocked`와 같은 형태의 stable definer 헬퍼로 뺀다.
-- ⚠ anon에는 열지 않는다 — 부르는 정책이 `to authenticated`라 화이트리스트가 늘지 않는다.
-- ⚠ **가리기는 `title`을 다루지 않는다.** 제목이 문제면 글 자체를 지우는 것이 이 화면의
--   계약이다(어드민 화면 문구도 그렇게 안내한다).
-- ---------------------------------------------------------------------
create or replace function public.post_is_masked(p_post_id bigint)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.post_moderation m where m.post_id = p_post_id)
$$;

revoke execute on function public.post_is_masked(bigint) from public, anon;
grant  execute on function public.post_is_masked(bigint) to authenticated;

-- 작성자의 수정 권한에서 **가려진 글만** 뺀다(나머지 동작은 그대로다)
drop policy "post_update_own" on public.post;
create policy "post_update_own" on public.post
  for update to authenticated
  using      (author_id = (select auth.uid()) and not public.post_is_masked(id))
  with check (author_id = (select auth.uid()) and not public.post_is_masked(id));

-- ---------------------------------------------------------------------
-- 본문을 고치되 **"수정됨"을 남기지 않는다.**
--
-- ⚠ `post_touch_updated_at`의 WHEN 절이 `content`를 포함해서, 어드민이 이미지를 빼거나
--   본문을 가리면 `updated_at`이 움직이고 `isEdited`(`created_at <> updated_at`)가 true가
--   된다 — **작성자가 고친 적 없는 글에 "수정됨"이 붙고, 되돌려도 그 표시는 돌아오지
--   않는다**(실측). 이 앱에서 "수정됨"의 뜻은 "작성자가 고쳤다"이고,
--   `match`·`survey`·`notice`의 트리거를 WHEN으로 좁힌 것도 같은 이유였다 — post의 어드민
--   경로에만 그 배려가 빠져 있었다.
-- ⚠ 트리거는 BEFORE라 같은 문장에서 `updated_at`을 지정해도 덮어쓴다 → **두 번째 UPDATE로
--   되돌린다.** 그 문장은 title·content를 건드리지 않으므로 WHEN 절이 발화하지 않는다.
-- ⚠ `app/sitemap.ts`의 글 `lastModified`도 이 컬럼을 읽는다 — 되돌리지 않으면 어드민 조치가
--   크롤러에게 "저자가 글을 고쳤다"는 신호로 나간다.
-- ---------------------------------------------------------------------
create or replace function public.admin_set_post_content(p_post_id bigint, p_content text)
returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_updated_at timestamptz;
begin
  select p.updated_at into v_updated_at from public.post p where p.id = p_post_id;

  update public.post set content = p_content where id = p_post_id;
  update public.post set updated_at = v_updated_at where id = p_post_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 본문 이미지 제거. p_urls가 null이면 전부, 아니면 그중 일치하는 것만.
-- 지운 URL을 돌려주므로 호출부가 Storage 파일까지 지울 수 있다.
--
-- ⚠ 이미지를 다 걷어내 본문에 보이는 글자가 남지 않으면 has_visible_char가
--   23514로 막는다 — 영어 에러 대신 사유를 설명하고 대안을 알린다.
-- ⚠ excerpt는 generated stored라 따라온다(그 생성식이 이미 이미지 마크다운을
--   지운다).
-- ---------------------------------------------------------------------
create or replace function public.admin_strip_post_images(
  p_post_id bigint,
  p_urls    text[] default null
)
returns text[]
language plpgsql security definer set search_path = '' as $$
declare
  v_content text;
  v_next    text;
  v_removed text[];
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있어요.' using errcode = 'P0001';
  end if;

  select p.content into v_content from public.post p where p.id = p_post_id;
  if not found then
    raise exception '글을 찾을 수 없어요.' using errcode = 'P0001';
  end if;

  /*
   * ⚠ **URL 안의 괄호를 한 겹 허용한다.** `([^)]*)`는 첫 `)`에서 멈추는데, 본문은 사용자가
   *   외부 주소를 직접 적을 수 있는 자유 텍스트라 `…/b(1).png` 같은 주소가 실제로 들어온다
   *   (위키미디어가 대표적). 그대로 두면 캡처가 잘려 ① 그 URL을 지정한 제거가 조용한
   *   no-op이 되고 ② 전부 제거에서는 **본문에 `.png)` 잔여물이 남아 남의 글이 훼손된다**
   *   (되돌릴 원본도 없다 — 실측). CommonMark도 균형 잡힌 괄호를 URL로 인정하므로
   *   렌더러(`react-markdown`)와 판정을 맞추는 방향이기도 하다.
   * ⚠ 클라이언트의 `extractImageUrls`가 **같은 정규식**을 써야 한다(한쪽만 고치면 화면이
   *   보여준 목록과 실제로 지워지는 대상이 갈린다).
   */
  select coalesce(array_agg(m[1]), '{}')
    into v_removed
    from regexp_matches(v_content, '!\[[^\]]*\]\(((?:[^()]|\([^()]*\))*)\)', 'g') as m
   where p_urls is null or m[1] = any(p_urls);

  if array_length(v_removed, 1) is null then
    return '{}';
  end if;

  v_next := v_content;
  if p_urls is null then
    v_next := regexp_replace(v_next, '!\[[^\]]*\]\((?:[^()]|\([^()]*\))*\)', '', 'g');
  else
    -- 지정된 URL을 담은 이미지 마크다운만 걷어낸다
    v_next := regexp_replace(
      v_next,
      '!\[[^\]]*\]\(' || (select string_agg('(?:' || regexp_replace(u, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || ')', '|')
                            from unnest(v_removed) u) || '\)',
      '', 'g');
  end if;

  if not public.has_visible_char(v_next) then
    raise exception '이미지를 빼면 본문이 비어요. 본문 가리기나 글 삭제를 써 주세요.'
      using errcode = 'P0001';
  end if;

  perform public.admin_set_post_content(p_post_id, v_next);
  return v_removed;
end;
$$;

-- ---------------------------------------------------------------------
-- 본문 가리기 — 원본은 post_moderation에 남는다.
--
-- ⚠ 두 번 가려도 **최초 원본**을 지킨다(do nothing). 안 그러면 두 번째
--   가리기가 안내 문구를 "원본"으로 덮어써 되돌릴 수 없게 된다.
-- ---------------------------------------------------------------------
create or replace function public.admin_mask_post(
  p_post_id bigint,
  p_reason  text default null
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_content text;
  v_reason  text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있어요.' using errcode = 'P0001';
  end if;

  select p.content into v_content from public.post p where p.id = p_post_id;
  if not found then
    raise exception '글을 찾을 수 없어요.' using errcode = 'P0001';
  end if;

  /*
   * ⚠ **원본은 최초 것을 지키고 사유·시각은 최신으로 갱신한다.** `do nothing`으로 두면
   *   본문에는 두 번째 사유가 찍히는데 기록에는 첫 사유가 남아 **화면과 기록이 갈렸다**.
   *   `original_content`를 건드리지 않는 것이 되돌리기의 전제다(두 번째 가리기의 "원본"은
   *   이미 안내 문구다).
   */
  insert into public.post_moderation (post_id, original_content, reason)
  values (p_post_id, v_content, v_reason)
  on conflict (post_id) do update set reason = excluded.reason, masked_at = now();

  perform public.admin_set_post_content(
    p_post_id,
    '운영정책에 따라 이 글의 본문이 가려졌어요.'
      || case when v_reason is null then '' else E'\n\n사유: ' || v_reason end
  );
end;
$$;

create or replace function public.admin_unmask_post(p_post_id bigint)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_original text;
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있어요.' using errcode = 'P0001';
  end if;

  select m.original_content into v_original
    from public.post_moderation m where m.post_id = p_post_id;

  if not found then
    raise exception '되돌릴 원본이 없어요.' using errcode = 'P0001';
  end if;

  perform public.admin_set_post_content(p_post_id, v_original);
  delete from public.post_moderation where post_id = p_post_id;
end;
$$;

create or replace function public.admin_soft_delete_post(p_id bigint)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있어요.' using errcode = 'P0001';
  end if;
  update public.post set deleted_at = now() where id = p_id and deleted_at is null;
  -- ⚠ 조용히 성공하지 않는다 — 다른 관리자가 방금 지운 항목에 "삭제했어요"가 뜨면 안 된다
  --   (`admin_update_*`가 "찾을 수 없어요"를 던지는 것과 형태를 맞춘다).
  if not found then
    raise exception '글를 찾을 수 없거나 이미 지워졌어요.' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.admin_restore_post(p_id bigint)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있어요.' using errcode = 'P0001';
  end if;
  update public.post set deleted_at = null where id = p_id;
  if not found then
    raise exception '글를 찾을 수 없어요.' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 딸린 투표의 **문구만** 수정.
--
-- ⚠ 입력 id 집합이 기존 id 집합과 **정확히 일치**해야 한다 — 개수를 바꿀 수
--   없다는 규칙이 검증으로 표현된다. 이미 던져진 표가 선택지 id에 붙어
--   있으므로 집계가 어긋나지 않는다.
-- ⚠ 라벨을 서로 맞바꾸는 경우가 있어 **두 단계로 쓴다.** unique(post_id, label)은
--   행마다 즉시 검사되므로 한 문장으로 맞바꾸면 중간 상태에서 걸린다.
-- ---------------------------------------------------------------------
create or replace function public.admin_edit_post_poll(
  p_post_id  bigint,
  p_question text,
  p_options  jsonb   -- [{"id": 1, "label": "…"}]
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_labels text[];
  v_n int;
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있어요.' using errcode = 'P0001';
  end if;

  perform 1 from public.post_poll where post_id = p_post_id;
  if not found then
    raise exception '이 글에는 투표가 없어요.' using errcode = 'P0001';
  end if;

  if p_question is null or not public.has_visible_char(p_question) then
    raise exception '투표 질문을 입력해 주세요.' using errcode = 'P0001';
  end if;

  if p_options is null or jsonb_typeof(p_options) <> 'array' then
    raise exception '선택지를 입력해 주세요.' using errcode = 'P0001';
  end if;
  v_n := jsonb_array_length(p_options);

  /*
   * ⚠ **id가 숫자인지 먼저 본다.** `::bigint` 캐스트가 먼저 터지면 22P02가 나가고
   *   `toDbErrorMessage`가 "허용되지 않는 값이에요."로 접어 **무엇이 문제인지 말하지 못한다.**
   */
  if exists (
    select 1 from jsonb_array_elements(p_options) as o(value)
     where jsonb_typeof(o.value -> 'id') is distinct from 'number'
  ) then
    raise exception '선택지 정보가 올바르지 않아요.' using errcode = 'P0001';
  end if;

  /*
   * ⚠⚠ **집합으로 비교한다.** 한때 "개수 == 개수 + 모든 입력 id가 존재"만 봤는데,
   *   그건 집합이 아니라 개수와 멤버십이라 **같은 id를 N번 넣으면 통과했다**(실측).
   *   그러면 1단계의 임시 라벨(`#id`)이 되돌려지지 않은 칸에 남아 **사용자 화면의 선택지가
   *   `#2`·`#3`으로 바뀐다** — 던져진 표는 그 id에 그대로 붙어 있다.
   *   `except` 양방향이 "정확히 일치"를 실제로 표현한다.
   */
  if exists (
    select (o.value ->> 'id')::bigint from jsonb_array_elements(p_options) as o(value)
    except
    select po.id from public.post_poll_option po where po.post_id = p_post_id
  ) or exists (
    select po.id from public.post_poll_option po where po.post_id = p_post_id
    except
    select (o.value ->> 'id')::bigint from jsonb_array_elements(p_options) as o(value)
  ) or v_n <> (
    -- 중복 id를 잡는다 — 위 두 `except`는 집합이라 중복을 보지 못한다
    select count(distinct (o.value ->> 'id')::bigint) from jsonb_array_elements(p_options) as o(value)
  ) then
    raise exception '선택지를 더하거나 뺄 수 없어요. 문구만 고칠 수 있어요.'
      using errcode = 'P0001';
  end if;

  select array_agg(public.normalize_nickname(o.value ->> 'label'))
    into v_labels
    from jsonb_array_elements(p_options) as o(value);

  if exists (select 1 from unnest(v_labels) l
              where l is null or not public.has_visible_char(l)) then
    raise exception '선택지를 입력해 주세요.' using errcode = 'P0001';
  end if;
  if (select count(distinct l) from unnest(v_labels) l) <> v_n then
    raise exception '같은 선택지를 두 번 쓸 수 없어요.' using errcode = 'P0001';
  end if;

  update public.post_poll set question = p_question where post_id = p_post_id;

  -- ⚠ 1단계: 충돌하지 않는 임시 라벨(id는 전역 유일하고 보이는 글자가 있다)
  update public.post_poll_option set label = '#' || id::text where post_id = p_post_id;

  -- 2단계: 최종 라벨
  update public.post_poll_option po
     set label = public.normalize_nickname(o.value ->> 'label')
    from jsonb_array_elements(p_options) as o(value)
   where po.post_id = p_post_id and po.id = (o.value ->> 'id')::bigint;
end;
$$;

-- =====================================================================
-- 6. 권한 — 전부 authenticated 전용. anon은 EXECUTE 자체가 없다.
--
-- ⚠ 함수는 기본적으로 PUBLIC에 EXECUTE가 부여된다 — 그대로 두면 비로그인도
--   호출한다(안에서 is_admin()이 막지만, 표면을 열어 둘 이유가 없다).
-- ⚠ anon에 여는 함수는 `rls.sql` 17d의 화이트리스트가 전량을 대조한다.
--   여기 있는 것 중 그 목록에 들어가는 것은 **하나도 없다.**
-- =====================================================================
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'admin\_%'
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant  execute on function %s to authenticated', r.sig);
  end loop;
end;
$$;

/*
 * 내부 헬퍼는 authenticated에도 열지 않는다(호출부가 definer 함수 안이다).
 *
 * ⚠ **위 루프 뒤에 와야 한다.** 루프가 `admin\_%`를 전부 잡아 grant하므로, 함수 정의 옆에
 *   적어 두면 다시 열린다. 특히 `admin_set_post_content`는 열리면 **작성자가 자기 글을
 *   "수정됨" 없이 고치는 경로**가 된다(security invoker라 남의 글은 RLS가 막지만,
 *   본인 글의 수정 흔적을 지울 수 있는 것 자체가 계약 위반이다).
 */
revoke execute on function public.admin_validate_survey_options(jsonb) from public, anon, authenticated;
revoke execute on function public.admin_set_post_content(bigint, text) from public, anon, authenticated;

notify pgrst, 'reload schema';
