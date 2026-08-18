# 데이터 접근·Supabase 컨벤션

## 데이터 접근 경로

- **클라이언트가 supabase를 직접 호출한다.** Route Handler(`app/api/*`)를 두지 않는다.
- 단 컴포넌트가 supabase를 직접 만지지 않는다. **모든 접근은 `entities/*/api`의 TanStack Query 훅을 경유**한다. 이유는 raw fetch를 금지했던 것과 같다 — 중복 제거·캐싱·로딩/에러 상태를 잃지 않기 위해서다. 게다가 낙관적 업데이트가 queryKey를 전제로 한다.
- 브라우저 클라이언트는 `requireBrowserSupabase()`(`@/shared/api`)로 얻는다. 모든 호출부가 같은 null 가드를 반복하지 않도록 한 곳에서 한국어 에러로 바꾼다.
- 브라우저 클라이언트는 **`@supabase/ssr`의 `createBrowserClient`(쿠키 저장)** 를 쓴다. `@supabase/supabase-js`의 `createClient`(localStorage)로 바꾸면 `proxy.ts`가 쿠키를 못 읽어 **서버 가드와 토큰 리프레시가 통째로 무력화**된다.
- 서버(`generateMetadata`·서버 컴포넌트)에서는 `@/shared/api/supabase-server`를 **직접 경로로** import한다(`next/headers` 의존이라 배럴에 싣지 않는다).
- snake_case ↔ camelCase 매핑은 `entities/*/api/mappers.ts`(순수·서버 안전, `"use client"` 없음)에서.

## 스키마 타입은 손으로 적지 않는다

DB 행 타입은 **supabase CLI가 생성**한다. 마이그레이션을 추가하면 반드시 다시 뽑는다.

```bash
pnpm db:types   # supabase gen types --local --schema public > src/types/database.types.ts
```

- `src/types/database.types.ts`는 **생성 파일**이다. 손으로 고치지 않는다(ESLint 제외 목록에 있다).
- supabase 클라이언트에 `Database`를 붙여 두었다 → **테이블명·컬럼명·RPC명·RPC 인자·insert 컬럼이 전부 컴파일 타임에 검증된다.** `.rpc("toggle_post_like", { p_postid: 1 })` 같은 오타가 빌드에서 잡힌다.
- 엔티티의 도메인 타입은 행과 1:1이 아니지만(camelCase + 파생 필드), **각 필드 타입을 행에서 가져와** 스키마와 묶어 둔다:
  ```ts
  export type PostRow = Database["public"]["Tables"]["post"]["Row"];
  export interface PostListItem {
    id: PostRow["id"];
    likeCount: PostRow["like_count"];
    isLiked: boolean;          // 파생 — 행에 없다
    // ...
  }
  ```
- select 결과 형태도 마찬가지다(`mappers.ts`의 `PostSelectRow`) — `Pick<PostRow, ...>` + 임베딩만 직접 적는다.
- 마이그레이션으로 컬럼이 바뀌면 `pnpm db:types` → **매퍼·화면에서 컴파일 에러로 드러난다**. 이게 이 구조의 목적이다.

## ⚠ RLS + 컬럼 권한이 유일한 방어선

중간 검증층(Route Handler)이 없다. **정책 하나만 빠뜨려도 즉시 프로덕션 구멍**이다.

- **컬럼 권한은 선택이 아니라 필수다.** `post_update_own` 정책만 두면 작성자가 자기 글의 `like_count`를 9999로 UPDATE하는 게 통과한다. 카운터·타임스탬프는 `revoke` 후 필요한 컬럼만 `grant`한다.
- **UPDATE 정책에는 `with check`를 반드시 함께 둔다.** 없으면 `author_id`를 남의 uuid로 바꾸는 소유권 이전이 가능하다.
- **zod는 UX이지 방어가 아니다.** 길이 제한은 DB `check` 제약으로도 반드시 건다. ⚠ 단 **화면 한도와 DB 한도는 단위도 값도 다르다**(그래핌 vs 코드포인트, K=10배) — 아래 "길이 한도는 두 단위로 겹쳐 건다"를 먼저 읽는다. 어긋남을 없애는 건 **클라이언트가 두 한도를 함께 검사하는 것**이지 두 값을 같게 두는 게 아니다.
- `(select auth.uid())`로 감싼다 — 행마다 재평가되지 않고 InitPlan으로 승격되어 쿼리당 1회 평가된다(Supabase 공식 성능 권고).
- 정책을 고치면 **`bash supabase/tests/run-rls.sh`를 돌린다**(`rls.sql`을 직접 `psql`로 돌리지 말 것 — 래퍼가 결과를 양방향으로 대조해 준다). 실패를 기대하는 검사마다 savepoint를 쓴다(없으면 첫 에러가 트랜잭션을 abort시켜 뒤쪽 검사가 전부 무의미해진다).

### RLS 위반은 에러가 아니라 0행이다

UPDATE/DELETE의 `using` 절은 **필터로 동작**한다 → 권한이 없으면 에러 없이 0행이 지나간다. 훅에서 `.select()`를 붙여 영향 행 수를 확인하고 0이면 에러로 승격해야 "수정됐다"고 거짓말하지 않는다.

```ts
const { data, error } = await supabase.from("post")
  .update({ title, content }).eq("id", postId).select("id");
if (!error && data.length === 0) throw new Error("수정 권한이 없거나 삭제된 글이에요.");
```

## ⚠ CHECK 제약 안의 함수는 **호출자 EXECUTE 권한**으로 평가된다

`has_visible_char`를 만들고 다른 함수들처럼 `revoke execute from public, anon, authenticated`를
걸었더니 **모든 글쓰기가 `42501 permission denied for function has_visible_char`로 막혔다**(실측).

RPC(`security definer`, 호출자가 직접 부른다)와 성질이 다르다 — 제약 평가 함수는 **쓰기 권한이
있는 역할이 EXECUTE도 가져야 한다.** 노출이 걱정되면 함수가 입력 외의 정보를 돌려주지 않게
설계하고 열어라(`post_is_alive`·`has_visible_char` 둘 다 그렇다).

### 그래서 검증 로직을 정책이 아니라 **트리거**에 두는 경우가 있다

RLS의 `with check` 안에서 부르는 함수도 **똑같이 호출자 EXECUTE 권한으로 평가**된다. 즉
"정책에 넣고 함수는 revoke"라는 조합은 성립하지 않는다 — revoke하는 순간 그 테이블의 쓰기가 전부 42501로 죽는다.

- 선례: 답글 깊이 제한(`check_comment_depth`)은 `comment`의 insert 정책이 아니라 **before insert 트리거**다.
- 부수 효과로 **에러 메시지가 좋아진다.** 정책 위반은 Postgres의 영어 42501뿐이라 "왜 거부됐는지"를 설명하지 못하는데, 트리거는 `P0001`로 한국어 사유를 그대로 노출한다(`toDbErrorMessage`가 P0001을 통과시킨다).
- 판단 기준: **거부 사유를 사용자에게 설명해야 하면 트리거**, 단순 접근 차단이면 정책.

## 닉네임은 **랜덤 배정 후 사용자가 바꾼다**

가입 시 `random_nickname()`이 축구 테마 조합(수식어+명사, 480가지)을 배정하고, 사용자가
프로필 화면에서 바꾼다. **프로바이더 표시 이름은 읽지 않는다.**

한때 `raw_user_meta_data`의 표시 이름을 base로 썼는데 세 가지가 걸렸다:

- 사용자가 카카오/구글 프로필을 바꾸면 우리 닉네임과 어긋난다
- 표시 이름이 실명인 경우가 많아 **커뮤니티에 실명이 노출된다**
- 무엇보다 base가 **클라이언트가 정하는 값**이라 사칭 방어를 계속 짊어져야 했다
  (실제로 제로폭 문자로 `alice`를 흉내내는 구멍이 열렸다 — 아래 정규형이 그 대응이다)

⚠ 충돌 시 접미사(`-2`)를 붙이지 않고 **다시 뽑는다.** 랜덤이라 재시도가 자연스럽고
`왼발의마법사-2`보다 다른 조합이 낫다. 20회 넘게 부딪히면 그때 임의 접미사를 붙인다.

### 닉네임 정규형 — 사용자가 고칠 수 있게 되면서 필수가 됐다

`normalize_nickname()`이 보이지 않는 문자를 지우고, 빈 자리를 그리는 문자(NBSP·전각공백)를
보통 공백으로 접고, 연속 공백을 하나로 만든다. 문자 집합은 `has_visible_char`의 클래스를
**둘로 쪼갠 것**이고 합집합이 원본과 같아야 한다(한쪽만 고치지 말 것).

- `profiles_nickname_canonical` CHECK가 정규형이 아닌 값을 거부한다 →
  `lower(nickname)` 유일성이 **실제 유일성**이 된다(제로폭으로 우회 불가).
- `profiles_normalize_nickname` **트리거**가 쓰기 직전에 정규화하므로, 사용자가 공백을 붙여
  보내도 CHECK 위반(23514)이 아니라 조용히 다듬어진다.
- ⚠ **`normalize_nickname`은 닉네임 전용이 아니다.** 이름이 첫 호출자를 기록할 뿐 하는 일은
  "보이는 텍스트의 정규형"이라, **화면에서 구분되어야 하는 값**은 전부 이걸로 접는다 —
  투표 선택지가 두 번째 호출자다(`create_post_with_poll`). 접지 않으면 `unique`가
  제로폭 문자·NBSP·꼬리 공백으로 **그냥 우회되어** 똑같이 생긴 값이 여럿 저장된다.
  ⚠ 클라이언트 짝(`normalizeNickname`)도 **같은 자리에서 함께** 걸어야 한다. 한쪽만 접으면
  화면이 보여준 문구와 저장값이 갈린다.
- ⚠ CHECK 안의 함수는 **호출자 권한으로 평가**되므로 `normalize_nickname`은
  `anon`·`authenticated`에 EXECUTE가 열려 있어야 한다(`has_visible_char`와 같은 함정).

## 아바타는 **경로**로 저장한다

`profiles.avatar_path`에는 전체 URL이 아니라 `avatars` 버킷 안의 경로(`{user_id}/{uuid}.webp`)만
넣는다. 전체 URL을 저장하면 로컬(`127.0.0.1:64321`)과 원격(`*.supabase.co`)의 호스트가 달라
환경을 옮길 때마다 모든 행이 깨진다. URL 조립은 **`@/shared/config`의 `avatarUrl()`** 한 곳에서만
(entities 셋이 함께 써야 해서 `shared`에 있다).

- ⚠ `profiles_avatar_path_own` CHECK가 **자기 폴더만** 허용한다. Storage 정책이 업로드를 막아도
  **이미 존재하는 남의 파일 경로는 참조할 수 있기** 때문에 두 겹으로 막는다.
- ⚠ **`starts_with`로는 부족하다**(실측). `{내 uuid}/../{남의 uuid}/x.webp`가 통과하고, URL을
  만드는 순간 브라우저 파서가 `..`를 정규화해 **남의 파일이 뜬다.** 아바타가 상세·댓글에
  노출되므로 그대로 사칭 벡터가 된다 → 정규식으로 `{내 uuid}/{파일명}` **두 세그먼트**를 강제한다.
  (`rls.sql` 섹션 24가 경로 탈출·하위 폴더·확장자 없음을 전부 검사한다)
- **1계정 : 1프로필사진.** 교체는 `list()`로 내 폴더를 훑어 **전부 지운 뒤** 업로드한다.
  반대 순서(업로드 → DB → 옛 파일 삭제)로 두면 마지막 삭제가 실패할 때마다 고아가 쌓이고
  되돌릴 방법이 없다. ⚠ 지울 대상을 **캐시에서 받지 않는다** — 리페치가 실패하면 옛 경로에
  머물러 엉뚱한 파일을 지운다. 지운 뒤 업로드가 실패하면 `avatar_path`도 `null`로 맞춰
  "DB엔 있는데 파일이 없는" 불일치를 남기지 않는다.
- ⚠ 파일명은 업로드마다 새로 만든다(uuid). 같은 이름을 덮어쓰면 공개 URL이 그대로라
  브라우저·CDN 캐시 때문에 옛 사진이 계속 보인다.
- 버킷의 `file_size_limit`(2MiB)·`allowed_mime_types`가 **실제 방어선**이다 —
  클라이언트 리사이즈는 UX일 뿐 우회 가능하다(RLS와 같은 구조).

## 본문 이미지는 **URL을 본문에 담는다** — 경로 규약의 의도된 예외

바로 위 규칙과 반대로, 본문 이미지는 `post-images` 버킷의 **전체 공개 URL**을
마크다운(`![](…)`)으로 `post.content`에 넣는다. 갈리는 이유는 셋이다.

- **위 규칙의 주어는 컬럼이다.** `profiles.avatar_path`는 앱이 값의 형태를 온전히 소유하므로
  경로만 담고 조립을 `avatarUrl()` 한 곳으로 모을 수 있다. `post.content`는 사용자가
  **외부 이미지 주소를 직접 적을 수도 있는 자유 텍스트**라 그 전제가 성립하지 않는다.
- 경로만 담으려면 `shared/ui/markdown.tsx`가 "스킴 없는 src는 우리 버킷"이라는 **사적 규약을
  알아야 한다.** 그 파일은 `"use client"`조차 붙이지 않고 서버 렌더 여지를 남긴 범용 렌더러이고,
  "raw HTML을 절대 렌더하지 않는다"는 안전 계약이 그 범용성 위에 서 있다.
- **커스텀 스킴은 애초에 불가능하다.** react-markdown의 기본 `urlTransform`이 http/https/
  mailto/tel/상대경로 외를 빈 문자열로 잘라낸다(`usableUrl`이 존재하는 이유).

⚠ 대가로 **DB를 다른 프로젝트로 옮기면 본문 이미지가 깨진다.** 아바타에는 없는 위험이므로
  버킷을 옮길 일이 생기면 `post.content`의 URL도 함께 치환해야 한다.

⚠ **아바타에 있는 DB CHECK 대응물이 없다.** `profiles_avatar_path_own`이 경로 형태를 강제하는
  자리가 본문에는 없어 **Storage 정책이 유일한 방어선**이다. 남의 폴더에 올리는 것은 막지만
  "남의 파일 주소를 자기 본문에 적기"는 막지 못한다 — 공개 버킷이고 아바타와 달리 **작성자
  신원 표시가 아니라서** 사칭 벡터가 되지 않는다.

⚠ **고아 파일이 남을 수 있다.** 올린 뒤 본문에서 마크다운만 지우고 등록하면 그렇다. 작성을
  취소하고 나가는 경로만 그 세션 업로드분을 정리한다(`useUploadPostImage`의 `discardUploads`).
  정리가 필요해지면 "본문에서 참조되지 않는 경로 삭제" 배치를 붙인다.

⚠ URL이 길어 `excerpt`(=`left(content, 300)`) 예산을 먹으므로, 그 생성식이 **이미지 마크다운을
  먼저 지운다**(마이그레이션 20260817000002). 목록 카드 발췌가 통째로 비는 것을 막는 장치다.

## 문자 검증은 클라이언트와 DB가 **같은 문자 집합**을 써야 한다

`char_length` 길이 제한과 `~ '[^[:space:]]'` 공백 검사만으로는 부족했다:

| 값 | 클라이언트 | DB(수정 전) |
|---|---|---|
| `U+FEFF`(BOM) 한 글자 | `.trim()`이 깎아 거부 | **통과** — `[:space:]`에 없다 |
| `U+200B`(제로폭 공백) | 통과 | 통과 |
| 이모지 121개 | **거부** — `.length`가 UTF-16 코드유닛 | 통과 — `char_length`는 코드포인트 |

결과: 제목이 **완전히 비어 보이는 글**이 실제로 만들어졌고(`<title>﻿ | 온더볼</title>`),
이모지 제목은 한도의 절반에서 막혔다. 방향이 양쪽으로 다 어긋난 셈이다.

→ 단일 소스를 둔다. `src/shared/lib/text.ts`의 `hasVisibleChar`·`codePointLength`와
   `public.has_visible_char`(마이그레이션 20260802000001)가 **같은 문자 집합**을 쓴다.
   한쪽만 고치면 다시 갈린다. `<input maxLength>`는 UTF-16을 세므로 길이 제한에 쓰지 않는다.

## 길이 한도는 **두 단위로 겹쳐 건다** — 화면은 그래핌, DB는 코드포인트

코드포인트로 세면 사용자가 한 글자로 보는 이모지가 여럿으로 세어진다(실측):

| 입력 | 그래핌 | 코드포인트(=`char_length`) |
|---|---:|---:|
| ⚽ | 1 | 1 |
| 👍🏽 · 🇰🇷 · ❤️ | 1 | 2 |
| 👨‍👩‍👧‍👦 · 🏴󠁧󠁢󠁳󠁣󠁴󠁿 | 1 | 7 |
| 👨🏻‍❤️‍💋‍👨🏽 | 1 | 10 |
| `a` + 결합악센트 50개 | **1** | **51** |

그래서 **사용자에게 보이는 한도는 그래핌**(`graphemeLength`)이다. 그런데 DB를 그 단위로
맞출 수는 없다 — PostgreSQL에 그래핌 분절이 아예 없고(정규식에 `\X` 없음), 손으로 근사한
함수를 CHECK에 넣으면 **유니코드 버전에 따라 경계가 바뀌어** 실질적으로 IMMUTABLE이 아니게 된다
(ICU 업그레이드 후 기존 행이 제약 위반 → dump/restore 실패).

⚠ **어떤 배수로도 완전 정합은 불가능하다.** 1그래핌의 코드포인트 수에 상한이 없기 때문이다
(표 마지막 줄). 그래서 그래핌 한도는 DB 한도를 함의하지 못한다.

→ **클라이언트가 두 한도를 겹쳐 검사한다.** 그러면 배수가 얼마든 "클라는 통과했는데
  DB가 23514로 거부"가 0이 된다. DB 값은 K=10배로 두는데, 정상 이모지 최악값이
  10코드포인트/그래핌이라 **실사용에서는 DB 한도가 먼저 걸리는 일이 없다.**

### 한도는 한 쌍으로만 존재한다 — `TextLimit` + `lengthOverflow`

두 값을 `MAX`·`MAX_CODEPOINT`로 따로 두면 **한쪽만 검사하기가 자연스러워진다.** 이 설계의
안전 속성 전체가 "둘 다 건다"에 달려 있는데, 빠뜨려도 컴파일·린트·`rls.sql` 어느 것도 못 잡는다.
그래서 한도를 `TextLimit`(`@/shared/lib`) 하나로 묶고 판정은 **`lengthOverflow`가 단독으로**
소유한다. `parsePostId`·`safeNextPath`와 같은 이유다 — 두 곳이 같아야 하는 규약은 함수 하나가 갖는다.

- ⚠ **`graphemeLength(v) > MAX`를 직접 짜지 않는다.** 반드시 `lengthOverflow(v, LIMIT)`.
- 검사 순서가 규약이다 — 그래핌을 먼저 봐야 일반 사용자에게 한도 숫자가 담긴 문구가 간다.
  코드포인트 초과 문구("너무 길어요")는 결합 문자를 쌓지 않는 한 도달할 수 없다.

| 자리 | 화면(그래핌, 클라 전용) | DB(코드포인트, CHECK) | 상수 | 검증 함수 |
|---|---:|---:|---|---|
| 제목 | 120 | 1,200 | `TITLE_LIMIT` | `validatePost` |
| 댓글 | 1,000 | 10,000 | `COMMENT_LIMIT` | `validateComment` |
| 닉네임 | 20 | 200 | `NICKNAME_LIMIT` | `validateNickname` (정규형 기준) |
| 투표 질문 | 100 | 1,000 | `POLL_QUESTION_LIMIT` | `validatePoll` |
| 투표 선택지 | 40 | 400 | `POLL_OPTION_LIMIT` | `validatePoll` |
| 본문 | — (도입 안 함) | 20,000 | `CONTENT_MAX` (단일) | `validatePost` |

⚠ **검증은 features 슬라이스가 소유하고 뷰는 문구만 받는다.** 세 슬라이스가 같은 형태를
지켜야 한다 — 한 슬라이스만 한도 상수를 배럴로 내보내고 뷰가 분기를 직접 짜면 형태가 갈린다.

⚠ **본문은 일부러 그래핌으로 바꾸지 않았다.** 한도가 넓어 이모지가 체감되지 않는데 가장 큰
컬럼이라 abuse bound를 10배로 푸는 대가가 크고, 20,000자 그래핌 계산이 **1.5ms로
코드포인트(0.1ms)의 14배**라 키 입력마다 돌릴 수 없다(제목 120자는 0.011ms라 무해하다).

⚠ **DB 한도를 없애서 "어긋날 일을 없앤다"는 선택지는 없다.** 중간 검증층이 없어
이 CHECK가 유일한 실제 방어선인 데다, `profiles`는 `lower(nickname)` btree 유니크 인덱스를
갖고 있어 CHECK를 지우면 어긋남이 **btree 최대 키 크기(8KB 페이지 기준 2704바이트)로
자리를 옮길 뿐**이다 — 그것도 `toDbErrorMessage`가 모르는 영어 에러로.
닉네임 200코드포인트 × 최대 4바이트 = 800바이트 < 2704라 이 한도가 인덱스도 함께 지킨다.

⚠ 화면 한도를 클라이언트만 강제하게 됐으므로 **렌더도 방어해야 한다** — 우회 삽입된 긴 제목이
목록 카드를 늘리지 않게 `PostCard`의 제목을 `line-clamp-2`로 자른다. `generateMetadata`는
이미 `clamp`가 막고 있다.

⚠ `random_nickname()`의 계약은 여전히 **20자**다(컬럼 상한 200이 아니다). 랜덤 배정된 닉네임도
사용자가 화면 한도 안에서 편집할 수 있어야 한다 — `rls.sql` 섹션 23의 검사를 200으로 올리지 말 것.

검증은 `rls.sql` 섹션 25(경계 ±1 + 가족 이모지 120개 제목 + btree 통과)가 맡는다.

## SECURITY DEFINER RPC

쓰기가 RLS를 넘어야 할 때만 RPC로 내린다. `security definer` 함수의 **전량은 아래 표가 전부**다 — 새로 만들면 여기에 추가한다.

> 검증: `select proname, prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'`
> — 표와 실제가 갈리면 **보안 표면 목록이 거짓이 된 것**이다.

| 종류 | 함수 | 비고 |
|---|---|---|
| RPC(클라이언트가 직접 호출) | `toggle_post_like` · `soft_delete_post` · `increment_post_view` · `create_post_with_poll` | `increment_post_view`만 anon에 열려 있다(아래 예외 항목) |
| 트리거 | `sync_post_like_count` · `sync_post_comment_count` · `check_comment_depth` | `post_like`·`comment` |
| 트리거 | **`handle_new_user`** (`on_auth_user_created`, `after insert on auth.users`) | 가입 시 `profiles` 행 생성. **호출자 권한으로 돌면 `profiles` insert 권한이 없어 가입 자체가 실패한다** |
| 정책 헬퍼 | `post_is_alive` (`stable`) | `comment`·`poll_vote`의 정책과 `poll_results`가 공유 — 인라인 서브쿼리를 쓰지 않는 이유는 아래 참고 |
| **집계 읽기** | `poll_results` (`stable`) | 이 목록에서 유일하게 **쓰기가 아닌** definer다. 개별 표는 RLS로 "내 행만"인데 집계는 그 경계를 넘어야 한다 — 그리고 **투표한 사람에게만** 돌려준다(결과 게이팅을 UI가 아니라 여기서 건다). ⚠ definer라 정책이 닿지 않으므로 **`post_is_alive`를 함수 안에서 직접 확인**한다 |

⚠ **RLS를 우회하는 definer는 "그 함수가 유일한 경로"일 때 가장 강하다.**
`create_post_with_poll`이 그 예다. 처음엔 원자성만 노리고 invoker로 두고 `poll`·`poll_option`에
"작성자면 insert 가능" 정책을 열었는데, **정책에 시점 개념이 없어** 작성자가 이미 표가 던져진
투표에 선택지를 끼워 넣을 수 있었다(실측). 두 테이블의 정책과 grant를 걷어내고 함수를 definer로
올리자, "생성 시 고정"과 "선택지 2~4개"를 **함수 하나가 단독으로 소유**하게 됐다 —
정책으로 표현할 수 없는 규약은 유일 경로로 만들어야 지켜진다.

⚠ **아래 셋은 definer로 오해하기 쉽지만 아니다.**
권한 없이도 도는 함수를 "RLS를 우회하는 함수"로 세어두면 보안 검토가 헛돈다.

| 함수 | 왜 definer가 아닌가 |
|---|---|
| `touch_updated_at` | 트리거지만 자기 행의 `updated_at`만 채운다 → 권한 상승이 필요 없다 |
| `normalize_profile_nickname` | 쓰기 직전 `new.nickname`을 다듬을 뿐이라 호출자 권한으로 충분하다 |
| `random_nickname` | 인자도 테이블 접근도 없는 순수 조합 생성기 |

⚠ **CHECK 제약 평가 함수(`has_visible_char`·`normalize_nickname`)는 이 목록의 대상이 아니다.**
성질이 반대다 — definer로 만들 게 아니라 오히려
**그 테이블에 쓰는 역할에 EXECUTE를 열어야** 한다(바로 아래 항목).

- **유저 id를 인자로 받지 않는다.** `security definer`는 RLS를 우회하므로 유저를 클라이언트가 넘기면 남의 명의로 조작할 수 있다. 함수 안에서 `auth.uid()`로 확정한다 — PostgREST가 access token을 검증해 `request.jwt.claims`에 심어둔 값이라 위조가 불가능하다. `security definer`가 바꾸는 것은 "무엇을 할 수 있는가"(권한)이지 "누가 호출했는가"(세션 컨텍스트)가 아니다.
- **`set search_path = ''` + `public.` 접두사.** 호출자가 search_path를 조작해 다른 스키마의 동명 테이블을 붙잡게 만드는 권한 상승을 막는다.
- **`revoke execute from public, anon`.** 함수는 기본적으로 PUBLIC에 EXECUTE가 부여된다 — 그대로 두면 비로그인도 호출한다.
  - ⚠ **anon에 EXECUTE가 열린 함수는 전부 4개**이고, 그게 `rls.sql` 섹션 17d의 화이트리스트다.
    definer는 그중 둘뿐이니 "definer 2개"로만 세면 안 된다.

    | 함수 | definer? | 왜 열려 있나 |
    |---|:---:|---|
    | `increment_post_view` | ✅ | **유일한 비로그인 쓰기 경로**(아래) |
    | `post_is_alive` | ✅ | 비로그인 select 정책이 부르는 **정책 평가 함수** — 읽기 판정만 한다 |
    | `has_visible_char` | — | **CHECK 제약 평가** — 닫으면 그 테이블의 쓰기가 전부 42501로 죽는다 |
    | `normalize_nickname` | — | 〃 (CHECK + before-write 트리거) |

  - ⚠ **쓰기 예외는 `increment_post_view` 하나뿐이다.** "anon은 어디에도 쓸 수 없다"는 전제가 여기서만 깨진다. 조회는 비로그인이 대부분이라 authenticated 전용으로 두면 숫자가 의미를 잃기 때문이다.
  - 대가로 **`view_count`는 curl 루프로 부풀릴 수 있는 대략치**다 — 트리거가 단독 관리하는 `like_count`·`comment_count`와 **신뢰 수준이 다르다.** 이 차이는 컬럼 주석에도 적혀 있다. 정확도가 필요해지면 `(post_id, viewer_hash, viewed_on)` 로그 테이블이 필요하다.
- **에러 코드 규약**: 우리가 의도적으로 띄우는 한국어 메시지는 **`P0001`** 로 던진다(`toDbErrorMessage`가 그대로 노출한다). `42501`은 Postgres 자신의 영어 권한 거부용으로 남겨둔다.

### 투표에는 왜 쓰기 RPC도, 카운터 트리거도 없는가

좋아요와 나란히 두면 판단 기준이 보인다.

- **좋아요가 RPC인 이유는 카운터 때문이다** — "존재 확인 → 분기 → insert/delete"가 한 원자 단위여야 했다. 투표는 집계 컬럼이 없어(아래) 지킬 불변조건이 행 하나뿐이고, 그 행은 `(post_id, user_id)` 기본키가 이미 하나로 묶는다. 같은 유저의 동시 요청은 "마지막에 고른 것이 남는다"로 끝나는데 그건 이 기능의 정의 그대로다.
- **득표수 컬럼을 두지 않는다.** `like_count`가 탈퇴 cascade 경로에서 어긋나 영구히 과대로 남았던 사고의 클래스를 통째로 없앤다 — 어긋날 값 자체가 없다. 선택지가 4개 이하라 `count(*) group by`가 사실상 공짜이고, 어차피 결과 게이팅 때문에 함수를 거쳐야 한다.

⚠ **PostgREST의 upsert(`Prefer: resolution=merge-duplicates`)를 쓰지 않는다.**
`ON CONFLICT DO UPDATE SET`에 **payload의 모든 컬럼**을 실어서 `post_id`·`user_id`에도 UPDATE
권한을 요구한다(실측 42501). 그 권한을 열면 자기 표의 `post_id`를 살아 있는 다른 글로 옮겨
**DELETE 정책을 두지 않은 "취소 불가"를 우회**할 수 있다 → 클라이언트가 "내 표가 있는가"로
갈라 insert 또는 `option_id`만 바꾸는 UPDATE를 보낸다. 컬럼 grant는 `option_id` 하나뿐이다.

### 왜 좋아요는 RPC이고 댓글 수는 트리거인가

- **좋아요**: "존재 확인 → 분기 → insert/delete → 카운터 증감"이 한 원자 단위여야 한다. `SELECT → +1 → UPDATE`는 두 요청이 동시에 0을 읽어 결과가 2가 아니라 1이 되고(lost update), supabase-js에는 행 잠금 옵션이 없다 → `FOR UPDATE`를 DB 함수로 내린다.
- **댓글 수**: 분기가 없다(항상 insert). `comment_count = comment_count + 1`은 그 자체로 원자적이라 잠금이 필요 없고, 어떤 경로로 들어와도 어긋나지 않는다 → 트리거.
- ⚠ 트리거 함수도 **`security definer`가 필수**다. 호출자 권한으로 돌면 `post_update_own`("본인 글만")에 걸려 남의 글에 댓글을 달 때 UPDATE가 0행으로 조용히 실패한다.

## 비정규화 카운터는 트리거가 단독으로 관리한다

`like_count`·`comment_count`처럼 실제 행 수를 베낀 컬럼은 **관리 주체를 하나로 못박는다.**

- 처음에 `like_count`를 `toggle_post_like` RPC가 증감했더니, 유저 탈퇴로
  `auth.users → profiles → post_like`가 cascade 삭제되는 경로가 RPC를 거치지 않아
  **카운터가 실제보다 큰 채 영구히 남았다**(`check >= 0` 때문에 항상 과대, 자가 교정 불가).
- 지금은 `post_like`·`comment` 양쪽 다 `after insert or delete` 트리거가 단독 관리한다.
  RPC는 잠금·검증·토글만 하고 카운터는 건드리지 않는다.
- 새 카운터를 만들면 **"어느 경로로 행이 생기고 사라지든 맞는가"** 를 먼저 따진다.
  cascade·직접 SQL·관리 도구까지 포함해서.

## ⚠ 부모의 소프트 삭제는 자식 정책까지 함께 묶어야 한다

`post`에 `deleted_at`을 넣고 `post_select_alive`로 글을 감췄지만 `comment` 정책에는
post와의 연결이 없었다. 그래서 **삭제된 글의 댓글이 비로그인에게 그대로 공개**됐고
(id가 연번이라 삭제된 글의 id는 목록의 구멍으로 추정된다), **삭제된 글에 댓글을 더 달 수도** 있었다.

자식 테이블의 select·insert 정책에 부모 생존을 `exists`로 건다:

```sql
create policy "comment_select_alive_post" on public.comment
  for select using (
    exists (select 1 from public.post p
             where p.id = comment.post_id and p.deleted_at is null)
  );
```

같은 리소스에 대해 **좋아요와 댓글의 삭제 판정이 달라지면 안 된다** — RPC 쪽만 막고
정책 쪽을 잊는 게 전형적인 실수다.

## ⚠ `on delete cascade`는 RLS를 적용받지 않는다

cascade 삭제는 RI(참조 무결성) **내부 트리거**가 수행하므로 정책이 개입하지 않는다.
`comment.parent_id`가 `on delete cascade`라서 실제로 이런 일이 생긴다:

> 루트 댓글 작성자가 자기 댓글을 지우면 **남이 단 답글까지 함께 사라진다.**
> `comment_delete_own`("본인 것만")의 간접 우회로다.

포럼 관례라 **수용한 트레이드오프**이지만, 그렇다면 **화면의 삭제 확인 문구가 이 사실을 고지해야 한다** —
정책이 못 막는 것을 UI 계약으로 갚는 셈이다. `comment_count`는 자식 행마다 `after delete` 트리거가
발화해 정확히 감소한다(확인함).

새 FK에 cascade를 걸 때는 **"이 삭제가 누구의 행까지 지우는가"** 를 정책과 따로 따진다.

## 트리거는 필요한 변경에만 발화시킨다

`touch_updated_at`을 `before update on post`에 조건 없이 걸었더니, 카운터를 올리는
UPDATE(좋아요·댓글)에도 발화해 **남이 좋아요만 눌러도 내 글에 "수정됨"이 붙었다.**
`created_at <> updated_at = 수정됨`이라는 계약을 스스로 깬 셈이다.

```sql
create trigger post_touch_updated_at
  before update on public.post for each row
  when (old.title is distinct from new.title or old.content is distinct from new.content)
  execute function public.touch_updated_at();
```

## 소프트 삭제 (post)

`post`는 `deleted_at`을 찍는 소프트 삭제뿐이다(DELETE 정책 없음). `comment`는 hard delete다.

⚠ **클라이언트가 `deleted_at`을 직접 UPDATE할 수 없다.** Postgres는 UPDATE의 **새 행**에도 SELECT 정책을 적용하므로, `deleted_at`을 채운 행이 `post_select_alive`("deleted_at is null")를 통과하지 못해 거부된다(실측 확인). → `soft_delete_post` RPC가 담당한다.

정책을 `deleted_at is null or author_id = auth.uid()`로 푸는 선택지도 있었지만, 그러면 `deleted_at` 필터가 모든 조회 쿼리로 흩어져 한 곳만 빠뜨려도 삭제된 글이 샌다. **정책은 엄격하게 두고 쓰기만 RPC로 내린다.** 덕분에 조회 훅에 `.is("deleted_at", null)`을 붙일 필요가 없다.

## PostgREST 임베딩

- **임베딩 경로가 둘 이상이면 FK 컬럼명으로 지정한다.** `post → profiles`는 `author_id` 직접 FK와 `post_like` 경유 many-to-many 둘이라 그냥 `profiles(nickname)`이라 쓰면 `PGRST201`로 실패한다 → `author:author_id(nickname)`.
- `post_like(user_id)` 임베딩은 SELECT 정책이 "내 행만"이라 **결과 배열의 길이가 곧 `isLiked`** 다. 별도 필터를 잊어 남의 좋아요가 새는 사고가 구조적으로 불가능하다. 비로그인은 정책이 `to authenticated`라 빈 배열 → `false`.
- select 컬럼 문자열은 `entities/*/api/mappers.ts`에 상수로 둔다(`POST_LIST_SELECT` 등) — 스키마가 바뀌면 한 곳만 고친다.
- 0행이 정상인 조회는 `single()`이 아니라 **`maybeSingle()`** 을 쓴다(`single()`은 `PGRST116` 에러를 던져 "없음"과 진짜 에러가 섞인다).

## 마이그레이션

- 파일명은 **`YYYYMMDDHHMMSS_snake_name.sql`**.
- 원격에 적용된 마이그레이션은 **수정하지 않고 새 파일로 추가**한다. 아직 로컬에만 있는 것은 `supabase db reset`으로 재적용되므로 그 자리에서 고치는 게 맞다(깨진 마이그레이션과 수정 마이그레이션을 함께 남길 이유가 없다).
- `config.toml`의 `[auth]` 변경은 `db reset`이 아니라 **`supabase stop && supabase start`** 가 필요하다(gotrue 컨테이너 설정).
- 로컬 스택은 643xx 포트. API 64321 / DB 64322 / Studio 64323 / **Mailpit 64324**.
- ⚠ **CLI가 원격 프로젝트에 링크돼 있다**(`supabase/.temp/project-ref`) 그리고 `.env.local`에
  원격 DB 비밀번호·액세스 토큰이 있어 **확인 프롬프트 없이 통과할 수 있다.** 원격을 바꾸는 명령은 셋:
  `supabase db push`(플래그 없음) · `db reset --linked`(원격 초기화) ·
  **`config push`**(`config.toml`의 `[auth]`를 통째로 덮는다 — Site URL이 localhost가 되고
  테스트용으로 켜 둔 `[auth.email] enable_signup`까지 함께 올라간다. `docs/oauth-setup.md` §4).
  로컬 작업에는 반드시 `db reset`(로컬)만 쓴다. `pnpm db:types`는 `--local` 고정이라 안전하다.

### RLS 정책에 서브쿼리를 인라인으로 쓰지 않는다

정책 안의 `exists (select 1 from other t where t.id = this.fk)`는 **상관관계를 잃는다.**
RLS 술어가 security-barrier 서브쿼리 안으로 들어가 바깥의 `fk = N` 등가류가 전파되지 않고
`fk IN (조건을 만족하는 전체)`로 비상관화된다 — 1건이 필요한데 전체를 훑는다.

실측(글 5만·댓글 300): 인라인 `exists` **4.76ms** vs `stable security definer` 헬퍼 **0.61ms**.
버퍼는 헬퍼가 더 쓰지만(912 vs 633) 해시 구축 CPU가 지배적이다. 결정적인 건 **비용의 성격**이다 —
헬퍼는 자식 행 수(조회 limit)에 묶여 상한이 있고, 인라인은 부모 테이블 크기에 비례해 무한정 늘어난다.

→ 선례: `public.post_is_alive(bigint)` (`comment`의 select·insert 정책이 공유).

## 검증 자산

| 파일 | 용도 |
|---|---|
| `supabase/tests/rls.sql` | RLS·컬럼 권한·RPC 전량 검사 (전체 rollback이라 DB에 흔적 없음). ⚠ 여기에 **마지막 섹션 번호를 적지 않는다** — 섹션을 더하는 순간 거짓이 된다 |
| — 섹션 25는 **길이 한도**를 검사 | 제목·댓글·닉네임의 새 CHECK 경계 ±1, 가족 이모지 120개 제목(코드포인트 840)이 통과하는지, 닉네임 200자가 `lower(nickname)` btree 인덱스에도 들어가는지, 그리고 **본문은 20,000 그대로**인지. ⚠ 여기 숫자는 abuse bound다 — 화면 한도(그래핌)는 클라이언트만 강제하므로 이 검사로 증명되지 않는다 |
| — 섹션 27은 **투표**를 검사 | 남의 글에 투표 붙이기·질문/선택지 수정·투표 취소·표를 다른 글로 옮기기(취소 우회)·남의 명의 투표·한 사람 두 표·다른 글의 선택지로 투표(복합 FK)·삭제된 글에 투표가 전부 막히는지, **미투표자에게 `poll_results`가 0행**인지, 갈아타면 집계가 따라 움직이는지, 그리고 **27b** `create_post_with_poll`이 실패할 때 글도 남기지 않는지, **작성자·카운터·시각을 실을 자리가 없는지**(definer라 컬럼 권한을 우회하므로 삽입 컬럼 목록이 넓어지는 회귀를 여기서 잡는다), 선택지가 정규형으로 접혀 저장되는지 |
| — 섹션 26은 **excerpt**를 검사 | 사진으로 시작하는 글도 발췌에 본문이 남고 URL은 빠지는지(20260817000002) |
| — 섹션 24는 **프로필 편집**을 검사 | 본인만 수정·남의 닉네임 0행·아바타 경로가 자기 폴더인지·`created_at` 위조 차단·랜덤 닉네임 배정, 그리고 **24b 스토리지 정책**(남의 폴더에 업로드 불가)과 **24c 본문 이미지 버킷**(남의 폴더·비로그인 업로드 불가 — 여기엔 CHECK 대응물이 없어 이 정책이 유일한 방어선이다). ⚠ 24c는 **버킷 설정값도** 검사한다(`public`·`file_size_limit`·`allowed_mime_types`) — 크기·타입의 실제 방어선이 거기라, 정책만 보면 이 값이 조용히 넓어져도 아무도 모른다 |
| — 섹션 23은 **닉네임 정규형**을 검사 | 제로폭·NBSP·soft hyphen을 끼운 닉네임이 정규형으로 접혀 기존 닉네임과 충돌하는지(사칭 차단) |
| — 섹션 22는 **답글**을 검사 | 깊이 1 초과 거부·타 게시글 부모 거부·없는 부모 거부(전부 P0001), cascade가 남의 답글까지 지우는 동작, `comment_count`가 답글 포함 총합인지, 글이 소프트 삭제되면 답글도 함께 감춰지는지 |
| — 섹션 17은 **테이블명을 하드코딩하지 않는다** | public 스키마 기본 권한이 anon/authenticated에 ALL이라, 새 마이그레이션이 `revoke`를 한 번만 잊어도 즉시 구멍이 된다. 고정 목록만 검사하면 **새 테이블은 검사 대상에 들어오지도 않는다** → RLS 미적용·anon 쓰기 권한·search_path 미고정·anon EXECUTE를 전수로 훑는다 |
| — 섹션 18은 **INSERT 시점 위조**를 검사 | 섹션 1이 UPDATE만 보고 있어서, `grant insert` 목록이 넓어지는 회귀(카운터·타임스탬프 동봉)를 못 잡았다 |
| — 시드 INSERT는 반드시 `begin;` **아래**에 | 위에 두면 오토커밋으로 새어나가 실행할 때마다 행이 쌓인다(실제로 그랬다) |
| — 시각 비교 검사는 시드를 과거로 밀 것 | `now()`는 **트랜잭션 시작 시각**이라 한 트랜잭션 안에서 insert의 default와 트리거의 값이 같아진다 → "수정하면 updated_at이 바뀐다"를 증명할 수 없다 |
| `supabase/tests/concurrency.sh` | 좋아요 동시성 — N명 동시 클릭 후 `like_count == count(post_like)` |
| **`supabase/seed.sql`** | `db reset`이 **자동 실행**한다 — 계정(alice/bob)·글·댓글·좋아요. ⚠ 시드가 없으면 마이그레이션을 고칠 때마다 reset이 개발 데이터를 통째로 날린다. 닉네임을 명시적으로 고정하는 이유는 랜덤 배정이면 섹션 13의 유일성 검사가 부딪힐 상대를 잃어 **조용히 무의미해지기** 때문이다 |
| **`supabase/tests/run-rls.sh`** | rls.sql을 돌리고 **양방향으로** 대조한다 — ① 기대하지 않은 ERROR ② **차단 기대인데 통과한 것**. ②를 안 보면 로그가 깨끗한 채로 검사가 죽어 있다(실제로 2건이 그랬다) |
