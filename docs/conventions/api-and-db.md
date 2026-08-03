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
- **zod는 UX이지 방어가 아니다.** 길이 제한은 DB `check` 제약으로도 반드시 건다(두 값이 어긋나면 클라는 통과하고 서버가 거부한다).
- `(select auth.uid())`로 감싼다 — 행마다 재평가되지 않고 InitPlan으로 승격되어 쿼리당 1회 평가된다(Supabase 공식 성능 권고).
- 정책을 고치면 **`supabase/tests/rls.sql`을 다시 돌린다**. 실패를 기대하는 검사마다 savepoint를 쓴다(없으면 첫 에러가 트랜잭션을 abort시켜 뒤쪽 검사가 전부 무의미해진다).

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

## 문자 검증은 클라이언트와 DB가 **같은 문자 집합**을 써야 한다

`char_length` 길이 제한과 `~ '[^[:space:]]'` 공백 검사만으로는 부족했다:

| 값 | 클라이언트 | DB(수정 전) |
|---|---|---|
| `U+FEFF`(BOM) 한 글자 | `.trim()`이 깎아 거부 | **통과** — `[:space:]`에 없다 |
| `U+200B`(제로폭 공백) | 통과 | 통과 |
| 이모지 121개 | **거부** — `.length`가 UTF-16 코드유닛 | 통과 — `char_length`는 코드포인트 |

결과: 제목이 **완전히 비어 보이는 글**이 실제로 만들어졌고(`<title>﻿ · 온더볼</title>`),
이모지 제목은 한도의 절반에서 막혔다. 방향이 양쪽으로 다 어긋난 셈이다.

→ 단일 소스를 둔다. `src/shared/lib/text.ts`의 `hasVisibleChar`·`codePointLength`와
   `public.has_visible_char`(마이그레이션 20260802000001)가 **같은 문자 집합**을 쓴다.
   한쪽만 고치면 다시 갈린다. `<input maxLength>`는 UTF-16을 세므로 길이 제한에 쓰지 않는다.

## SECURITY DEFINER RPC

쓰기가 RLS를 넘어야 할 때만 RPC로 내린다. 현재 `toggle_post_like`·`soft_delete_post` + 트리거 3종.

- **유저 id를 인자로 받지 않는다.** `security definer`는 RLS를 우회하므로 유저를 클라이언트가 넘기면 남의 명의로 조작할 수 있다. 함수 안에서 `auth.uid()`로 확정한다 — PostgREST가 access token을 검증해 `request.jwt.claims`에 심어둔 값이라 위조가 불가능하다. `security definer`가 바꾸는 것은 "무엇을 할 수 있는가"(권한)이지 "누가 호출했는가"(세션 컨텍스트)가 아니다.
- **`set search_path = ''` + `public.` 접두사.** 호출자가 search_path를 조작해 다른 스키마의 동명 테이블을 붙잡게 만드는 권한 상승을 막는다.
- **`revoke execute from public, anon`.** 함수는 기본적으로 PUBLIC에 EXECUTE가 부여된다 — 그대로 두면 비로그인도 호출한다.
- **에러 코드 규약**: 우리가 의도적으로 띄우는 한국어 메시지는 **`P0001`** 로 던진다(`toDbErrorMessage`가 그대로 노출한다). `42501`은 Postgres 자신의 영어 권한 거부용으로 남겨둔다.

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
  원격 DB 비밀번호·액세스 토큰이 있어 **확인 프롬프트 없이 통과할 수 있다.**
  `supabase db push`(플래그 없음)는 **원격**에 적용하고 `db reset --linked`는 원격을 초기화한다.
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
| `supabase/tests/rls.sql` | RLS·컬럼 권한·RPC 전량 검사 (전체 rollback이라 DB에 흔적 없음) |
| — 섹션 17은 **테이블명을 하드코딩하지 않는다** | public 스키마 기본 권한이 anon/authenticated에 ALL이라, 새 마이그레이션이 `revoke`를 한 번만 잊어도 즉시 구멍이 된다. 고정 목록만 검사하면 **새 테이블은 검사 대상에 들어오지도 않는다** → RLS 미적용·anon 쓰기 권한·search_path 미고정·anon EXECUTE를 전수로 훑는다 |
| — 섹션 18은 **INSERT 시점 위조**를 검사 | 섹션 1이 UPDATE만 보고 있어서, `grant insert` 목록이 넓어지는 회귀(카운터·타임스탬프 동봉)를 못 잡았다 |
| — 시드 INSERT는 반드시 `begin;` **아래**에 | 위에 두면 오토커밋으로 새어나가 실행할 때마다 행이 쌓인다(실제로 그랬다) |
| — 시각 비교 검사는 시드를 과거로 밀 것 | `now()`는 **트랜잭션 시작 시각**이라 한 트랜잭션 안에서 insert의 default와 트리거의 값이 같아진다 → "수정하면 updated_at이 바뀐다"를 증명할 수 없다 |
| `supabase/tests/concurrency.sh` | 좋아요 동시성 — N명 동시 클릭 후 `like_count == count(post_like)` |
| `supabase/tests/seed-users.sh` | `db reset` 후 테스트 계정(alice/bob) 재생성 |
