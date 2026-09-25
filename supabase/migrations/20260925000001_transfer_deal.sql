-- =====================================================================
-- 이적시장 보드 — 수집한 보도(`transfer_news`)에서 파생한 딜과 그 딜에 대한 관심
--
-- 보도는 "누가 무슨 말을 했는가"의 행이고, 딜은 그 행들을 **선수 하나로 묶은 파생 결과**다
-- (`scripts/sync-transfer-news.mjs`의 마지막 단계가 만든다). 어드민 큐레이션은 없다 —
-- 보드의 원천은 크롤러뿐이다.
--
-- ⚠ **`transfer_club`·`transfer_deal`에는 쓰기 정책도 grant도 두지 않는다.** team·match·
--   transfer_news와 같은 운영 데이터라 유일한 writer가 service_role 파생 스크립트다 →
--   이 배치가 늘리는 사용자 쓰기 표면은 **`transfer_deal_watch`의 자기 행뿐**이다.
--
-- ⚠ **딜은 지우지 않고 다시 파생한다.** `deal_key`(정규화한 선수명의 sha1 앞 16자리)로
--   upsert하므로 `id`가 보존되고, 그래서 관심(`transfer_deal_watch`)이 `id`를 FK로 잡아도
--   재파생에 끊기지 않는다. 범위 밖으로 나간 딜은 화면의 범위 필터가 가린다.
--
-- ⚠ **구단 표시 프리셋의 DB 사본(`transfer_club`)은 writer가 채운다.** 매핑
--   (`scripts/lib/transfer/club-presets.json` + `scripts/team-names-ko.json`)이 마이그레이션이나
--   클라이언트에 있으면 다음 파생이 통째로 덮어쓴다 — `team.name`의 한국어 표기와 같은 규칙이다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. transfer_club — 구단 표시 프리셋의 사본
-- ---------------------------------------------------------------------
create table public.transfer_club (
  -- 엠블럼 파일명(`/crests/{code}.png`)이자 PK. 프리셋 밖 구단은 정규 영문명의 slugify라
  -- 파일이 없을 수 있고, 그때 화면은 약칭 모노그램으로 떨어진다(TeamCrest와 같은 폴백).
  code text primary key check (code ~ '^[a-z0-9-]{1,60}$'),

  -- 추출기(`scripts/lib/transfer/clubs.mjs`)의 정규 영문명 — 보도의 `clubs[]`와 이 값으로 잇는다.
  canonical text not null unique check (char_length(canonical) between 1 and 120),

  -- 정식명(한국어 표기가 있으면 한국어, 없으면 영문). 화면에 그대로 나가는 값이라 저장값이 곧 라벨이다.
  name text not null check (char_length(name) between 1 and 120),

  -- 약칭 — 좁은 폭(목록 행·경로 표시)에서 쓴다. 정식명과 쓰임이 다른 것은 team.short_name과 같다.
  short_name text not null check (char_length(short_name) between 1 and 40),

  -- 리그 필터의 축. 5대 리그 밖(구단 사전에 있어도 하부 리그·타 대륙)은 null이다.
  league text check (league is null or league in ('프리미어리그', '분데스리가', '라리가', '세리에 A', '리그 1')),

  updated_at timestamptz not null default now()
);

comment on table public.transfer_club is
  '이적시장 보드가 그리는 구단 표시 프리셋의 DB 사본. 유일한 writer는 scripts/sync-transfer-news.mjs의 '
  '딜 파생 단계(service_role)이고 정책도 grant도 없다. 엠블럼은 code에서 유도한다(/crests/{code}.png)';
comment on column public.transfer_club.code is
  '엠블럼 파일명이자 PK. 프리셋 밖 구단은 정규 영문명의 slugify — 파일이 없으면 화면이 약칭 모노그램으로 떨어진다';
comment on column public.transfer_club.canonical is
  '추출기의 정규 영문명. transfer_news.clubs[]의 값과 이것으로 잇는다';
comment on column public.transfer_club.league is
  '리그 필터 축. 5대 리그(프리미어리그·분데스리가·라리가·세리에 A·리그 1) 밖이면 null';

-- ---------------------------------------------------------------------
-- 2. transfer_deal — 파생 딜
-- ---------------------------------------------------------------------
create table public.transfer_deal (
  id bigint generated always as identity primary key,

  -- 재파생의 멱등 키(sha1(정규화한 선수명)의 앞 16자리). ⚠ **영구 계약** — 관심 테이블이
  -- id를 FK로 잡으므로 이 키로 upsert해야 id가 보존된다. 형식은 transfer_news.cluster_key와 같다.
  deal_key text not null unique check (deal_key ~ '^[0-9a-f]{16}$'),

  -- 추출된 영문 선수명. 보이지 않는 이름은 딜이 될 수 없다(has_visible_char — post.title과 같은 방어).
  player text not null
    check (char_length(player) between 1 and 120)
    check (public.has_visible_char(player)),

  -- 아래 넷은 운영 사전(`scripts/lib/transfer/players-ko.json`)에서 온다. 없으면 null이고
  -- 화면은 그 줄을 생략한다 — 틀린 칸보다 빈 칸이다.
  player_ko text check (player_ko is null or char_length(player_ko) between 1 and 120),
  position text check (position is null or char_length(position) between 1 and 20),
  birth_year smallint check (birth_year is null or birth_year between 1950 and 2015),
  nationality text check (nationality is null or nationality ~ '^[A-Z]{3}$'),

  -- 방향 투표(`voteDirection`)의 결과. 못 읽으면 null — 한쪽만 읽힌 딜도 정상이다.
  from_club_code text references public.transfer_club (code),
  to_club_code   text references public.transfer_club (code),
  -- 출발과 행선지가 같은 딜은 성립하지 않는다. ⚠ `is distinct from`으로 쓰면 둘 다 null인
  --   행(구단을 하나도 못 읽은 루머)까지 거부하므로 null을 먼저 통과시킨다.
  constraint transfer_deal_clubs_differ
    check (from_club_code is null or to_club_code is null or from_club_code <> to_club_code),

  -- 딜의 단계 = 속한 보도 중 가장 진행된 단계(단 collapsed가 더 나중이면 collapsed).
  -- `unknown`은 "이적과 무관한 게시물"이라 딜이 될 수 없다.
  stage public.transfer_stage not null check (stage <> 'unknown'),

  -- 최신 보도의 이적료. 규칙은 transfer_news와 같다(백만 단위 · 350 상한 · 셋은 한 덩어리).
  fee_text text check (fee_text is null or char_length(fee_text) between 1 and 40),
  fee_amount numeric(6, 2) check (fee_amount is null or (fee_amount > 0 and fee_amount <= 350)),
  fee_currency text check (fee_currency is null or fee_currency in ('EUR', 'GBP', 'USD')),
  constraint transfer_deal_fee_bundle
    check ((fee_text is null) = (fee_amount is null) and (fee_amount is null) = (fee_currency is null)),

  -- 같은 통화의 **직전 다른** 보도 이적료 — 화면의 "직전 보도 대비 ↑↓"가 이 값과의 차이다.
  prev_fee_amount numeric(6, 2) check (prev_fee_amount is null or (prev_fee_amount > 0 and prev_fee_amount <= 350)),
  -- 같은 통화 보도의 최소·최대 — 화면의 "보도 범위 €58–95M". 둘은 한 쌍이다.
  fee_low_amount  numeric(6, 2) check (fee_low_amount  is null or (fee_low_amount  > 0 and fee_low_amount  <= 350)),
  fee_high_amount numeric(6, 2) check (fee_high_amount is null or (fee_high_amount > 0 and fee_high_amount <= 350)),
  constraint transfer_deal_fee_range_pair  check ((fee_low_amount is null) = (fee_high_amount is null)),
  constraint transfer_deal_fee_range_order check (fee_low_amount is null or fee_low_amount <= fee_high_amount),
  -- 옵션(add-ons). 있을 때만.
  add_on_amount numeric(6, 2) check (add_on_amount is null or (add_on_amount > 0 and add_on_amount <= 350)),
  -- 이적료가 없는 딜에는 직전·범위·옵션도 있을 수 없다 — 기준값 없는 차이는 그릴 수 없다.
  constraint transfer_deal_fee_derivatives_need_fee
    check (fee_amount is not null
           or (prev_fee_amount is null and fee_low_amount is null
               and fee_high_amount is null and add_on_amount is null)),

  -- 계약 만료('2030.06') 또는 기간('5년'), 주급('£250k') — 원문 표기 그대로다(환산하지 않는다).
  contract_text text check (contract_text is null or char_length(contract_text) between 1 and 20),
  wage_text     text check (wage_text     is null or char_length(wage_text)     between 1 and 20),

  -- 속한 보도의 처음·마지막 게시 시각. latest가 정렬·보드 범위의 기준이다.
  first_reported_at  timestamptz not null,
  latest_reported_at timestamptz not null,
  constraint transfer_deal_reported_order check (first_reported_at <= latest_reported_at),

  -- 속한 보도 수. 0이 되는 딜은 파생기가 지운다(관심은 cascade).
  report_count integer not null check (report_count >= 1),

  -- 파생 시각(아래 트리거가 찍는다)
  updated_at timestamptz not null default now()
);

comment on table public.transfer_deal is
  'transfer_news를 선수 하나로 묶은 파생 딜. 유일한 writer는 scripts/sync-transfer-news.mjs의 파생 단계'
  '(service_role)이고 정책도 grant도 없다. deal_key로 upsert해 id를 보존한다(관심이 id를 참조한다)';
comment on column public.transfer_deal.deal_key is
  'sha1(정규화한 선수명)의 앞 16자리. 재파생의 멱등 키이자 영구 계약 — 바꾸면 id가 바뀌어 관심이 끊긴다';
comment on column public.transfer_deal.stage is
  '속한 보도 중 가장 진행된 단계. collapsed가 그보다 나중이면 collapsed, official은 뒤집히지 않는다. unknown은 불가';
comment on column public.transfer_deal.prev_fee_amount is
  '같은 통화의 직전 다른 보도 이적료. fee_amount가 없으면 null이어야 한다';
comment on column public.transfer_deal.fee_low_amount is
  '같은 통화 보도 이적료의 최소. fee_high_amount와 한 쌍이고 fee_amount가 없으면 null';
comment on column public.transfer_deal.latest_reported_at is
  '속한 보도의 마지막 게시 시각 — 정렬과 보드 범위(이적 창 개장 이후)의 기준';
comment on column public.transfer_deal.report_count is
  '속한 보도 수(≥1). 재파생으로 0이 되는 딜만 파생기가 지운다';

-- 보드는 최신 보도순으로 훑고, 리그 필터는 출발·행선지 구단으로 가른다
create index transfer_deal_latest_idx    on public.transfer_deal (latest_reported_at desc);
create index transfer_deal_to_club_idx   on public.transfer_deal (to_club_code);
create index transfer_deal_from_club_idx on public.transfer_deal (from_club_code);

-- ⚠ WHEN 절 없이 건다. post·match·survey·notice의 트리거를 WHEN으로 좁힌 것은 "수정됨" 표시가
--   그 컬럼에 걸려 있어서인데, 이 두 테이블은 쓰기가 파생 스크립트뿐이라 그 계약이 없다 —
--   `updated_at`은 "마지막으로 파생된 시각"이면 충분하다.
create trigger transfer_club_touch_updated_at
  before update on public.transfer_club
  for each row execute function public.touch_updated_at();
create trigger transfer_deal_touch_updated_at
  before update on public.transfer_deal
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 3. transfer_news.deal_id — 보도가 속한 딜
--
-- 추출 컬럼이다(재파생이 다시 쓴다). `transfer_news_freeze_collected`의 수집 컬럼 목록에
-- 없으므로 트리거에 걸리지 않는다. 딜이 지워지면 null로 돌아간다 — 보도는 딜보다 오래 산다.
-- ---------------------------------------------------------------------
alter table public.transfer_news
  add column deal_id bigint references public.transfer_deal (id) on delete set null;

comment on column public.transfer_news.deal_id is
  '이 보도가 속한 파생 딜. 추출 컬럼이라 재파생이 다시 쓴다(수집 컬럼 고정 트리거에 걸리지 않는다). '
  '딜이 지워지면 null';

-- 상세의 보도 타임라인이 딜 하나의 보도를 최신순으로 읽는다
create index transfer_news_deal_published_idx
  on public.transfer_news (deal_id, published_at desc) where deal_id is not null;

-- ---------------------------------------------------------------------
-- 4. transfer_deal_watch — 관심 (자기 행만)
--
-- post_like·user_block과 같은 형태다 — 복합 PK가 "한 딜을 두 번 담을 수 없다"를 겸하고,
-- 카운터가 없어 RPC가 필요 없다(훅이 insert/delete를 직접 보내고 23505는 멱등으로 흡수한다).
-- ---------------------------------------------------------------------
create table public.transfer_deal_watch (
  user_id uuid   not null references public.profiles      (id) on delete cascade,
  deal_id bigint not null references public.transfer_deal (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, deal_id)
);

-- 복합 PK의 선두가 user_id라 deal_id 단독 조회(딜 삭제 cascade · 목록 임베딩)는 인덱스를 못 탄다
-- (user_block_blocked_id_idx와 같은 사유)
create index transfer_deal_watch_deal_id_idx on public.transfer_deal_watch (deal_id);

comment on table public.transfer_deal_watch is
  '딜에 대한 관심. SELECT·INSERT·DELETE 정책이 전부 본인 행만 열고 UPDATE 경로는 없다. '
  '목록 select의 transfer_deal_watch(user_id) 임베딩 길이가 곧 isWatched다(post_like와 같은 트릭)';
comment on column public.transfer_deal_watch.created_at is
  '담은 시각. INSERT grant 목록 밖이라 클라이언트가 실을 수 없다(시각 위조 차단)';

-- ---------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------
alter table public.transfer_club       enable row level security;
alter table public.transfer_deal       enable row level security;
alter table public.transfer_deal_watch enable row level security;

-- 감출 행이 없다 — 공개 보도의 파생이라 비로그인·크롤러에게 그대로 열린다(transfer_news와 같은 성질)
create policy "transfer_club_select_all" on public.transfer_club for select using (true);
create policy "transfer_deal_select_all" on public.transfer_deal for select using (true);

-- 관심은 본인만 본다. ⚠ 남의 관심을 여는 SELECT 정책을 두지 않는다 — 카운터도 없으니 열 이유가 없다.
create policy "transfer_deal_watch_select_own" on public.transfer_deal_watch
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "transfer_deal_watch_insert_own" on public.transfer_deal_watch
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "transfer_deal_watch_delete_own" on public.transfer_deal_watch
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ⚠ UPDATE 정책을 두지 않는다 = 관심 행은 불변이다(빼기는 delete). 표를 다른 딜로 옮기는
--   경로와 created_at 위조 경로가 함께 닫힌다.

-- ---------------------------------------------------------------------
-- 6. 권한 위생
--
-- public 스키마 기본 권한이 anon/authenticated에 ALL이라, revoke를 한 번만 잊어도
-- 즉시 구멍이 된다(rls.sql 섹션 17이 전수로 잡는다).
-- ---------------------------------------------------------------------
revoke all on public.transfer_club       from anon, authenticated;
revoke all on public.transfer_deal       from anon, authenticated;
revoke all on public.transfer_deal_watch from anon, authenticated;

grant select on public.transfer_club to anon, authenticated;
grant select on public.transfer_deal to anon, authenticated;

-- ⚠ **anon에도 SELECT를 준다** — match_prediction·post_like와 같은 형태다. 행을 막는 것은
--   정책(`to authenticated`)이고 grant는 임베딩의 통로다. grant를 빼면 목록 select의
--   `transfer_deal_watch(user_id)` 임베딩이 42501로 죽어 비로그인에게 보드가 통째로 안 보인다.
--   anon은 정책에서 걸려 항상 빈 배열(= isWatched false)을 받는다.
grant select (user_id, deal_id) on public.transfer_deal_watch to anon, authenticated;
-- created_at은 default가 채운다 — grant에서 빼 시각 위조를 막는다(rls.sql 섹션 18의 규약)
grant insert (user_id, deal_id) on public.transfer_deal_watch to authenticated;
grant delete on public.transfer_deal_watch to authenticated;

-- transfer_news의 공개 컬럼에 deal_id를 더한다. ⚠ **body는 여전히 없다** — 원문 전문의 재배포
--   범위는 컬럼 권한이 지킨다(20260924000001의 권한 절). 목록은 그 마이그레이션의 grant에
--   deal_id 하나를 더한 것이다(컬럼 grant는 누적이라 재실행이 안전하다).
grant select (
  id, source_id, external_id, url, provenance_url, author_handle, body_excerpt,
  published_at, fetched_at, attribution, attributed_to, tier, stage, players, clubs,
  fee_text, fee_amount, fee_currency, cluster_key, relevance, deal_id
) on public.transfer_news to anon, authenticated;

-- identity 시퀀스는 테이블 revoke에 딸려오지 않는다
revoke all on all sequences in schema public from anon, authenticated;
