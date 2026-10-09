-- 판정의 출처 — 어느 모델·지시문·입력으로 난 판정인지, 몇 번 연달아 실패했는지를 행에 남긴다
-- (`scripts/lib/transfer/judge.mjs`, service_role). 호출 수는 그대로다.
--
-- 왜: 같은 보도를 다시 물으면 판정이 갈리는데, 지시문을 고친 효과인지 모델의 흔들림인지 가를 기록이 없었다.
-- 저장된 원출력을 다시 읽을 때(`--replay`) 기사 본문이 바뀌었는지도 알 수 없어, 바뀐 본문으로 옛 판정을 지웠다.
-- 같은 이유로 실패하는 보도는 24시간마다 끝없이 다시 물렸다(같은 행 9회).

alter table public.transfer_news
  -- 판정한 모델 id(`claude-sonnet-5` 등)
  add column verdict_model text,
  -- 지시문 지문 — 지시문·출력 형식·모델·생각 설정의 해시(`judgeFingerprint`). 같으면 같은 지시문으로 난 판정이다
  add column verdict_prompt text,
  -- 입력 지문 — 그 행에 보낸 사용자 메시지(선수·표기·기준 시각·원문)의 해시. 재생은 이 값이 같을 때만 원출력을 다시 읽는다
  add column verdict_input text,
  -- 판정에 실은 기사 본문의 길이(글자). 0이면 받으려 했지만 못 받았다, null이면 본문을 받는 소스가 아니다
  add column verdict_article_chars integer,
  -- 연달아 실패한 횟수(판정 불가·본문 못 받음) — 다시 묻는 간격을 늘리는 데 쓴다. 성공하면 0으로 돌아간다
  add column verdict_attempts smallint not null default 0,
  add constraint transfer_news_verdict_model_len
    check (verdict_model is null or char_length(verdict_model) between 1 and 60),
  add constraint transfer_news_verdict_prompt_len
    check (verdict_prompt is null or char_length(verdict_prompt) between 1 and 64),
  add constraint transfer_news_verdict_input_len
    check (verdict_input is null or char_length(verdict_input) between 1 and 64),
  add constraint transfer_news_verdict_article_chars_range
    check (verdict_article_chars is null or verdict_article_chars between 0 and 100000),
  add constraint transfer_news_verdict_attempts_range
    check (verdict_attempts between 0 and 100),
  -- 출처는 판정 시도에 딸린다
  add constraint transfer_news_verdict_provenance_needs_attempt
    check ((verdict_model is null and verdict_prompt is null and verdict_input is null and verdict_article_chars is null)
       or verdict_at is not null);

comment on column public.transfer_news.verdict_model is
  '판정한 모델 id. 판정 시도와 함께 쓴다(비공개 컬럼)';
comment on column public.transfer_news.verdict_prompt is
  '지시문 지문 — 지시문·출력 형식·모델·생각 설정의 해시. 같은 값이면 같은 지시문으로 난 판정이다(비공개 컬럼)';
comment on column public.transfer_news.verdict_input is
  '입력 지문 — 그 행에 보낸 사용자 메시지의 해시. 저장된 원출력을 다시 읽을 때 입력이 같은지 확인한다(비공개 컬럼)';
comment on column public.transfer_news.verdict_article_chars is
  '판정에 실은 기사 본문의 글자 수. 0 = 받으려 했지만 못 받음, null = 본문을 받는 소스가 아님(비공개 컬럼)';
comment on column public.transfer_news.verdict_attempts is
  '연달아 실패한 판정 시도 수(판정 불가·본문 못 받음). 다시 묻는 간격을 늘리는 데 쓰고 성공하면 0이다(비공개 컬럼)';

-- ⚠ transfer_news의 SELECT는 컬럼 grant다(20260924000001) — 새 컬럼은 grant하지 않아 anon·authenticated가 읽지 못한다.
