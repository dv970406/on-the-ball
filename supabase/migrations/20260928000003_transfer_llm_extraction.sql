-- LLM 판정이 선수·단계·관심 구단까지 읽는다 — 규칙이 선수를 못 뽑은 보도도 같은 호출로 판정하고,
-- 규칙이 단계를 못 읽은 문장은 판정자의 단계를 쓰고, 관심 구단이 여럿인 루머는 행선지 하나 + 나머지 구단을 남긴다.
-- writer는 판정 단계(`scripts/lib/transfer/judge.mjs`, service_role) 하나다. 새 컬럼은 전부 비공개 추출 컬럼이다.

-- "이동 아님" 판정은 선수 없이도 성립한다(규칙이 선수를 못 뽑은 보도를 판정했을 때) — 선수는 "이동" 판정에만 딸린다
alter table public.transfer_news
  drop constraint transfer_news_verdict_attempted,
  add constraint transfer_news_verdict_attempted
    check (verdict is null or (verdict_at is not null and (verdict = 'not_move' or verdict_player is not null))),
  -- 판정자가 원문에서 읽은 선수 이름(원문 표기) — 규칙이 선수를 못 뽑은 보도는 이 값으로 딜에 묶인다. verdict_player가 그 정규형이다
  add column verdict_player_name text,
  -- 판정자가 읽은 단계 — 규칙이 그 선수의 단계를 못 읽었을 때만 딜 파생이 쓴다
  add column verdict_stage public.transfer_stage,
  -- 행선지(verdict_to) 밖의 관심 구단(정규 영문명) — 관심 구단이 여럿인 루머에서 "리버풀 외 3"을 그린다
  add column verdict_suitors text[] not null default '{}',
  add constraint transfer_news_verdict_player_name_len
    check (verdict_player_name is null or char_length(verdict_player_name) between 1 and 120),
  add constraint transfer_news_verdict_suitors_size
    check (cardinality(verdict_suitors) <= 10),
  add constraint transfer_news_verdict_extras_need_verdict
    check ((verdict_player_name is null and verdict_stage is null and cardinality(verdict_suitors) = 0) or verdict is not null);

comment on column public.transfer_news.verdict_player_name is
  '판정자(LLM)가 원문에서 읽은 선수 이름(원문 표기). 규칙이 선수를 못 뽑은 보도는 이 이름으로 딜에 묶인다(비공개 컬럼)';
comment on column public.transfer_news.verdict_stage is
  '판정자(LLM)가 읽은 이적 단계. 규칙이 그 선수의 단계를 못 읽었을 때만 딜 파생이 쓴다(비공개 컬럼)';
comment on column public.transfer_news.verdict_suitors is
  '행선지 밖의 관심 구단(정규 영문명). 딜의 suitor_codes로 모인다(비공개 컬럼)';

-- 이름 캐시에 출처를 둔다 — 위키데이터에 한국어 표기가 없는 선수는 판정자(LLM)의 음역을 임시 표기로 쓴다.
-- ⚠ LLM 표기는 확인(wikidata_id)이 아니다 — 검증 관문은 여전히 wikidata_id만 본다. 위키데이터에서 찾으면 그 표기가 덮는다.
alter table public.transfer_name_ko
  add column source text not null default 'wikidata' check (source in ('wikidata', 'llm')),
  drop constraint transfer_name_ko_has_source,
  add constraint transfer_name_ko_has_source
    check (name_ko is null or wikidata_id is not null or source = 'llm');

comment on column public.transfer_name_ko.source is
  '표기의 출처 — wikidata(항목 레이블) 또는 llm(판정자의 음역, 위키데이터에 표기가 없을 때의 임시값). 사람 사전(players-ko.json)이 둘 다 덮는다';

-- 딜의 관심 구단(행선지 밖) — 구단 코드 배열. 화면은 "행선지 외 N"으로 그린다. 구단 행은 파생이 함께 upsert한다
alter table public.transfer_deal
  add column suitor_codes text[] not null default '{}',
  add constraint transfer_deal_suitor_codes_size check (cardinality(suitor_codes) <= 10);

comment on column public.transfer_deal.suitor_codes is
  '행선지(to_club_code) 밖의 관심 구단 코드. 관심 구단이 여럿인 루머에서 "행선지 외 N"을 그린다(파생 컬럼)';

-- 찾지 못했던 이름을 다음 실행부터 다시 찾게 한다 — 선수 일치 규칙이 넓어져(레이블 앞부분 일치) 전에 막힌 실존 선수가 열린다.
-- 확인된 행(wikidata_id 있음)은 건드리지 않는다. 실행당 조회 상한이 있어 몰리지 않는다.
update public.transfer_name_ko set checked_at = '1970-01-01T00:00:00Z' where wikidata_id is null;
