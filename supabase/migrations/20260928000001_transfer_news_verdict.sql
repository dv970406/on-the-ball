-- 이적 판정(LLM) — 규칙이 딜 후보로 묶은 보도가 정말 그 선수의 구단 이동을 보도하는지에 대한 판정
--
-- ⚠ **추출 컬럼이다.** `transfer_news_freeze_collected`의 수집 컬럼 목록에 없으므로 원문 고정 트리거에
--   걸리지 않는다(`summary_ko`·`deal_id`와 같은 성질). writer는 수집 스크립트의 판정 단계 하나뿐이다
--   (`scripts/lib/transfer/verdict.mjs`, service_role).
-- ⚠ **판정자는 거부권만 가진다.** "이동 아님"이면 딜 파생이 그 보도를 딜에서 빼고, 새 딜은 "이동" 판정이
--   있어야 연다. 추출·단계·이적료는 여전히 규칙이 정한다(`derive-deals.mjs`).
-- ⚠ **공개하지 않는다** — 운영 표시다. anon·authenticated에 grant하지 않는다(`summarized_at`과 같은 처리).

-- 값이 둘뿐이지만 boolean이 아니라 enum이다 — "아직 묻지 않음"(null)과 "판정 불가"(null + 시각)를 값과 섞지 않고,
-- 생성 타입이 두 값을 그대로 내려준다(`api-and-db.md` "열거값은 enum으로")
create type public.transfer_verdict as enum ('move', 'not_move');

alter table public.transfer_news
  add column verdict public.transfer_verdict,
  -- 판정한 선수(딜 파생의 선수 키 — `normalizePlayer` 결과). 추출이 바뀌어 다른 선수의 딜로 옮겨 가면 다시 묻는다
  add column verdict_player text,
  -- 판정의 근거로 모델이 인용한 원문 구절(코드가 원문과 대조한 것만). 사람이 판정을 검토할 때 본다
  add column verdict_evidence text,
  -- 판정을 **시도한** 시각. 판정 불가(형식 위반·근거 불일치)여도 찍힌다 — 매시간 다시 부르지 않게 한다
  add column verdict_at timestamptz,
  add constraint transfer_news_verdict_player_len
    check (verdict_player is null or char_length(verdict_player) between 1 and 120),
  add constraint transfer_news_verdict_evidence_len
    check (verdict_evidence is null or (char_length(verdict_evidence) between 1 and 300 and public.has_visible_char(verdict_evidence))),
  -- 판정이 있으면 누구에 대한 판정인지와 시각도 있다(반대는 성립하지 않는다 — 판정 불가는 값 없이 시각만 남는다)
  add constraint transfer_news_verdict_attempted
    check (verdict is null or (verdict_player is not null and verdict_at is not null)),
  -- 근거는 판정에 딸린다
  add constraint transfer_news_verdict_evidence_needs_verdict
    check (verdict_evidence is null or verdict is not null);

comment on column public.transfer_news.verdict is
  '이 보도가 verdict_player의 구단 이동을 보도하는가(LLM 판정). not_move면 딜 파생이 딜에서 뺀다. null = 아직 묻지 않음 또는 판정 불가(비공개 컬럼)';
comment on column public.transfer_news.verdict_player is
  '판정한 선수의 키(normalizePlayer). 딜의 선수와 다르면 판정이 없는 것으로 보고 다시 묻는다(비공개 컬럼)';
comment on column public.transfer_news.verdict_evidence is
  '판정 근거로 인용한 원문 구절 — 원문에 실제로 있는 것만 저장한다(비공개 컬럼)';
comment on column public.transfer_news.verdict_at is
  '판정을 시도한 시각. 다시 묻게 하려면 verdict·verdict_player·verdict_at을 null로 되돌린다(비공개 컬럼)';
