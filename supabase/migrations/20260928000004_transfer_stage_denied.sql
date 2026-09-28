-- 단계 `denied`(부인) — 관심·연결 수준의 루머를 구단·선수·기자가 부인한 것. `collapsed`(결렬)는 협상·제안·합의까지 갔던 딜이 깨진 것이다.
-- 둘을 한 값으로 두면 "리즈는 암파두를 팔 생각이 없다"가 결렬로 그려진다 — 결렬은 딜이 있었다는 말이라 뜻이 어긋난다.
--
-- ⚠ enum 값은 지울 수 없다(`api-and-db.md`). 되돌릴 일이 없는 구분이라 더한다.
-- ⚠ `add value`한 값은 같은 트랜잭션에서 쓸 수 없다 — 백필은 파생 스크립트가 다음 실행에서 한다(딜 단계는 매 실행 다시 계산된다).
-- 딜 수준의 결렬/부인 판정은 파생이 보도 이력으로 한다(`derive-deals.mjs`의 `resolveStage`) — 부인 보도 앞에 협상 이상이 있었으면 결렬이다.
alter type public.transfer_stage add value 'denied' after 'collapsed';
