-- 이적 소식의 한국어 요약 — 수집 스크립트의 요약 단계(LLM)가 채운다
--
-- ⚠ **추출 컬럼이다.** `transfer_news_freeze_collected`의 수집 컬럼 목록에 없으므로 원문 고정 트리거에
--   걸리지 않는다(`deal_id`와 같은 성질). writer는 여전히 service_role 스크립트 하나뿐이다.
-- ⚠ **원문 전문이 아니라 1~2문장 요약이다.** `body`를 공개하지 않는 재배포 원칙(20260924000001)을
--   번역문으로 우회하지 않기 위해서다 — 길이 상한 CHECK가 그 원칙을 DB에서 지킨다.

alter table public.transfer_news
  add column summary_ko text,
  -- 요약을 **시도한** 시각. 요약이 없어도(이적과 무관 · 검증 실패) 찍힌다 —
  -- 매시 도는 수집기가 같은 행을 다시 부르지 않게 하는 표시다(부를 때마다 비용이 든다).
  add column summarized_at timestamptz,
  add constraint transfer_news_summary_ko_len
    check (summary_ko is null or (char_length(summary_ko) between 1 and 160 and public.has_visible_char(summary_ko))),
  -- 요약이 있으면 시도 시각도 있다(반대는 성립하지 않는다 — 무관 판정은 요약 없이 시각만 남는다)
  add constraint transfer_news_summary_attempted
    check (summary_ko is null or summarized_at is not null);

comment on column public.transfer_news.summary_ko is
  '한국어 1~2문장 요약(LLM). 없으면 화면이 영문 발췌(body_excerpt)로 대신한다. writer는 수집 스크립트의 요약 단계';
comment on column public.transfer_news.summarized_at is
  '요약을 시도한 시각 — null인 행만 요약 대상이다. 다시 요약하려면 이 값을 null로 되돌린다(비공개 컬럼)';

-- 요약 대상 조회(시도 전 · 최신순)를 받치는 부분 인덱스
create index transfer_news_unsummarized_idx
  on public.transfer_news (published_at desc) where summarized_at is null;

-- 공개 컬럼에 요약을 더한다. ⚠ `summarized_at`은 열지 않는다 — 화면이 쓸 일이 없는 운영 표시다.
grant select (summary_ko) on public.transfer_news to anon, authenticated;
