-- 딜의 관심 구단을 자식 테이블로 — 코드 배열(`suitor_codes`)로는 이름·엠블럼을 그릴 수 없었다("외 N"만 셀 수 있었다).
-- 화면이 관심 구단을 전부 엠블럼·이름으로 그리므로 관계 데이터를 관계로 둔다. 딜 조회가 임베딩 한 번으로 구단 행을 받는다.
--
-- ⚠ 테이블 이름이 부모를 말한다(`transfer_deal` → `transfer_deal_suitor`) — PK가 (deal_id, club_code)이고 딜이 지워지면 함께 지워진다.
-- ⚠ writer는 딜 파생(service_role) 하나다 — `transfer_deal`과 같이 쓰기 정책도 grant도 없다. 읽기는 공개다.

create table public.transfer_deal_suitor (
  deal_id   bigint   not null references public.transfer_deal (id)   on delete cascade,
  club_code text     not null references public.transfer_club (code),
  -- 보도에 언급된 순서(표 순) — 화면이 이 순서로 나열한다
  position  smallint not null check (position between 0 and 9),
  primary key (deal_id, club_code)
);

comment on table public.transfer_deal_suitor is
  '딜의 관심 구단(행선지 밖) — 여러 구단이 노리는 루머에서 화면이 전부 엠블럼·이름으로 그린다. writer는 딜 파생 단계(service_role)뿐';

alter table public.transfer_deal_suitor enable row level security;
create policy "transfer_deal_suitor_select_all" on public.transfer_deal_suitor for select using (true);
revoke all on public.transfer_deal_suitor from anon, authenticated;
grant select on public.transfer_deal_suitor to anon, authenticated;

-- 코드 배열은 걷는다 — 같은 사실을 두 곳에 두지 않는다(파생이 자식 행을 쓴다)
alter table public.transfer_deal drop column suitor_codes;
