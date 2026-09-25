-- 이적 딜의 자유계약 여부 — 이적료 칸에 "FA(자유 계약)"를 그릴 근거
--
-- ⚠ **이적료가 비었다고 자유계약이 아니다.** 대부분의 빈 칸은 보도에 금액이 없거나 추출하지 못한
--   것이다(루머·협상 단계는 거의 전부). 그래서 화면이 빈 이적료를 FA로 추정하지 않고, 파생기가
--   보도 문장("free agent" · "on a free" · "free transfer" · "leaves X as a free agent")에서
--   **확인한 경우에만** 이 값을 켠다. 나머지 빈 칸은 "미공개"다.
-- ⚠ 이적료가 확인된 딜은 자유계약이 아니다 — 두 사실이 함께 서면 화면이 무엇을 그릴지 갈린다.

alter table public.transfer_deal
  add column is_free_agent boolean not null default false,
  add constraint transfer_deal_free_agent_no_fee
    check (not (is_free_agent and fee_amount is not null));

comment on column public.transfer_deal.is_free_agent is
  '보도 문장에서 자유계약(이적료 없음)을 확인했다. 이적료가 있으면 false(CHECK). writer는 파생 스크립트';

-- ⚠ 테이블 단위 SELECT grant(20260925000001)가 새 컬럼도 덮는다 — 따로 grant하지 않는다.
