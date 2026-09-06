-- =====================================================================
-- 공지사항 — 운영진이 쓰고 사용자가 읽는다
--
-- ⚠ **읽는 화면(/notices)은 아직 없다.** 그래도 정책을 지금 둔다 —
--   나중에 화면을 만들 때 필터를 잊어도 예약 공지가 새지 않게 하기 위해서다.
--   소프트 삭제를 정책에 맡긴 것과 같은 판단이다("정책은 엄격하게 두고
--   쓰기만 RPC로 내린다").
--
-- ⚠ **쓰기 정책도 grant도 두지 않는다.** 운영진만 쓰는 데이터라
--   survey·match와 같은 취급이고, 유일한 쓰기 경로가 어드민 definer
--   RPC다(20260906000005).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 타입
--
-- **값이 곧 라벨이다** — 배지에 이 단어가 그대로 나간다. post_category와
-- 같은 판단이고, report_reason(영문 키 + 라벨맵)과 반대다. 라벨맵을 두면
-- 같은 문자열을 두 곳에 적는 셈이 된다.
--
-- ⚠ **enum 값은 지울 수 없다**(add value·rename value만 있다). 그래서
--   둘로 시작하고 '이벤트' 같은 값을 미리 넣지 않는다 — 쓸지 모르는 값을
--   넣으면 영구히 남는다.
-- ---------------------------------------------------------------------
create type public.notice_type as enum ('필독', '공지');

create table public.notice (
  id bigint generated always as identity primary key,

  type public.notice_type not null default '공지',

  -- 길이는 두 단위로 겹쳐 건다 — 화면(그래핌 120)은 클라이언트가, DB는
  -- 코드포인트로. K=10배 근거와 표는 `docs/conventions/api-and-db.md`에.
  -- ⚠ .trim()이 아니라 has_visible_char다 — 제로폭·BOM만 담긴 제목이
  --   실제로 만들어졌던 사고 때문이다.
  title text not null
    check (char_length(title) between 1 and 1200)
    check (public.has_visible_char(title)),

  -- 마크다운 원문. post.content와 같은 단일 한도(그래핌 계산이 14배라
  -- 본문에는 도입하지 않는다).
  body text not null
    check (char_length(body) between 1 and 20000)
    check (public.has_visible_char(body)),

  -- 노출 기간.
  -- ⚠ **tstzrange가 아니라 두 컬럼이다.** range는 생성 타입이 "[a,b)" 문자열
  --   하나로 나와 클라이언트가 파서를 따로 가져야 하고, 폼의 시작/종료 두
  --   입력과 1:1이 아니다. 얻는 것은 없고 간접 계층만 는다.
  -- ⚠ 이름이 현재형인 이유: 아직 일어나지 않은 예정 시각이다(survey.closes_at과
  --   같은 규약 — 이미 일어난 사건이면 -ed_at).
  opens_at  timestamptz not null default now(),
  closes_at timestamptz,                      -- null = 무기한
  check (closes_at is null or closes_at > opens_at),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.notice is
  '운영진 공지. 쓰기 경로는 어드민 definer RPC뿐이다(정책도 grant도 없다)';
comment on column public.notice.closes_at is
  'null이면 무기한. 부분 갱신 RPC를 만들면 이 값을 null로 되돌릴 수 없게 되므로 update는 전체 치환이다';

-- 목록은 살아 있는 공지만 훑는다
create index notice_live_idx on public.notice (opens_at desc) where deleted_at is null;

-- ---------------------------------------------------------------------
-- 수정 시각 — WHEN 절로 좁힌다(삭제/복구가 "수정됨"이 되지 않게)
-- ---------------------------------------------------------------------
create trigger notice_touch_updated_at
  before update on public.notice
  for each row
  when ((old.type, old.title, old.body, old.opens_at, old.closes_at)
     is distinct from
        (new.type, new.title, new.body, new.opens_at, new.closes_at))
  execute function public.touch_updated_at();

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.notice enable row level security;

-- ---------------------------------------------------------------------
-- 노출 기간을 **정책이 소유한다**.
--
-- ⚠ 예약 공지는 발표 전의 내용이라 anon에게 보이면 안 된다 — 미래 일정이
--   곧 공개 콘텐츠인 match·survey와 갈리는 지점이다.
-- ⚠ `to` 절을 두지 않는다: 비로그인·크롤러가 읽어야 한다.
-- ⚠ 대가로 **관리자도 일반 경로로는 예약 공지를 못 본다.** 그 자리는
--   admin_notice_list가 갖는다(어드민 조회를 전부 RPC로 낸 것과 일관된다).
-- ⚠ 읽는 화면을 만들 때: 이 정책의 now()는 Next Data Cache와 상성이 나쁘다.
--   createSupabaseAnonClient로 캐시하면 만료된 공지가 캐시 수명만큼 남는다.
-- ---------------------------------------------------------------------
create policy "notice_select_live" on public.notice
  for select using (
    deleted_at is null
    and opens_at <= now()
    and (closes_at is null or closes_at > now())
  );

-- ---------------------------------------------------------------------
-- 권한 위생 — public 스키마 기본 권한이 ALL이라 revoke가 필수다
-- ---------------------------------------------------------------------
revoke all    on public.notice from anon, authenticated;
grant  select on public.notice to anon, authenticated;

-- ⚠ identity 시퀀스는 테이블 revoke에 딸려오지 않는다
revoke all on all sequences in schema public from anon, authenticated;

notify pgrst, 'reload schema';
