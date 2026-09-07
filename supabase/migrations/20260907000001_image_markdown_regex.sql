-- =====================================================================
-- 이미지 마크다운 패턴을 네 사본에서 **같은 형태로** 맞춘다.
--
-- 이 앱에는 같은 패턴의 사본이 넷 있다 — `post.excerpt` 생성식, DB의
-- `admin_strip_post_images`, 그리고 JS 두 곳(`IMAGE_MARKDOWN_SOURCE`가 단독 소유).
-- 그중 **둘만 균형 괄호로 하드닝돼 있었고, 그 둘도 제목(title)을 URL에 붙여 캡처했다.**
--
-- 고치는 것 둘:
--   ① 제목을 URL에서 뗀다 — `![](…webp "캡션")`에서 `…webp "캡션"`까지 캡처하면 그 값이
--      경로 검사(`{uuid}/{파일}` 두 세그먼트)를 **통과해** 존재하지 않는 키를 지우려 든다.
--      본문에서는 사라지는데 공개 버킷 파일은 남고 로그에도 흔적이 없다.
--   ② `excerpt` 생성식을 나머지 셋과 같은 형태로 올린다 — 지금은 `([^)]*)`라 괄호가 든
--      주소에서 `.png)` 잔여물이 목록 카드와 og:description에 남는다.
--
-- ⚠ 감싸지 않은 주소는 **공백에서 끊는다**(CommonMark). 렌더러가 이미지로 그리지 않는 것을
--   우리만 이미지로 세면 판정이 갈린다. 공백이 든 주소는 `<…>`로 감싼 형태만 받는다.
-- ⚠ **테이블 재작성**이다(stored generated 컬럼 교체). 인덱스가 재구축되고 ACCESS EXCLUSIVE
--   락이 걸린다 — 20260817000002가 같은 이유로 남긴 주의를 그대로 따른다: 원격에 적용할 때는
--   트래픽이 적은 시간에 돌린다. PG17의 `set expression`을 쓰지 않는 이유도 같다(메이저
--   버전을 전제하지 않는다).
-- =====================================================================

-- ---------------------------------------------------------------------
-- ① excerpt 생성식 — 나머지 셋과 같은 패턴으로
-- ---------------------------------------------------------------------
alter table public.post drop column excerpt;

alter table public.post
  add column excerpt text generated always as (
    left(
      regexp_replace(
        content,
        '!\[[^\]]*\]\(\s*(?:<([^<>]*)>|((?:[^\s()]|\([^()]*\))*))(?:\s+(?:"[^"]*"|''[^'']*''|\([^()]*\)))?\s*\)',
        ' ',
        'g'),
      300)
  ) stored not null;

comment on column public.post.excerpt is
  '목록 카드용 본문 프리픽스 — 이미지 마크다운을 지운 뒤 앞 300자. '
  'generated 컬럼이라 클라이언트 쓰기 경로가 아예 없다. '
  '패턴은 admin_strip_post_images·JS의 IMAGE_MARKDOWN_SOURCE와 같은 형태여야 한다';

-- ---------------------------------------------------------------------
-- ② admin_strip_post_images — 제목을 URL에서 뗀다
-- ---------------------------------------------------------------------
create or replace function public.admin_strip_post_images(
  p_post_id bigint,
  p_urls    text[] default null
) returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_content text;
  v_next    text;
  v_removed text[];
  -- 이미지 한 장. 캡처는 둘 — [1] 꺾쇠 안, [2] 맨 주소. 사유는 이 파일 머리말에.
  v_image   constant text :=
    '!\[[^\]]*\]\(\s*(?:<([^<>]*)>|((?:[^\s()]|\([^()]*\))*))(?:\s+(?:"[^"]*"|''[^'']*''|\([^()]*\)))?\s*\)';
  -- 제목이 붙어도 닫는 괄호까지 함께 걷어내기 위한 꼬리
  v_title   constant text := '(?:\s+(?:"[^"]*"|''[^'']*''|\([^()]*\)))?\s*\)';
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있어요.' using errcode = 'P0001';
  end if;

  select p.content into v_content from public.post p where p.id = p_post_id;
  if not found then
    raise exception '글을 찾을 수 없어요.' using errcode = 'P0001';
  end if;

  -- ⚠ 클라이언트의 `extractImageUrls`가 **같은 패턴**을 써야 한다(한쪽만 고치면 화면이
  --   보여준 목록과 실제로 지워지는 대상이 갈린다). JS 쪽 단일 소스는 IMAGE_MARKDOWN_SOURCE.
  select coalesce(array_agg(coalesce(m[1], m[2])), '{}')
    into v_removed
    from regexp_matches(v_content, v_image, 'g') as m
   where p_urls is null or coalesce(m[1], m[2]) = any(p_urls);

  if array_length(v_removed, 1) is null then
    return '{}';
  end if;

  v_next := v_content;
  if p_urls is null then
    v_next := regexp_replace(v_next, v_image, '', 'g');
  else
    -- 지정된 URL을 담은 이미지 마크다운만 걷어낸다.
    -- ⚠ 꺾쇠와 제목까지 함께 먹어야 닫는 괄호가 본문에 남지 않는다.
    v_next := regexp_replace(
      v_next,
      '!\[[^\]]*\]\(\s*<?(?:'
        || (select string_agg('(?:' || regexp_replace(u, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || ')', '|')
              from unnest(v_removed) u)
        || ')>?' || v_title,
      '', 'g');
  end if;

  if not public.has_visible_char(v_next) then
    raise exception '이미지를 빼면 본문이 비어요. 본문 가리기나 글 삭제를 써 주세요.'
      using errcode = 'P0001';
  end if;

  perform public.admin_set_post_content(p_post_id, v_next);
  return v_removed;
end;
$$;

revoke execute on function public.admin_strip_post_images(bigint, text[]) from public, anon;
grant  execute on function public.admin_strip_post_images(bigint, text[]) to authenticated;
