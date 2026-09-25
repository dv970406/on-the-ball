-- 이적 소식 이름 사전의 자동 캐시 — 선수·구단의 한국어 표기(위키데이터)
--
-- 사람이 손으로 채우는 사전(`scripts/lib/transfer/players-ko.json` · `glossary-ko.json`)은 시즌마다 끝없이
-- 늘어난다. 그래서 **딜에 오른 이름만** 파생 단계가 위키데이터에서 한국어 표기를 찾아 여기 쌓고,
-- 사람은 틀렸거나 빈 것만 JSON으로 덮어쓴다(JSON이 늘 이긴다).
--
-- ⚠ **찾지 못한 이름도 행으로 남긴다**(`name_ko` null). 안 남기면 매시 도는 수집기가 같은 이름을 매번
--   다시 검색한다. `checked_at`이 오래되면(30일) 다시 찾는다 — 위키데이터에 표기가 새로 생긴다.
-- ⚠ writer는 service_role 파생 스크립트 하나다(`team`·`transfer_deal`과 같은 취급 — 쓰기 정책·grant 없음).
--   GitHub Actions 실행 환경은 매번 새로 만들어지므로 캐시는 파일이 아니라 DB에 둔다.

create table public.transfer_name_ko (
  kind         text not null check (kind in ('player', 'club')),
  -- 선수는 `normalizePlayer(영문명)`, 구단은 구단 사전의 정규 영문명(`clubs.mjs`)
  key          text not null check (char_length(key) between 1 and 120),
  name_en      text not null check (char_length(name_en) between 1 and 120),
  name_ko      text check (name_ko is null or (char_length(name_ko) between 1 and 120 and public.has_visible_char(name_ko))),
  wikidata_id  text check (wikidata_id is null or wikidata_id ~ '^Q[0-9]+$'),
  checked_at   timestamptz not null default now(),
  primary key (kind, key),
  -- 한국어 표기가 있으면 출처(위키데이터 항목)도 있다
  constraint transfer_name_ko_has_source check (name_ko is null or wikidata_id is not null)
);

comment on table public.transfer_name_ko is
  '선수·구단 한국어 표기의 자동 캐시(위키데이터). name_ko null = 찾지 못함(30일 뒤 다시 찾는다). writer는 파생 스크립트';

-- 감출 행이 없다 — 공개 표기다. 정책이 하나는 있어야 rls.sql 17b(정책 없는 RLS 테이블)에 걸리지 않는다
alter table public.transfer_name_ko enable row level security;
create policy "transfer_name_ko_select_all" on public.transfer_name_ko for select using (true);

revoke all on public.transfer_name_ko from anon, authenticated;
grant select on public.transfer_name_ko to anon, authenticated;
