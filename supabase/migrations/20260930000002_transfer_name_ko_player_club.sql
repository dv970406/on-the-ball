-- 이름 캐시에 종류 `player_club`(선수의 현 소속 구단)을 더한다 — 출발 구단 폴백의 원천.
--
-- 기사가 선수의 소속을 말하지 않으면 딜의 출발 구단이 비어 화면에 "미확인"이 떴다(운영: 해리 케인의 출발이 미확인).
-- 그런 딜은 파생 스크립트가 위키데이터 소속팀(P54 — 종료일 없는 축구 클럽 중 시작이 가장 늦은 것)을 찾아 여기 캐시하고
-- 출발 구단으로 쓴다(`names-ko.mjs`의 `lookupCurrentClubs` · `derive-deals.mjs`의 폴백). 행의 뜻:
--   key = 선수 키(normalizePlayer) · name_en = 구단 정규 영문명 · wikidata_id = 구단 항목 · name_ko는 쓰지 않는다(구단 표기는 kind='club' 행).
--   찾지 못한 선수도 남긴다(wikidata_id null · name_en은 선수 이름 — 자리 채움) — 매시 다시 찾지 않게. 소속은 바뀌므로 14일마다 재확인한다.
-- ⚠ CHECK 이름은 Postgres가 붙인 기본 이름이다(`transfer_name_ko_kind_check`).
alter table public.transfer_name_ko drop constraint transfer_name_ko_kind_check;
alter table public.transfer_name_ko add constraint transfer_name_ko_kind_check check (kind in ('player', 'club', 'player_club'));
comment on column public.transfer_name_ko.kind is
  'player(선수 표기) · club(구단 표기) · player_club(선수의 현 소속 구단 — key는 선수 키, name_en은 구단 정규 영문명, wikidata_id는 구단 항목)';
