-- =====================================================================
-- excerpt에서 이미지 마크다운을 제외한다
--
-- 본문 이미지가 생기면서 `left(content, 300)`의 예산을 URL이 통째로 먹게 됐다.
-- 공개 URL 한 줄이 150자 안팎이라 **사진으로 시작하는 글은 목록 카드 발췌가 사실상 빈다**
-- (`toPlainSummary`가 이미지 문법을 공백으로 지우므로 결과는 빈 문자열에 가깝다).
--
-- ⚠ 이건 `toPlainSummary`의 규칙을 DB로 복제하는 게 아니다. 나머지 기호 제거는 여전히
--   클라이언트가 한다 — 여기서는 **어차피 버려질 문자열을 프리픽스 예산에서 빼는 것**뿐이다.
--   두 곳이 같아야 하는 규약이 아니므로 한쪽만 고쳐도 갈리지 않는다.
--
-- ⚠ generated 식은 IMMUTABLE만 허용된다. `regexp_replace`는 오버로드 전량이 immutable이다
--   (확인: select provolatile from pg_proc where proname = 'regexp_replace' → 'i').
--
-- ⚠ **테이블 재작성**이다(stored generated 컬럼 추가). 인덱스가 재구축되고 ACCESS EXCLUSIVE
--   락이 걸린다. 지금 규모에선 무해하지만 원격에 적용할 때는 트래픽이 적은 시간에 돌린다.
--   컬럼 순서가 맨 뒤로 밀리는데 조회는 전부 이름으로 뽑으므로(POST_LIST_SELECT) 영향이 없다.
--
-- ⚠ PG17의 `alter column ... set expression`을 쓰지 않는다 — 원격 인스턴스의 메이저 버전을
--   전제하지 않기 위해서다. drop + add는 어느 버전에서도 돈다.
-- =====================================================================
alter table public.post drop column excerpt;

alter table public.post
  add column excerpt text generated always as (
    left(regexp_replace(content, '!\[[^\]]*\]\([^)]*\)', ' ', 'g'), 300)
  ) stored not null;

comment on column public.post.excerpt is
  '목록 카드용 본문 프리픽스 — 이미지 마크다운을 지운 뒤 앞 300자. '
  'generated 컬럼이라 클라이언트 쓰기 경로가 아예 없다';
