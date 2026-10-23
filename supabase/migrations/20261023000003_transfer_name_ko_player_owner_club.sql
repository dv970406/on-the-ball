-- 이름 캐시에 종류 `player_owner_club`(임대 중인 선수를 보유한 구단)을 더한다 — 임대 중인 선수의 출발 구단을 바로잡는 원천.
--
-- 현 소속(`player_club`)은 종료일 없는 소속팀 중 시작이 가장 늦은 것이라 임대 중이면 **임대 구단**이 뽑힌다. 그 값을 출발로 쓰면
-- 임대 중인 선수의 이적설이 "임대 구단 → 행선지"가 된다(파는 쪽은 보유 구단이다). 위키데이터는 임대 기록에 취득 방식 한정자
-- (P1642 = 임대 Q2914547)를 단다 — 현 소속이 그 기록이고 종료일 없는 다른 구단 기록이 있으면 그 구단이 보유 구단이다(실측: 가르나초 —
-- 애스턴 빌라 기록에 임대 한정자, 첼시 기록이 열려 있다). 행의 뜻은 `player_club`과 같다:
--   key = 선수 키 · name_en = 보유 구단 정규 영문명 · wikidata_id = 구단 항목. 임대 중이 아니면 wikidata_id null(name_en은 선수 이름 — 자리 채움).
--   `player_club`과 함께 쓰고 함께 다시 확인한다(14일) — 임대가 끝나면 다음 확인에서 비워진다.
alter table public.transfer_name_ko drop constraint transfer_name_ko_kind_check;
alter table public.transfer_name_ko add constraint transfer_name_ko_kind_check check (kind in ('player', 'club', 'player_club', 'player_owner_club'));
comment on column public.transfer_name_ko.kind is
  'player(선수 표기) · club(구단 표기) · player_club(선수의 현 소속 구단 — 임대 중이면 임대 구단) · '
  'player_owner_club(임대 중인 선수를 보유한 구단 — 임대 중이 아니면 wikidata_id null). 두 소속 행의 key는 선수 키, name_en은 구단 정규 영문명, wikidata_id는 구단 항목';
