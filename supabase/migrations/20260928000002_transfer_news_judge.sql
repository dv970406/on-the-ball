-- LLM 판정·요약 통합 — 보도 한 건에 한 번 부르고 판정(verdict)·출발·행선지·요약(summary_ko)을 함께 쓴다
-- (`scripts/lib/transfer/judge.mjs`, service_role). 전부 추출 컬럼이라 원문 고정 트리거에 걸리지 않는다.
--
-- ⚠ verdict_from·verdict_to는 비공개다 — 화면은 파생된 transfer_deal의 구단을 그린다. anon·authenticated에 grant하지 않는다.
-- ⚠ 시도 시각은 verdict_at 하나다 — 판정과 요약을 한 호출로 얻으므로 summarized_at을 따로 두지 않는다.

alter table public.transfer_news
  -- 판정자가 원문에서 읽은 출발·행선지 구단(정규 영문명 — 구단 사전 clubs.mjs, 사전 밖이면 원문 표기). 딜 파생이 방향 표로 쓴다
  add column verdict_from text,
  add column verdict_to text,
  add constraint transfer_news_verdict_from_len
    check (verdict_from is null or char_length(verdict_from) between 1 and 120),
  add constraint transfer_news_verdict_to_len
    check (verdict_to is null or char_length(verdict_to) between 1 and 120),
  -- 구단은 판정에 딸린다
  add constraint transfer_news_verdict_clubs_need_verdict
    check ((verdict_from is null and verdict_to is null) or verdict is not null);

comment on column public.transfer_news.verdict_from is
  '판정자(LLM)가 원문에서 읽은 verdict_player의 현재 소속 구단(정규 영문명). 원문에 있는 구단만 저장한다(비공개 컬럼)';
comment on column public.transfer_news.verdict_to is
  '판정자(LLM)가 원문에서 읽은 행선지 구단(정규 영문명). 원문에 있는 구단만 저장한다(비공개 컬럼)';

-- 요약 시도 시각을 없앤다 — 판정과 요약이 한 호출이라 시도 시각은 verdict_at이다
alter table public.transfer_news
  drop constraint transfer_news_summary_attempted;
drop index if exists public.transfer_news_unsummarized_idx;
alter table public.transfer_news drop column summarized_at;

comment on column public.transfer_news.summary_ko is
  '한국어 1~2문장 요약(LLM 판정과 같은 호출). 없으면 화면이 영문 발췌(body_excerpt)로 대신한다. writer는 수집 스크립트의 판정 단계';
comment on column public.transfer_news.verdict_at is
  '판정·요약을 시도한 시각. 다시 묻게 하려면 verdict·verdict_player·verdict_at을 null로 되돌린다(비공개 컬럼)';

-- 옛 판정은 출발·행선지가 없다 — 되돌려서 다음 실행부터 새 형식으로 다시 묻게 한다(요약은 남긴다 — 다시 판정할 때 덮어쓴다)
update public.transfer_news
   set verdict = null, verdict_player = null, verdict_evidence = null, verdict_at = null
 where verdict_at is not null;
