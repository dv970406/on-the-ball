-- =====================================================================
-- 응원 구단 — 사용자가 고른 구단(자기 행만)
--
-- 팬이 이적 소식을 읽는 단위는 구단이다. 고른 구단은 보드의 구단 칩 맨 앞에 놓이고, 알림을 켠
-- 사용자에게는 그 구단이 걸린 딜의 소식이 간다(알림 발송은 파생 스크립트가 이 표를 읽는다).
--
-- 형태는 `transfer_deal_watch`와 같다 — 복합 PK가 "한 구단을 두 번 고를 수 없다"를 겸하고,
-- 카운터가 없어 RPC가 필요 없다(훅이 insert/delete를 직접 보내고 23505는 멱등으로 흡수한다).
--
-- ⚠ **구단 FK가 `transfer_club`을 잡는다.** 그 표는 파생 스크립트가 채우는데, 딜에 나온 구단만
--   채우면 딜이 아직 없는 구단은 고를 수 없다 — 그 구단의 첫 딜을 알리는 것이 이 기능의 쓸모라
--   파생이 **표시 프리셋의 구단 전부**를 함께 써 둔다(`scripts/lib/transfer/derive-deals.mjs`).
-- =====================================================================

create table public.transfer_club_follow (
  user_id    uuid not null references public.profiles      (id)   on delete cascade,
  club_code  text not null references public.transfer_club (code) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, club_code)
);

-- 복합 PK의 선두가 user_id라 club_code 단독 조회(알림 발송이 구단별 팔로워를 찾는다 · 구단 삭제
-- cascade)는 인덱스를 못 탄다(`transfer_deal_watch_deal_id_idx`와 같은 사유)
create index transfer_club_follow_club_code_idx on public.transfer_club_follow (club_code);

comment on table public.transfer_club_follow is
  '응원 구단. SELECT·INSERT·DELETE 정책이 전부 본인 행만 열고 UPDATE 경로는 없다. '
  '보드의 구단 칩 순서와 알림 발송 대상(파생 스크립트, service_role)이 이 표를 읽는다';
comment on column public.transfer_club_follow.created_at is
  '고른 시각. INSERT grant 목록 밖이라 클라이언트가 실을 수 없다(시각 위조 차단)';

alter table public.transfer_club_follow enable row level security;

-- 본인만 본다. ⚠ 남의 응원 구단을 여는 SELECT 정책을 두지 않는다 — 카운터도 없으니 열 이유가 없다.
create policy "transfer_club_follow_select_own" on public.transfer_club_follow
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "transfer_club_follow_insert_own" on public.transfer_club_follow
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "transfer_club_follow_delete_own" on public.transfer_club_follow
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ⚠ UPDATE 정책을 두지 않는다 = 행은 불변이다(풀기는 delete). 행을 다른 구단·사람으로 옮기는
--   경로와 created_at 위조 경로가 함께 닫힌다.

-- ---------------------------------------------------------------------
-- 권한 위생 — public 스키마 기본 권한이 anon/authenticated에 ALL이다
-- ---------------------------------------------------------------------
revoke all on public.transfer_club_follow from anon, authenticated;

-- ⚠ **anon에는 SELECT도 주지 않는다**(`transfer_deal_watch`와 다르다). 그쪽은 공개 목록 select에
--   임베딩되어 grant가 통로였지만, 이 표는 로그인 사용자의 전용 조회로만 읽는다.
grant select (user_id, club_code) on public.transfer_club_follow to authenticated;
-- created_at은 default가 채운다 — grant에서 빼 시각 위조를 막는다
grant insert (user_id, club_code) on public.transfer_club_follow to authenticated;
grant delete on public.transfer_club_follow to authenticated;
