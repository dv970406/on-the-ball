-- 임대 — 보도가 말하는 거래의 **형태**와 선수의 **임대 상태**를 판정과 딜에 담는다(`scripts/lib/transfer/judge.mjs`·`derive-deals.mjs`, service_role).
-- 호출 수는 그대로다(같은 판정 호출의 출력에 필드가 늘 뿐이다).
--
-- 왜: 판정 출력에 임대를 담을 칸이 없어 "완전 이적 의무 조항이 붙은 임대로 빌라에서 뛰는 중"이라는 보도가 "합의 임박 · £42.5M 이적료"가
-- 됐고(가르나초 — 운영), 임대 중인 선수의 제3구단 이적설은 출발이 소유 구단일 때도 임대 구단일 때도 있었다(디 그레고리오: 본머스 → 볼로냐,
-- 실제 파는 쪽은 유벤투스). 요약(summary_ko)은 임대를 정확히 적었는데 단계·금액으로 옮겨지며 정보가 사라졌다.
--
-- ⚠ 단계(transfer_stage)는 그대로 둔다 — 단계는 진전의 축이고 형태는 그와 직교하는 축이다. 둘을 한 enum에 곱하면 지울 수 없는 값이 는다.
-- ⚠ 이 파일은 transfer_fee_kind에 값을 더한다 — 더한 값은 같은 트랜잭션에서 쓸 수 없으므로 이 파일은 그 값을 쓰지 않는다.

-- 보도 한 건이 말하는 사건의 형태. 영문 키 + 라벨맵(`api-and-db.md` "열거값은 enum으로 둔다")
create type public.transfer_move_form as enum ('permanent', 'loan', 'loan_convert', 'loan_standing', 'loan_recall', 'loan_extend');

comment on type public.transfer_move_form is
  '보도가 말하는 사건의 형태 — permanent(완전 이적) · loan(새 임대) · loan_convert(임대 중인 구단으로의 완전 영입 전환·조항 행사) · '
  'loan_standing(새 움직임 없이 진행 중인 임대·조항을 설명하는 보도 — 딜의 단계를 움직이지 않는다) · loan_recall(임대 조기 복귀) · loan_extend(임대 연장)';

-- 임대에 붙은 완전 이적 조항
create type public.transfer_loan_clause as enum ('option', 'obligation');

comment on type public.transfer_loan_clause is
  '임대에 붙은 완전 이적 조항 — option(완전 이적 옵션: 임대 구단이 고른다) · obligation(완전 이적 의무: 조건이 맞으면 사야 한다)';

-- 금액의 성격 — 임대료와 완전 이적 조항 금액. 사는 쪽(임대 구단)이 내는 값이다
alter type public.transfer_fee_kind add value 'loan_fee';
alter type public.transfer_fee_kind add value 'buy_clause';

comment on type public.transfer_fee_kind is
  '보도가 말하는 금액의 성격 — fee(합의·보도된 이적료) · bid(제안액) · asking_price(요구액) · release_clause(바이아웃) · valuation(평가액) · '
  'loan_fee(임대료) · buy_clause(임대에 붙은 완전 이적 옵션·의무 금액)';

alter table public.transfer_news
  -- 판정자가 읽은 그 보도의 사건 형태. "이동" 판정에 딸린다
  add column verdict_form public.transfer_move_form,
  -- 보도 시점에 선수가 임대 중이면 그 계약을 가진 소유 구단과 지금 임대로 뛰는 구단(정규 영문명 — 구단 사전·위키데이터 확인을 지난 값)
  add column verdict_loan_owner text,
  add column verdict_loan_club text,
  -- 그 임대에 붙은 완전 이적 조항
  add column verdict_loan_clause public.transfer_loan_clause,
  add constraint transfer_news_verdict_loan_owner_len
    check (verdict_loan_owner is null or char_length(verdict_loan_owner) between 1 and 120),
  add constraint transfer_news_verdict_loan_club_len
    check (verdict_loan_club is null or char_length(verdict_loan_club) between 1 and 120),
  add constraint transfer_news_verdict_loan_needs_move
    check ((verdict_form is null and verdict_loan_owner is null and verdict_loan_club is null and verdict_loan_clause is null)
       or verdict = 'move');

comment on column public.transfer_news.verdict_form is
  '판정자(LLM)가 읽은 그 보도의 사건 형태 — 완전 이적·임대·완전 영입 전환·진행 중 임대·조기 복귀·임대 연장. "이동" 판정에만 있다. '
  'null은 형태를 묻기 전의 판정이다(파생은 형태를 모르는 것으로 본다)(비공개 컬럼)';
comment on column public.transfer_news.verdict_loan_owner is
  '보도 시점에 선수가 임대 중이면 그 선수를 보유한 구단(정규 영문명)(비공개 컬럼)';
comment on column public.transfer_news.verdict_loan_club is
  '보도 시점에 선수가 임대 중이면 지금 임대로 뛰는 구단(정규 영문명)(비공개 컬럼)';
comment on column public.transfer_news.verdict_loan_clause is
  '그 임대에 붙은 완전 이적 조항 — 옵션·의무(비공개 컬럼)';

-- ⚠ transfer_news의 SELECT는 컬럼 grant다(20260924000001) — 새 컬럼은 grant하지 않아 anon·authenticated가 읽지 못한다.

alter table public.transfer_deal
  -- 딜의 형태. null은 모른다(형태를 묻기 전의 판정만 있다 — 화면은 표지를 그리지 않는다). 진행 중 임대(loan_standing)는 보도의 형태이지
  -- 딜의 형태가 아니다 — 그런 보도만 남은 딜은 임대(loan)다
  add column form public.transfer_move_form,
  -- 지금 임대로 뛰는 구단 — 임대 중인 선수의 제3구단 이적설에서 출발(소유 구단) 아래 "○○ 임대 중"을 그린다
  add column loan_club_code text references public.transfer_club (code) on delete set null,
  add column loan_clause public.transfer_loan_clause,
  -- 임대료의 원문 표기("£5m") — 대표 금액이 조항 금액일 때 임대료는 계약 조건 줄에 따로 그린다
  add column loan_fee_text text,
  add constraint transfer_deal_form_not_standing
    check (form is null or form <> 'loan_standing'),
  add constraint transfer_deal_loan_clause_needs_loan
    check (loan_clause is null or form in ('loan', 'loan_convert', 'loan_extend')),
  add constraint transfer_deal_loan_fee_text_len
    check (loan_fee_text is null or char_length(loan_fee_text) between 1 and 40);

create index transfer_deal_loan_club_idx on public.transfer_deal (loan_club_code);

comment on column public.transfer_deal.form is
  '딜의 형태 — 완전 이적·임대·완전 영입 전환·조기 복귀·임대 연장. null은 모른다(화면은 표지를 그리지 않는다)';
comment on column public.transfer_deal.loan_club_code is
  '선수가 지금 임대로 뛰는 구단. 출발(from_club_code)은 늘 소유 구단이다';
comment on column public.transfer_deal.loan_clause is
  '임대에 붙은 완전 이적 조항 — 옵션·의무';
comment on column public.transfer_deal.loan_fee_text is
  '임대료의 원문 표기 — 대표 금액(fee_*)이 조항 금액일 때 계약 조건 줄에 따로 그린다';

-- ⚠ transfer_deal은 테이블 단위 SELECT grant(20260925000001)가 새 컬럼도 덮는다 — 따로 grant하지 않는다.
