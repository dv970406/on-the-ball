-- =====================================================================
-- 웹 푸시 알림 — 기기의 구독(사용자 쓰기)과 보낸 알림의 기록(운영 데이터)
--
-- 알림이 가는 순간은 둘이다: 관심 딜의 상태가 바뀔 때, 응원 구단에 새 딜이 생기거나 그 딜이 크게
-- 진전될 때. 보내는 쪽은 매시 도는 파생 스크립트(service_role)다 — 딜을 쓰면서 무엇이 바뀌었는지
-- 이미 알고 있고, 앱에는 서버 비밀을 둘 자리(Route Handler)가 없다.
--
-- 표가 둘이다.
--   1. profiles_push_subscription — 브라우저가 발급받은 구독 한 건(기기 하나). 사용자가 자기 행만 쓴다.
--   2. transfer_deal_push_log     — 어느 딜의 어느 상태를 이미 알렸는가. 파생 스크립트만 쓴다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. profiles_push_subscription — 기기의 푸시 구독 (자기 행만)
--
-- ⚠ **PK가 endpoint다.** 구독은 브라우저(기기)의 것이지 계정의 것이 아니다 — 같은 브라우저에서
--   계정을 바꾸면 그 endpoint는 한 사람에게만 속해야 한다. 그래서 다른 계정의 행이 남은 endpoint를
--   넣으려 하면 23505이고, 클라이언트는 그 전에 브라우저 구독을 새로 받아 endpoint를 바꾼다
--   (옛 행은 다음 발송에서 410을 받아 스크립트가 지운다).
-- ⚠ endpoint는 **스크립트가 요청을 보내는 주소**다. 여기서는 모양(`https://호스트[:포트]/경로`)과 길이만 보고,
--   아는 푸시 서비스의 호스트인지는 보내는 쪽(`scripts/lib/transfer/notify.mjs`)이 판정한다 — DB가 호스트 목록을
--   쥐면 브라우저가 새 푸시 서비스를 쓰기 시작한 날 구독이 등록되지 않는다.
-- ⚠ **호스트 자리에는 영숫자·점·하이픈만 받는다.** URL 파서마다 호스트의 끝을 다르게 읽는 글자(`;`·따옴표·`\`·`@`)가
--   들어오면, 호스트를 검사한 쪽과 실제로 접속하는 쪽이 서로 다른 서버를 보게 된다(보내는 쪽도 같은 모양을 한 번 더 본다).
-- ---------------------------------------------------------------------
create table public.profiles_push_subscription (
  endpoint text primary key
    check (endpoint ~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?/[^[:space:]]*$' and char_length(endpoint) <= 1000),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- 메시지 암호화 키(브라우저의 P-256 공개키 65바이트 · 인증 비밀 16바이트)의 base64url 표기
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{80,100}$'),
  auth   text not null check (auth   ~ '^[A-Za-z0-9_-]{16,40}$'),
  created_at timestamptz not null default now()
);

-- 발송이 사용자별 구독을 찾는다(PK는 endpoint라 user_id 단독 조회를 못 탄다) · 탈퇴 cascade
create index profiles_push_subscription_user_id_idx on public.profiles_push_subscription (user_id);

comment on table public.profiles_push_subscription is
  '웹 푸시 구독(기기 하나). SELECT·INSERT·DELETE 정책이 전부 본인 행만 열고 UPDATE 경로는 없다. '
  '발송(파생 스크립트, service_role)이 읽고, 푸시 서비스가 410을 준 행은 그 스크립트가 지운다';
comment on column public.profiles_push_subscription.endpoint is
  '푸시 서비스가 발급한 주소이자 PK. 브라우저(기기)마다 하나 — 계정이 바뀌면 클라이언트가 새로 받는다';
comment on column public.profiles_push_subscription.p256dh is
  '메시지 암호화용 공개키(base64url). 클라이언트에는 SELECT grant가 없다 — 발송만 읽는다';
comment on column public.profiles_push_subscription.created_at is
  '구독한 시각. INSERT grant 목록 밖이라 클라이언트가 실을 수 없다(시각 위조 차단)';

alter table public.profiles_push_subscription enable row level security;

create policy "profiles_push_subscription_select_own" on public.profiles_push_subscription
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "profiles_push_subscription_insert_own" on public.profiles_push_subscription
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "profiles_push_subscription_delete_own" on public.profiles_push_subscription
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ⚠ UPDATE 정책을 두지 않는다 = 행은 불변이다. 구독을 다른 사람에게 넘기는 경로(`user_id` 바꾸기)와
--   키를 바꿔치기하는 경로가 함께 닫힌다 — 바뀌면 지우고 새로 넣는다.

revoke all on public.profiles_push_subscription from anon, authenticated;

-- ⚠ SELECT는 `endpoint`·`user_id`·`created_at`뿐이다 — 클라이언트가 확인하는 것은 "이 기기의 구독이 내 것인가"
--   하나이고, `created_at`은 아래 상한 트리거가 호출자 권한으로 "가장 오래된 내 구독"을 고르는 데 읽는다.
--   암호화 키는 발송만 읽는다. anon에는 아무것도 주지 않는다.
grant select (endpoint, user_id, created_at) on public.profiles_push_subscription to authenticated;
grant insert (endpoint, user_id, p256dh, auth) on public.profiles_push_subscription to authenticated;
grant delete on public.profiles_push_subscription to authenticated;

-- ---------------------------------------------------------------------
-- 1-1. 한 계정의 구독 수 상한 — 넘치면 가장 오래된 것부터 걷어 낸다
--
-- 구독 행은 사용자가 쓰는 값이고 발송이 그 행마다 요청을 보낸다 → 계정당 행 수에 상한이 없으면 한 계정이 발송
-- 시간을 독점한다(조회도 응답 상한에서 잘린다). 행 수 제약은 CHECK로 표현할 수 없어 트리거가 진다.
--
-- ⚠ **거부하지 않고 오래된 것을 지운다.** 죽은 구독(로그아웃·재설치로 버려진 주소)은 그 사람에게 알림이 갈 때에만
--   정리되므로, 거부하는 상한이면 알림을 한 번도 받지 못한 채 기기를 여러 번 바꾼 사용자가 영영 켜지 못한다.
-- ⚠ **invoker다.** 지우는 것은 호출자 자신의 행뿐이고(DELETE·SELECT 정책이 "내 행만"), 그 권한으로 충분하다.
--   그래서 남의 명의로 넣으려는 insert에서는 아무것도 지워지지 않는다 — 그래도 첫 줄에서 명의를 확인해 판정을
--   정책에 넘긴다(api-and-db.md "트리거는 정책이 통과시킬 행에 대해서만 말한다").
--   service_role 경로(auth.uid()가 비어 있다)에서는 아무 일도 하지 않는다 — 그쪽은 구독을 넣지 않는다.
-- ---------------------------------------------------------------------
create or replace function public.profiles_push_subscription_prune()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from (select auth.uid()) then
    return new;
  end if;

  -- 새 행이 들어가면 열 개가 되도록, 최근 아홉 개만 남긴다
  delete from public.profiles_push_subscription
   where endpoint in (
     select s.endpoint
       from public.profiles_push_subscription s
      where s.user_id = new.user_id
      order by s.created_at desc, s.endpoint
     offset 9
   );

  return new;
end;
$$;

create trigger profiles_push_subscription_prune
  before insert on public.profiles_push_subscription
  for each row execute function public.profiles_push_subscription_prune();

-- 트리거 전용이다 — RPC로 부를 이유가 없다(함수는 기본적으로 PUBLIC에 EXECUTE가 부여된다)
revoke execute on function public.profiles_push_subscription_prune() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. transfer_deal_push_log — 이미 알린 (딜, 상태)
--
-- 같은 딜의 같은 상태를 두 번 알리지 않기 위한 기록이다. 발송은 **기록을 먼저 넣고**(충돌은 무시)
-- 새로 들어간 것만 보낸다 — 보내다 죽어도 다음 실행이 같은 알림을 다시 보내지 않는다
-- (알림은 한 번 덜 가는 편이 두 번 가는 것보다 낫다).
--
-- ⚠ `status`는 단계(`transfer_stage`)가 아니라 화면의 **상태 톤**이다(뱃지가 그리는 갈림 —
--   `src/entities/transfer/lib/stage.ts`의 `STAGE_STATUS`). 메디컬→개인 합의처럼 같은 톤 안의 이동은
--   화면에서 달라지는 것이 없어 알리지 않는다.
-- ⚠ 톤은 **enum**이다(`transfer_status_tone`). 화면의 `TransferStatus` 타입이 이 enum에서 생성되므로
--   (`model/types.ts`) 톤이 늘면 화면의 라벨·뱃지 맵이 컴파일 에러로 드러난다 — 화면과 DB가 따로 놀 수 없다.
-- ⚠ writer는 파생 스크립트(service_role) 하나다 — `transfer_deal`과 같이 쓰기 정책도 grant도 없다.
--   감출 것이 없는 운영 기록이라 읽기는 공개다(다른 `transfer_*` 운영 표와 같은 취급).
-- ---------------------------------------------------------------------
create type public.transfer_status_tone as enum
  ('official', 'hwg', 'imminent', 'talks', 'rumor', 'dead', 'denied');

comment on type public.transfer_status_tone is
  '딜의 상태 톤 — 단계(transfer_stage)를 화면의 뱃지가 그리는 갈림으로 접은 것. 값의 뜻과 단계→톤 매핑은 '
  'src/entities/transfer/lib/stage.ts가 갖는다';

create table public.transfer_deal_push_log (
  deal_id bigint not null references public.transfer_deal (id) on delete cascade,
  status  public.transfer_status_tone not null,
  sent_at timestamptz not null default now(),
  primary key (deal_id, status)
);

comment on table public.transfer_deal_push_log is
  '이미 알림을 보낸 (딜, 상태 톤). 유일한 writer는 scripts/sync-transfer-news.mjs의 알림 단계(service_role)이고 '
  '쓰기 정책도 grant도 없다. 같은 딜의 같은 상태를 두 번 알리지 않는다';
comment on column public.transfer_deal_push_log.status is
  '상태 톤(오피셜·합의 완료·합의 임박·협상 중·루머·결렬·부인) — 단계가 아니라 화면의 뱃지가 그리는 갈림이다';

alter table public.transfer_deal_push_log enable row level security;
create policy "transfer_deal_push_log_select_all" on public.transfer_deal_push_log for select using (true);

revoke all on public.transfer_deal_push_log from anon, authenticated;
grant select on public.transfer_deal_push_log to anon, authenticated;
