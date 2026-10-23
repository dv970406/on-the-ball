-- 알림 기록의 키에 이적 창(회차)을 더한다 — (딜, 상태 톤)만으로는 같은 선수의 다음 창 소식을 영영 알리지 않는다.
--
-- 왜: 딜 id는 선수당 영구다(딜 키 = 선수명). 여름 임대가 "오피셜"로 알려진 선수는 다음 해 여름의 완전 이적 오피셜이 같은
-- (딜, official) 키에 걸려 기록이 무시되고 발송되지 않았다. 해마다 옮기는 선수(연쇄 임대)도 같다.
-- 같은 창 안에서는 지금처럼 상태마다 한 번이다.

alter table public.transfer_deal_push_log
  -- 알린 시점에 추적하던 이적 창(`windows.json`의 key — "2026-summer"). 창 일정이 없던 때의 기록은 ''
  add column round_key text not null default '' check (round_key = '' or round_key ~ '^[0-9]{4}-(summer|winter)$');

-- 옛 기록은 보낸 시각에 추적하던 창(그 시각 이전에 열린 가장 늦은 창)으로 채운다 — 창 일정의 DB 사본(transfer_window)을 쓴다
update public.transfer_deal_push_log l
   set round_key = coalesce((
     select w.key from public.transfer_window w
      where w.opens_at <= l.sent_at
      order by w.opens_at desc
      limit 1
   ), '');

alter table public.transfer_deal_push_log drop constraint transfer_deal_push_log_pkey;
alter table public.transfer_deal_push_log add primary key (deal_id, round_key, status);

comment on table public.transfer_deal_push_log is
  '이미 알림을 보낸 (딜, 이적 창, 상태 톤). 유일한 writer는 scripts/sync-transfer-news.mjs의 알림 단계(service_role)이고 '
  '쓰기 정책도 grant도 없다. 같은 창 안에서 같은 딜의 같은 상태를 두 번 알리지 않는다';
comment on column public.transfer_deal_push_log.round_key is
  '알린 시점에 추적하던 이적 창(windows.json의 key). 창이 바뀌면 같은 딜의 같은 상태도 다시 알린다(같은 선수의 다음 창 이적)';
