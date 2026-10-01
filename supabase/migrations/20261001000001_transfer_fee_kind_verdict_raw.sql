-- 이적료의 성격과 판정 원출력 — 판정자(LLM)가 보도 한 건에서 그 선수의 금액과 그 성격을 함께 읽는다
-- (`scripts/lib/transfer/judge.mjs`, service_role). 호출 수는 그대로다(같은 호출의 출력에 필드가 늘 뿐이다).
--
-- 왜: 보도가 말하는 금액의 대부분은 실제 이적료가 아니라 제안액·요구액·평가액인데 화면이 전부 "이적료"로 그렸다
-- (로마가 올리려는 요구액 £86m, 거절된 제안 £60m). 규칙은 금액만 읽고 성격을 가르지 못한다.

-- 값이 곧 화면 라벨의 키다(영문 키 + 라벨맵 — `api-and-db.md` "열거값은 enum으로 둔다")
create type public.transfer_fee_kind as enum ('fee', 'bid', 'asking_price', 'release_clause', 'valuation');

comment on type public.transfer_fee_kind is
  '보도가 말하는 금액의 성격 — fee(합의·보도된 이적료) · bid(제안액) · asking_price(요구액) · release_clause(바이아웃) · valuation(평가액)';

alter table public.transfer_news
  -- 모델이 낸 JSON 그대로 — 후처리(`parseJudgement`)를 고쳤을 때 다시 묻지 않고 재생하기 위해 남긴다
  add column verdict_raw text,
  -- 판정자가 원문에서 읽은 **그 선수의** 금액(백만 단위)·통화·성격. 원문에 그 금액이 있을 때만 저장한다
  add column verdict_fee_amount numeric(6, 2),
  add column verdict_fee_currency text,
  add column verdict_fee_kind public.transfer_fee_kind,
  add constraint transfer_news_verdict_raw_len
    check (verdict_raw is null or char_length(verdict_raw) between 1 and 2000),
  add constraint transfer_news_verdict_raw_needs_attempt
    check (verdict_raw is null or verdict_at is not null),
  add constraint transfer_news_verdict_fee_amount_range
    check (verdict_fee_amount is null or (verdict_fee_amount > 0 and verdict_fee_amount <= 350)),
  add constraint transfer_news_verdict_fee_currency_known
    check (verdict_fee_currency is null or verdict_fee_currency in ('EUR', 'GBP', 'USD')),
  add constraint transfer_news_verdict_fee_bundle
    check ((verdict_fee_amount is null) = (verdict_fee_currency is null)
       and (verdict_fee_amount is null) = (verdict_fee_kind is null)),
  -- 금액은 "이동" 판정에 딸린다
  add constraint transfer_news_verdict_fee_needs_move
    check (verdict_fee_amount is null or verdict = 'move');

comment on column public.transfer_news.verdict_raw is
  '판정자(LLM)가 낸 JSON 원출력. 후처리 규칙을 고쳤을 때 API를 다시 부르지 않고 재생하는 데 쓴다. 값이 있으면 금액까지 읽는 형식으로 판정된 행이다(비공개 컬럼)';
comment on column public.transfer_news.verdict_fee_amount is
  '판정자(LLM)가 원문에서 읽은 verdict_player의 금액(백만 단위). 원문에 그 금액이 있을 때만 저장한다(비공개 컬럼)';
comment on column public.transfer_news.verdict_fee_currency is
  'verdict_fee_amount의 통화(EUR·GBP·USD). 금액과 한 묶음이다(비공개 컬럼)';
comment on column public.transfer_news.verdict_fee_kind is
  'verdict_fee_amount의 성격 — 이적료·제안액·요구액·바이아웃·평가액. 금액과 한 묶음이다(비공개 컬럼)';

-- ⚠ transfer_news의 SELECT는 컬럼 grant다(20260924000001) — 새 컬럼은 grant하지 않아 anon·authenticated가 읽지 못한다.

alter table public.transfer_deal
  -- 딜의 대표 금액(fee_amount)의 성격. 규칙이 읽은 금액은 성격을 모른다(null)
  add column fee_kind public.transfer_fee_kind,
  add constraint transfer_deal_fee_kind_needs_fee
    check (fee_kind is null or fee_amount is not null);

comment on column public.transfer_deal.fee_kind is
  'fee_amount의 성격 — 이적료·제안액·요구액·바이아웃·평가액. 판정자가 읽지 못한 금액은 null(화면은 "추정 이적료")';

-- ⚠ transfer_deal은 테이블 단위 SELECT grant(20260925000001)가 새 컬럼도 덮는다 — 따로 grant하지 않는다.

-- 이름 캐시의 표기는 팬들이 쓰는 표기가 먼저다 — 판정자의 통용 표기(source = 'llm')가 위키데이터 레이블을 덮는다.
-- 항목 id는 그대로 남아 검증 관문(wikidata_id)을 연다.
comment on column public.transfer_name_ko.source is
  '표기의 출처 — llm(판정자가 적은 통용 표기) 또는 wikidata(항목 레이블, 통용 표기가 없을 때). 사람 사전(players-ko.json)이 둘 다 덮는다';
