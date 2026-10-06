-- =====================================================================
-- 딜 성사 예측 — "이번 이적 창 안에 오피셜이 뜰까?" 원탭 투표와 그 채점(예측 랭킹)
--
-- 표가 넷이고 writer가 셋으로 갈린다.
--   1. transfer_window                  — 이적 창 일정의 DB 사본. writer는 파생 스크립트(windows.json → upsert)
--   2. transfer_deal_prediction         — 내 예측(자기 행만). 회차(round_key)·시각은 트리거가 정한다
--   3. transfer_deal_prediction_tally   — 딜·회차별 집계. definer 트리거가 단독으로 관리한다
--   4. transfer_prediction_score        — 사람별 점수·순위. writer는 파생 스크립트(매시 채점)
-- 그리고 `transfer_deal.settled_at`(결과가 정해진 시각)을 더한다 — writer는 파생 스크립트다.
--
-- 규칙(사용자 결정, 2026-10-06):
--   * 질문은 "이번 창 안에 오피셜이 뜰까?"다. 회차 = 표를 던진 순간 **아직 닫히지 않은 가장 이른 창**이다
--     (창 사이에 던진 표는 다음 창의 표다). 창 마감 + 유예 안에 합의 완료·오피셜이 오면 성사, 아니면 불발로 채점한다.
--   * 투표는 딜이 합의 완료·오피셜이 되면 닫힌다(결과가 사실상 정해졌다). 결렬·부인은 되살아날 수 있어 열어 둔다.
--   * 점수는 소수 의견 가중이다(맞히면 100 − 같은 쪽을 고른 비율%). 채점 규칙은 `scripts/lib/transfer/predictions.mjs`가 갖는다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. transfer_window — 이적 창 일정의 사본
--
-- ⚠ **단일 소스는 `scripts/lib/transfer/windows.json`**이다. DB가 이 표를 갖는 이유는 예측의 회차를 **DB가 정해야**
--   해서다 — 클라이언트가 회차를 보내면 지난 창의 표를 새로 넣거나 마감된 표를 고칠 수 있다. 사본은 파생 스크립트가
--   실행마다 JSON에서 맞춘다(`transfer_club`이 구단 프리셋의 사본인 것과 같은 운영 모델).
-- ⚠ 기간은 리그별 일정을 **합친** 값이다(개장 = 가장 먼저 여는 리그 · 마감 = 가장 늦게 닫는 리그) — 화면의
--   `transfer-window.ts`·파생의 `windowSpan`과 같은 규칙이다.
-- ⚠ 행을 지우지 않는다 — 예측이 회차로 이 키를 잡는다(FK).
-- ---------------------------------------------------------------------
create table public.transfer_window (
  key text primary key check (key ~ '^[0-9]{4}-(summer|winter)$'),
  label text not null check (char_length(label) between 1 and 20),
  opens_at  timestamptz not null,
  closes_at timestamptz not null,
  constraint transfer_window_order check (opens_at < closes_at)
);

comment on table public.transfer_window is
  '이적 창 일정의 DB 사본(리그별 일정을 합친 기간). 단일 소스는 scripts/lib/transfer/windows.json이고 유일한 writer는 '
  '파생 스크립트(service_role)다. 예측의 회차를 DB가 정하는 데 쓴다';

-- 회차 판정("아직 닫히지 않은 가장 이른 창")이 마감 시각 순으로 훑는다
create index transfer_window_closes_idx on public.transfer_window (closes_at);

alter table public.transfer_window enable row level security;

-- 감출 것이 없는 공개 일정이다
create policy "transfer_window_select_all" on public.transfer_window
  for select using (true);

revoke all on public.transfer_window from anon, authenticated;
grant select on public.transfer_window to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. transfer_deal.settled_at — 결과가 정해진 시각
--
-- 딜이 합의 완료(here_we_go)·오피셜이 된 **보도의 게시 시각**이다(파생이 보도 이력에서 계산한다 — 마지막 결렬·부인 뒤로
-- 처음 나온 합의 완료·오피셜 보도). 우리가 수집한 시각이 아니라 게시 시각이라, 파이프라인 지연(최대 1시간) 사이에 소식을
-- 보고 던진 표는 이 시각보다 늦어 채점에서 빠진다.
-- ⚠ 투표를 닫는 판정은 이 컬럼이 아니라 `stage`다(트리거) — 이 컬럼은 채점용이다.
-- ---------------------------------------------------------------------
alter table public.transfer_deal add column settled_at timestamptz;

alter table public.transfer_deal add constraint transfer_deal_settled_stage
  check (settled_at is null or stage in ('here_we_go', 'official'));

comment on column public.transfer_deal.settled_at is
  '결과가 정해진 시각 — 마지막 결렬·부인 뒤로 처음 나온 합의 완료·오피셜 보도의 게시 시각. 그 단계가 아니면 null. '
  '예측 채점이 쓴다(이 시각 이후에 던진 표는 채점하지 않는다)';

-- ---------------------------------------------------------------------
-- 3. transfer_deal_prediction — 내 예측(자기 행만)
--
-- (user_id, deal_id, round_key) 복합 PK가 "한 창에 한 딜당 한 표"를 쥔다. 다음 창에 같은 선수의 이적설이 다시 돌면
-- 새 회차의 표를 던질 수 있다.
--
-- ⚠ **회차(round_key)와 시각(voted_at)은 트리거가 정한다** — INSERT grant 밖이다. 클라이언트가 회차를 보내면 마감된
--   창에 표를 넣을 수 있고, 시각을 보내면 결과가 나오기 전에 던진 것처럼 꾸밀 수 있다.
--   `round_key`의 기본값 ''는 트리거가 덮는 자리 채움이다 — 기본값이 없으면 생성 타입이 이 컬럼을 Insert 필수로 만들어
--   클라이언트가 값을 지어 보내야 한다. ''는 창 키 형식이 아니라 트리거가 빠지면 FK가 23503으로 막는다.
-- ⚠ **거두기(DELETE)가 없다.** 바꾸기만 된다(`will_happen` UPDATE). 지울 수 있으면 틀린 표를 결과 직전에 거둬 적중률을
--   지키는 길이 열린다.
-- ⚠ 딜 FK는 **restrict**다(댓글과 같다) — 재파생이 딜을 지우면 사용자의 예측 기록이 사라진다. 파생기가 예측이 걸린 딜을
--   삭제 대상에서 뺀다(`findOrphanDeals`).
-- ---------------------------------------------------------------------
create table public.transfer_deal_prediction (
  user_id uuid not null references public.profiles (id) on delete cascade,
  deal_id bigint not null references public.transfer_deal (id) on delete restrict,
  round_key text not null default '' references public.transfer_window (key),
  -- true = 성사(이번 창 안에 오피셜) · false = 불발
  will_happen boolean not null,
  voted_at timestamptz not null default now(),
  primary key (user_id, deal_id, round_key)
);

-- 복합 PK의 선두가 user_id라 deal_id 단독 조회(딜 삭제 restrict 검사)는 인덱스를 못 탄다
create index transfer_deal_prediction_deal_round_idx on public.transfer_deal_prediction (deal_id, round_key);

comment on table public.transfer_deal_prediction is
  '딜 성사 예측(한 창에 한 딜당 한 표). SELECT·INSERT·UPDATE(will_happen) 정책이 본인 행만 열고 DELETE 경로는 없다. '
  '회차·시각은 트리거(transfer_deal_prediction_open)가 정하고, 합의 완료·오피셜 딜과 마감된 회차는 바꿀 수 없다';
comment on column public.transfer_deal_prediction.round_key is
  '회차 = 표를 던진 순간 아직 닫히지 않은 가장 이른 이적 창. 트리거가 정한다(INSERT grant 밖)';
comment on column public.transfer_deal_prediction.voted_at is
  '마지막으로 고른 시각. 트리거가 찍는다 — 채점은 이 시각이 결과(settled_at)보다 앞선 표만 센다';

-- 열기 — 회차·시각을 정하고, 결과가 나온 딜은 받지 않는다.
-- ⚠ **invoker다.** 읽는 것(딜 단계·창 일정)이 전부 공개 SELECT로 읽히는 값이다.
-- ⚠ "트리거의 첫 줄은 명의를 확인한다"(api-and-db.md)를 **두지 않는다** — 댓글 깊이 트리거와 같은 예외다. 이 트리거가
--   말하는 것(딜이 끝났는가·다음 창이 있는가)은 누구나 읽을 수 있는 값이라 오라클이 될 것이 없다.
create or replace function public.transfer_deal_prediction_open()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_stage public.transfer_stage;
  v_round text;
begin
  select stage into v_stage from public.transfer_deal where id = new.deal_id;
  -- 없는 딜은 FK가 23503으로 말한다
  if found and v_stage in ('here_we_go', 'official') then
    raise exception '결과가 나온 이적이라 더는 예측할 수 없어요.' using errcode = 'P0001';
  end if;

  select key into v_round
    from public.transfer_window
   where closes_at > now()
   order by closes_at
   limit 1;
  if v_round is null then
    raise exception '다음 이적 창 일정이 아직 없어 예측을 받을 수 없어요.' using errcode = 'P0001';
  end if;

  new.round_key := v_round;
  new.voted_at := now();
  return new;
end;
$$;

create trigger transfer_deal_prediction_open
  before insert on public.transfer_deal_prediction
  for each row execute function public.transfer_deal_prediction_open();

-- 바꾸기 — 마감된 회차·결과가 나온 딜은 바꿀 수 없고, 바꾸면 시각을 다시 찍는다.
-- ⚠ invoker다(위와 같은 이유). RLS의 using이 필터로 먼저 걸러 이 트리거는 자기 행만 본다.
-- ⚠ 같은 값으로의 UPDATE는 시각을 건드리지 않는다 — 다시 누른 것으로 "결과 뒤에 던진 표"가 되면 안 된다.
create or replace function public.transfer_deal_prediction_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_stage public.transfer_stage;
  v_closes timestamptz;
begin
  if new.will_happen is not distinct from old.will_happen then
    return new;
  end if;

  select closes_at into v_closes from public.transfer_window where key = old.round_key;
  if v_closes is null or v_closes <= now() then
    raise exception '이 이적 창의 예측은 마감됐어요.' using errcode = 'P0001';
  end if;

  select stage into v_stage from public.transfer_deal where id = old.deal_id;
  if v_stage in ('here_we_go', 'official') then
    raise exception '결과가 나온 이적이라 더는 예측을 바꿀 수 없어요.' using errcode = 'P0001';
  end if;

  new.voted_at := now();
  return new;
end;
$$;

create trigger transfer_deal_prediction_change
  before update on public.transfer_deal_prediction
  for each row execute function public.transfer_deal_prediction_change();

alter table public.transfer_deal_prediction enable row level security;

-- 표는 본인만 본다 — 남의 표는 집계(tally)로만 드러난다
create policy "transfer_deal_prediction_select_own" on public.transfer_deal_prediction
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "transfer_deal_prediction_insert_own" on public.transfer_deal_prediction
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- with check까지 두어 소유권 이전을 막는다(user_id는 grant 밖이라 이중 방어다)
create policy "transfer_deal_prediction_update_own" on public.transfer_deal_prediction
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ⚠ DELETE 정책을 두지 않는다 = 거두기가 없다(위 표 주석).

revoke all on public.transfer_deal_prediction from anon, authenticated;

-- ⚠ **anon에도 SELECT를 준다** — `transfer_deal_watch`와 같은 형태다. 행을 막는 것은 정책(`to authenticated`)이고
--   grant는 통로다. 딜 상세의 서버 조회가 세션 유무와 무관하게 같은 조회를 보내고, anon은 빈 배열을 받는다.
grant select (user_id, deal_id, round_key, will_happen, voted_at) on public.transfer_deal_prediction to anon, authenticated;
-- 회차·시각은 트리거가 정한다 — grant에서 빼 위조를 막는다
grant insert (user_id, deal_id, will_happen) on public.transfer_deal_prediction to authenticated;
-- 고르기만 바꾼다 — 키 컬럼을 열면 표를 다른 딜·다른 창으로 옮길 수 있다
grant update (will_happen) on public.transfer_deal_prediction to authenticated;

revoke execute on function public.transfer_deal_prediction_open()   from public, anon, authenticated;
revoke execute on function public.transfer_deal_prediction_change() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. transfer_deal_prediction_tally — 딜·회차별 집계
--
-- 표는 본인만 보므로 "팬 N%가 성사 예상"은 이 표로만 그린다. 채점의 소수 의견 가중도 이 숫자를 쓴다.
-- ⚠ **definer 트리거가 단독으로 관리한다**(댓글 표 합계와 같다). 사용자는 이 표에 쓸 수 없고, 탈퇴 cascade로 표가
--   사라질 때도 트리거가 돌아 숫자가 맞는다.
-- ⚠ security definer가 필수다 — 이 표에 쓰기 grant가 없어 호출자 권한으로는 집계를 바꿀 수 없다.
-- ---------------------------------------------------------------------
create table public.transfer_deal_prediction_tally (
  deal_id bigint not null references public.transfer_deal (id) on delete cascade,
  round_key text not null references public.transfer_window (key),
  yes_count integer not null default 0 check (yes_count >= 0),
  no_count  integer not null default 0 check (no_count  >= 0),
  primary key (deal_id, round_key)
);

comment on table public.transfer_deal_prediction_tally is
  '딜·회차별 예측 집계(성사·불발 표 수). transfer_deal_prediction의 트리거(sync_transfer_deal_prediction_tally)만 '
  '갱신한다. 읽기 공개';

create or replace function public.sync_transfer_deal_prediction_tally()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update public.transfer_deal_prediction_tally
       set yes_count = yes_count - old.will_happen::int,
           no_count  = no_count  - (not old.will_happen)::int
     where deal_id = old.deal_id and round_key = old.round_key;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    insert into public.transfer_deal_prediction_tally as t (deal_id, round_key, yes_count, no_count)
    values (new.deal_id, new.round_key, new.will_happen::int, (not new.will_happen)::int)
    on conflict (deal_id, round_key) do update
      set yes_count = t.yes_count + excluded.yes_count,
          no_count  = t.no_count  + excluded.no_count;
  end if;

  return null; -- after 트리거라 반환값을 쓰지 않는다
end;
$$;

create trigger transfer_deal_prediction_tally_sync
  after insert or update or delete on public.transfer_deal_prediction
  for each row execute function public.sync_transfer_deal_prediction_tally();

alter table public.transfer_deal_prediction_tally enable row level security;

create policy "transfer_deal_prediction_tally_select_all" on public.transfer_deal_prediction_tally
  for select using (true);

revoke all on public.transfer_deal_prediction_tally from anon, authenticated;
grant select on public.transfer_deal_prediction_tally to anon, authenticated;

revoke execute on function public.sync_transfer_deal_prediction_tally() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. transfer_prediction_score — 사람별 점수·순위(예측 랭킹)
--
-- 파생 스크립트가 매시 모든 예측을 채점해 쓴다(채점 규칙은 `scripts/lib/transfer/predictions.mjs`). 채점된 표가 한 건
-- 이상인 사람만 행이 있다. 공개 랭킹 화면이 읽으므로 읽기는 공개다.
-- ⚠ **쓰기 정책도 grant도 없다**(운영 데이터) — 점수를 사용자가 고칠 길이 구조적으로 없다.
-- ---------------------------------------------------------------------
create table public.transfer_prediction_score (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  points integer not null check (points >= 0),
  -- 맞힌 표 / 채점된 표(성사·불발이 정해진 회차의 표 — 결과 뒤에 던진 표는 빠진다)
  hits   integer not null check (hits >= 0),
  scored integer not null check (scored >= 1),
  -- 점수 순위(같은 점수는 같은 순위 — 1, 2, 2, 4)
  rank   integer not null check (rank >= 1),
  updated_at timestamptz not null default now(),
  constraint transfer_prediction_score_hits check (hits <= scored)
);

-- 랭킹 화면이 순위순으로 읽는다
create index transfer_prediction_score_rank_idx on public.transfer_prediction_score (rank, user_id);

comment on table public.transfer_prediction_score is
  '예측 랭킹 — 사람별 점수·적중·순위. 유일한 writer는 파생 스크립트(service_role, 매시 채점)이고 쓰기 정책도 grant도 없다. '
  '채점된 표가 한 건 이상인 사람만 행이 있다. 읽기 공개';
comment on column public.transfer_prediction_score.points is
  '맞힌 표마다 (100 − 같은 쪽을 고른 비율%)점(최소 1점)의 합 — 소수 의견을 맞힐수록 크다';

alter table public.transfer_prediction_score enable row level security;

create policy "transfer_prediction_score_select_all" on public.transfer_prediction_score
  for select using (true);

revoke all on public.transfer_prediction_score from anon, authenticated;
grant select on public.transfer_prediction_score to anon, authenticated;
