-- =====================================================================
-- 이적 소식 — 기자·매체의 공개 채널에서 수집한 이적 보도
--
-- 원래 별도 프로젝트(transfer-market-crawler)가 SQLite에 쌓던 것을 옮긴다.
-- 수집·추출·귀속 판정은 `scripts/sync-transfer-news.mjs`가 하고, 이 테이블은
-- 그 결과를 담는다.
--
-- ⚠ **쓰기 정책도 grant도 두지 않는다.** team·match와 같은 운영 데이터라
--   유일한 writer가 service_role 동기화 스크립트다 → 이 기능이 늘리는 사용자
--   쓰기 표면은 **0**이다.
--
-- ⚠ **저자를 확증하지 못한 항목은 저장하지 않는다.** 크롤러는 그런 항목을
--   `unattributed`로 저장하고 조회 기본값(`attributed=1`)으로 걸렀는데, 그
--   필터를 빠뜨리는 순간 미러 채널의 무기명 글이 "오른스테인이 말했다"로
--   나간다. 행이 없으면 그 사고가 성립하지 않는다. 대가로 귀속 규칙을 넓혀도
--   이미 버린 항목은 되살릴 수 없다 — 그 미러의 무기명 콘텐츠는 유료 기사를
--   옮겨 실은 것으로 보여 애초에 우리 DB에 둘 것이 아니다.
--
-- ⚠ **수집 커서 테이블을 두지 않는다.** 크롤러의 커서는 "그 소스에서 본 가장
--   최신 게시 시각"이었는데, 그건 이 테이블의 `max(published_at)`과 같은 사실이다
--   — 행이 아는 것을 테이블이 또 알게 하지 않는다.
--
-- ⚠ **어댑터의 원본 페이로드(JSON)를 보관하지 않는다.** 보존할 가치가 있는 것은
--   "기자가 무슨 말을 했는가"이고 그건 `body`다(아래 트리거가 고정한다).
--   페이로드는 행당 약 4.5KB라(크롤러 실측: 2,056건 9MB) 본문보다 몇 배 무겁다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 타입
--
-- ⚠ **enum 값은 지울 수 없다**(add value·rename value만 있다). 그래서 지금
--   저장하는 값만 넣는다 — `unattributed`가 없는 이유가 위 머리말이다.
--   다시 저장해야 할 날이 오면 그때 add value 하면 된다(더하기는 싸다).
-- ---------------------------------------------------------------------

-- 이적의 진행 단계. `unknown`은 이적과 무관한 게시물(경기 소감·부상 소식)이고,
-- 추출 규칙이 좋아지면 재처리로 다른 단계가 될 수 있어 함께 저장한다.
create type public.transfer_stage as enum (
  'rumour',          -- 관심·연결설
  'talks',           -- 협상 중
  'offer',           -- 오퍼 제출
  'agreement',       -- 구단 간 합의
  'personal_terms',  -- 개인 조건 합의
  'medical',         -- 메디컬
  'here_we_go',      -- 로마노의 확정 시그널
  'official',        -- 공식 발표
  'collapsed',       -- 무산
  'unknown'
);

-- 이 항목의 저자를 어디까지 믿을 수 있는가 — **항목 단위로** 판정한다.
create type public.transfer_attribution as enum (
  'verified_author', -- 플랫폼·소속사가 인증한 본인 계정의 직접 게시
  'linked_mirror',   -- 미러가 전달했지만 원본 퍼머링크·서명 패턴으로 저자가 확증됨
  'outlet'           -- 매체 공식 피드(개인이 아니라 기관)
);

create table public.transfer_news (
  id bigint generated always as identity primary key,

  -- ── 수집한 것(아래 트리거가 고정한다) ──────────────────────────────

  -- 레지스트리의 소스 id(`bsky:ornstein`·`tg:romano`·`rss:bbc-football`).
  -- ⚠ 소스 테이블을 두지 않는다 — 레지스트리는 폴링 대상과 실측 근거를 함께 담는
  --   **writer의 설정**이라 `scripts/team-names-ko.json`처럼 writer 곁에 있다.
  source_id text not null
    check (source_id ~ '^(bsky|tg|rss|gnews):[a-z0-9-]+$'),

  -- 소스 안에서 고유한 id. 텔레그램은 원본 트윗 퍼머링크가 있으면 `tweet:<id>`다
  -- (채널이 지웠다 다시 올려도 같은 뉴스가 같은 키를 갖는다).
  external_id text not null check (char_length(external_id) between 1 and 300),

  url text check (url is null or (url ~ '^https?://' and char_length(url) <= 2048)),

  -- 미러가 붙여 준 원 게시물 링크 — 이 값이 귀속의 증거다.
  provenance_url text
    check (provenance_url is null or (provenance_url ~ '^https?://' and char_length(provenance_url) <= 2048)),

  -- 소스가 알려 준 작성자(Bluesky 핸들·트윗 계정·Google News의 원 매체명).
  author_handle text check (author_handle is null or char_length(author_handle) between 1 and 200),

  -- 게시물 원문. 20,000은 abuse bound다(post.content와 같은 값).
  body text not null
    check (char_length(body) between 1 and 20000)
    check (public.has_visible_char(body)),

  -- 공개해도 되는 길이의 앞부분 — 화면·REST가 원문 대신 읽는 컬럼이다(아래 권한 절).
  -- ⚠ 생성 컬럼이라 writer가 따로 채우지 않는다 — 원문과 어긋날 수 없다.
  body_excerpt text generated always as (left(body, 280)) stored,

  published_at timestamptz not null,
  fetched_at timestamptz not null default now(),
  -- ⚠ **미래 시각은 커서를 잠근다.** 커서가 소스별 max(published_at)이라 2027년 날짜 한 건이
  --   들어오면 그때까지 그 소스의 새 글이 전부 "이미 본 것"으로 버려진다. writer가 10분 여유로
  --   먼저 거르고, 이 CHECK는 그 방어가 빠졌을 때의 상한이다(원문이 고정돼 있어 들어온 뒤에는
  --   행을 지우는 것 말고 풀 길이 없다).
  check (published_at <= fetched_at + interval '1 day'),

  -- ── 추출한 것(재처리가 다시 쓴다) ─────────────────────────────────

  attribution public.transfer_attribution not null,

  -- 화면에 적을 저자. ⚠ **인증 계정·확증된 미러는 반드시 채워져 있다** —
  --   "누구의 말인지"가 그 두 등급의 정의이기 때문이다. 매체는 비어도 된다
  --   (BBC RSS는 기자명을 주지 않는다 — 그때는 소스 라벨이 곧 저자다).
  attributed_to text check (attributed_to is null or char_length(attributed_to) between 1 and 200),
  check (attribution = 'outlet' or attributed_to is not null),

  -- 1 = 1급 기자·공식, 2 = 그 외
  tier smallint not null check (tier in (1, 2)),

  stage public.transfer_stage not null,

  -- 추출기가 잡은 선수·구단(구단은 정규 영문명). 틀린 이름보다 빈 배열이 낫다는
  -- 것이 추출기의 방침이라 비어 있는 것이 정상이다.
  players text[] not null default '{}' check (cardinality(players) <= 20),
  clubs   text[] not null default '{}' check (cardinality(clubs) <= 20),

  -- 이적료. 백만 단위로 정규화한 값이다(55 = 55m).
  -- ⚠ 350 상한은 추출기의 판단(역대 최고 €222m)을 그대로 옮긴 것이다 — 그 위는
  --   구단 가치·총지출일 확률이 압도적이라 추출기가 이미 버린다.
  fee_text text check (fee_text is null or char_length(fee_text) between 1 and 40),
  fee_amount numeric(6, 2) check (fee_amount is null or (fee_amount > 0 and fee_amount <= 350)),
  fee_currency text check (fee_currency is null or fee_currency in ('EUR', 'GBP', 'USD')),
  -- 셋은 한 덩어리다 — 금액 없이 통화만 있는 이적료는 그릴 수 없다
  check ((fee_text is null) = (fee_amount is null) and (fee_amount is null) = (fee_currency is null)),

  -- 여러 소스에 걸친 같은 뉴스의 묶음 키(선수 + 구단 해시). 못 묶으면 null.
  cluster_key text check (cluster_key is null or cluster_key ~ '^[0-9a-f]{16}$'),

  -- 이적 관련성 0~1. 화면이 필터로 쓴다.
  relevance numeric(3, 2) not null check (relevance between 0 and 1),

  unique (source_id, external_id)
);

comment on table public.transfer_news is
  '기자·매체 공개 채널에서 수집한 이적 보도. 유일한 writer는 scripts/sync-transfer-news.mjs(service_role)이고 '
  '정책도 grant도 없다. 저자를 확증하지 못한 항목은 저장하지 않는다. 수집 컬럼은 트리거가 고정한다';
comment on column public.transfer_news.body is
  '수집 당시의 원문. 기자가 원글을 지우거나 고쳐도 이 값은 바뀌지 않는다(transfer_news_freeze_collected). '
  'anon·authenticated에 SELECT를 주지 않는다 — 공개 범위는 body_excerpt(앞 280자)다';

-- 목록은 최신순으로 훑는다
create index transfer_news_published_idx on public.transfer_news (published_at desc);
-- 동기화가 소스별 커서(max(published_at))를 이걸로 읽는다
create index transfer_news_source_published_idx on public.transfer_news (source_id, published_at desc);
create index transfer_news_cluster_idx on public.transfer_news (cluster_key) where cluster_key is not null;

-- ---------------------------------------------------------------------
-- 수집한 원문은 바꿀 수 없다
--
-- ⚠ 크롤러가 원본을 append-only로 둔 이유가 이 테이블로 그대로 온다 — 기자들은
--   글을 자주 지우고 고치므로 스냅샷이 없으면 "어제 무슨 말을 했는가"를 잃는다.
--   재처리(추출 규칙 변경)는 **추출 컬럼만** 다시 쓴다.
-- ⚠ **service_role에도 걸려야 해서 트리거다.** writer가 service_role이라 grant·정책은
--   아무것도 막지 못한다. 재처리가 upsert를 쓰는데, 그 upsert가 실수로 수집 컬럼을
--   다른 값으로 실으면 여기서 멈춘다.
-- ⚠ **삭제는 막지 않는다.** 동기화는 행을 지우지 않는다 — 삭제는 사람이 잘못 들어온 행
--   (재처리에서 귀속을 잃은 행 등)을 걷어내는 유일한 길이라 열어 둔다.
-- ---------------------------------------------------------------------
create or replace function public.transfer_news_freeze_collected()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (old.source_id, old.external_id, old.url, old.provenance_url, old.author_handle,
      old.body, old.published_at, old.fetched_at)
     is distinct from
     (new.source_id, new.external_id, new.url, new.provenance_url, new.author_handle,
      new.body, new.published_at, new.fetched_at) then
    raise exception '수집한 원문은 바꿀 수 없어요' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger transfer_news_freeze_collected
  before update on public.transfer_news
  for each row execute function public.transfer_news_freeze_collected();

-- 트리거 발화는 EXECUTE 권한을 검사하지 않는다 — PUBLIC 기본 EXECUTE를 걷어
-- rls.sql 섹션 17d의 전수 검사에 걸리지 않게 한다(check_comment_depth와 같은 처리).
revoke execute on function public.transfer_news_freeze_collected() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 권한
--
-- 읽기는 비로그인에게도 열린다 — 개인화가 한 조각도 없는 공개 보도라 크롤러가
-- 색인할 화면의 재료가 된다(공지와 같은 성질).
-- ⚠ **단 `body`(원문 전문)는 열지 않는다.** 공개 anon 키만 있으면 화면과 무관하게 PostgREST로
--   전문을 읽을 수 있어, "링크 + 짧은 인용 + 추출된 사실"이라는 재배포 원칙을 화면이 아니라
--   **컬럼 권한이 지켜야** 한다. 앞부분은 `body_excerpt`로 연다.
--   대가로 anon·authenticated는 `select=*`를 쓸 수 없다(권한 없는 컬럼이 섞여 42501) — 컬럼을 나열한다.
-- ⚠ 정책이 `using (true)`인 이유: 감출 행이 없다. 저자 미상 항목은 애초에 저장하지
--   않으므로(머리말) 크롤러가 조회 기본값으로 하던 일을 행의 부재가 대신한다.
-- ---------------------------------------------------------------------
alter table public.transfer_news enable row level security;

create policy "transfer_news_select_all" on public.transfer_news for select using (true);

-- public 스키마 기본 권한이 anon/authenticated에 ALL이라, revoke를 한 번만 잊어도
-- 곧바로 앱에서 쓸 수 있는 테이블이 된다(rls.sql 섹션 17이 전수로 본다).
revoke all on public.transfer_news from anon, authenticated;
grant select (
  id, source_id, external_id, url, provenance_url, author_handle, body_excerpt,
  published_at, fetched_at, attribution, attributed_to, tier, stage, players, clubs,
  fee_text, fee_amount, fee_currency, cluster_key, relevance
) on public.transfer_news to anon, authenticated;

-- identity 시퀀스는 테이블 revoke에 딸려오지 않는다
revoke all on all sequences in schema public from anon, authenticated;
