-- =====================================================================
-- 회차별 딜 결과 — 판정이 끝난 회차의 성사·불발을 굳힌다
--
-- 채점(`scripts/lib/transfer/predictions.mjs`)은 매번 처음부터 다시 하는데, 회차의 결과를 **지금의**
-- `transfer_deal.settled_at`으로 읽었다. 딜은 선수당 하나라 여름 창에 오피셜이 난 선수에게 다음 창의 파생 범위에서
-- 보도가 하나라도 생기면 같은 딜이 새 창의 보도만으로 다시 파생되어 settled_at이 지워진다(단계 루머). 그러면 지난 회차의
-- "성사" 적중이 불발로, "불발" 표가 적중으로 소급해 뒤집혔다.
-- → 판정 시각(마감 + 유예)에 확정 유예까지 지난 회차의 결과를 채점 스크립트가 한 번 적어 두고, 그 뒤로는 이 값으로 채점한다.
--
-- ⚠ 쓰기 정책도 grant도 없다(운영 데이터) — 유일한 writer는 채점 스크립트(service_role)이고, 한 번 적은 행은 고치지 않는다.
-- ⚠ 행은 표가 있는 (딜, 회차)에만 생긴다. 예측이 걸린 딜은 지워지지 않으므로(예측 FK restrict) 딜 cascade는 표가 다
--   사라진 뒤에만 닿는다.
-- =====================================================================
create table public.transfer_deal_round_result (
  deal_id bigint not null references public.transfer_deal (id) on delete cascade,
  round_key text not null references public.transfer_window (key),
  -- 그 회차의 판정 시각 이전에 합의 완료·오피셜이 난 보도의 게시 시각 — null이면 그 회차는 불발이다
  settled_at timestamptz,
  -- 결과를 적은 시각(채점 스크립트가 처음 굳힌 실행)
  decided_at timestamptz not null default now(),
  primary key (deal_id, round_key)
);

comment on table public.transfer_deal_round_result is
  '판정이 끝난 회차의 딜 결과(성사 시각 또는 불발). 채점이 지난 회차를 지금의 transfer_deal.settled_at으로 다시 읽지 않게 '
  '한 번 굳힌다. 유일한 writer는 채점 스크립트(service_role)이고 쓰기 정책도 grant도 없다. 읽기 공개';
comment on column public.transfer_deal_round_result.settled_at is
  '그 회차 안(마감 + 유예 이전)에 합의 완료·오피셜이 난 보도의 게시 시각. null이면 불발';

alter table public.transfer_deal_round_result enable row level security;

-- 감출 것이 없다 — 딜의 settled_at과 창 일정에서 누구나 계산할 수 있는 값이다
create policy "transfer_deal_round_result_select_all" on public.transfer_deal_round_result
  for select using (true);

revoke all on public.transfer_deal_round_result from anon, authenticated;
grant select on public.transfer_deal_round_result to anon, authenticated;
