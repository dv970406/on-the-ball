-- =====================================================================
-- 길이 한도를 **abuse bound로 재설정** — 화면 한도는 그래핌으로 옮겼다
--
-- 지금까지 클라이언트와 DB가 둘 다 **코드포인트**로 길이를 셌다. 판정이 갈리지 않는
-- 대신, 사용자가 한 글자로 보는 이모지가 여러 자로 세어졌다(실측):
--   ⚽ 1 / 👍🏽·🇰🇷·❤️ 2 / 👨‍👩‍👧‍👦·🏴󠁧󠁢󠁳󠁣󠁴󠁿 7 / 👨🏻‍❤️‍💋‍👨🏽 10
--
-- 그래서 **사용자에게 보이는 한도는 그래핌**(UAX #29 확장 그래핌 클러스터)으로 옮겼다.
-- 그런데 DB를 같은 단위로 맞출 수는 없다:
--   · PostgreSQL에 그래핌 분절이 없다(정규식에 \X 없음, 관련 함수 없음).
--   · 손으로 근사한 함수를 CHECK에 넣으면 **유니코드 버전에 따라 경계가 바뀌어**
--     실질적으로 IMMUTABLE이 아니게 된다(ICU 업그레이드 후 기존 행이 제약 위반).
--
-- ⚠ **그리고 어떤 배수로도 완전 정합은 불가능하다.** 1그래핌의 코드포인트 수에 상한이
--   없기 때문이다 — 'a' + 결합악센트 50개는 그래핌 1인데 코드포인트 51이다.
--   → 그래서 **클라이언트가 두 한도를 겹쳐 검사한다**(그래핌 = UX 한도, 코드포인트 = 이 값).
--     그러면 배수가 얼마든 "클라는 통과했는데 DB가 거부"가 0이 된다.
--
-- ⚠⚠ **아래 숫자는 사용자에게 보이는 한도가 아니다.** 화면 한도는 클라이언트의 그래핌
--   상수(TITLE_MAX 120 / COMMENT_MAX 1000 / NICKNAME_MAX 20)이고, 여기 값은 그 **K=10배**다.
--   K=10은 정상 이모지의 최악값(👨🏻‍❤️‍💋‍👨🏽 = 10코드포인트/그래핌)에서 나왔다 —
--   실사용에서는 이 CHECK가 먼저 걸리는 일이 없고, 걸리는 건 악용뿐이다.
--   한쪽만 바꾸면 규약이 깨진다. 짝은 아래 세 곳이다:
--     · src/features/write-post/model/post-schema.ts        (TITLE_MAX_CODEPOINT)
--     · src/features/write-comment/model/use-write-comment.ts (COMMENT_MAX_CODEPOINT)
--     · src/features/update-profile/model/use-update-nickname.ts (NICKNAME_MAX_CODEPOINT)
--
-- ⚠ **한도를 아예 없애는 선택지는 없다.** 중간 검증층이 없어 브라우저가 PostgREST를
--   직접 호출하므로 이 CHECK가 유일한 실제 방어선이다. 게다가 profiles는
--   `lower(nickname)` btree 유니크 인덱스를 갖고 있어, CHECK를 지우면 어긋남이
--   **btree 최대 키 크기(8KB 페이지 기준 2704바이트)로 자리를 옮길 뿐**이다.
--   그것도 toDbErrorMessage가 모르는 영어 에러로 나온다.
--   닉네임 200코드포인트 × 최대 4바이트 = 800바이트 < 2704 → 이 값이 인덱스도 지킨다.
--
-- 본문(post.content, 20,000)은 **일부러 그대로 둔다.** 한도가 넓어 이모지가 체감되지
-- 않는데, 가장 큰 컬럼이라 10배로 푸는 대가가 크다. 성능도 걸린다 — 20,000자 그래핌
-- 계산은 1.5ms로 코드포인트(0.1ms)의 14배라 키 입력마다 돌릴 수 없다.
-- =====================================================================

-- 제목: 화면 120그래핌 / DB 1,200코드포인트
alter table public.post
  drop constraint post_title_check,
  add  constraint post_title_check
       check (char_length(title) between 1 and 1200);

-- 댓글: 화면 1,000그래핌 / DB 10,000코드포인트
alter table public.comment
  drop constraint comment_content_check,
  add  constraint comment_content_check
       check (char_length(content) between 1 and 10000);

-- 닉네임: 화면 20그래핌 / DB 200코드포인트
-- ⚠ profiles_nickname_canonical(정규형)·profiles_nickname_lower_key(유일성)는 그대로다.
--   여기서 바뀌는 건 길이 상한 하나뿐이다.
-- ⚠ **random_nickname()의 계약은 여전히 20자다.** 20260809000001이 "조합 16자 + 접미사가
--   20자(profiles CHECK) 안에 들어와야 한다"고 적어 두었는데, 그 근거가 이 CHECK에서
--   화면 한도로 옮겨졌을 뿐 숫자는 그대로다. 이 200을 보고 생성기를 늘리지 말 것 —
--   랜덤 배정된 닉네임도 사용자가 편집 화면에서 20그래핌 한도를 넘지 않아야 한다.
alter table public.profiles
  drop constraint profiles_nickname_check,
  add  constraint profiles_nickname_check
       check (char_length(nickname) between 1 and 200);

comment on column public.post.title is
  '제목. char_length 상한 1200은 abuse bound이고, 사용자 한도는 클라이언트의 120그래핌이다(K=10)';
comment on column public.comment.content is
  '댓글 본문. char_length 상한 10000은 abuse bound이고, 사용자 한도는 클라이언트의 1000그래핌이다(K=10)';
comment on column public.profiles.nickname is
  '닉네임(정규형). char_length 상한 200은 abuse bound이고, 사용자 한도는 클라이언트의 20그래핌이다(K=10)';
