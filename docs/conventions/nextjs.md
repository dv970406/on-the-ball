# Next.js 16 컨벤션

이 버전은 학습 데이터와 API·구조가 다를 수 있다. **코드 작성 전 `node_modules/next/dist/docs/`의 관련 가이드를 먼저 읽는다.** deprecation 주의.

## 라우팅

- 페이지(`app/**/page.tsx`)는 **view만 마운트하는 얇은 서버 컴포넌트**로 둔다. 실제 UI는 `src/views`에.
- `params`는 **Promise**다. 타입은 **`PageProps<'/posts/[id]'>` 전역 헬퍼**를 쓴다 — import가 필요 없고 `next dev`/`next build`/`next typegen`이 생성한다.
  ```tsx
  export default async function Page(props: PageProps<"/posts/[id]">) {
    const { id } = await props.params;
    return <SomeView id={id} />;
  }
  ```
  ⚠ 새 동적 라우트를 만든 직후에는 `npx next typegen`을 돌려야 타입이 생긴다.
- URL의 `[id]`는 **문자열**이다. **`@/shared/lib`의 `parsePostId`로만 판정**하고, 실패하면 조회 없이 `notFound()`.
  ⚠ `Number()`로 직접 검증하지 말 것 — `1e3`·`0x10`·`1.0`을 받아들여 proxy와 판정이 갈렸고 가드가 뚫렸다(아래 proxy 절).
- ⚠ **`useSearchParams`는 프리렌더를 CSR로 떨어뜨린다.** `<Suspense>`로 감싸는 게 정석이지만, **경계가 children까지 감싸면 페이지 본문 전체가 빈 껍데기가 된다** — 인증 화면 3개가 실제로 그렇게 됐다(서버 HTML에 `BAILOUT_TO_CLIENT_SIDE_RENDERING`만 남았다).
  effect 안에서만 쿼리 값이 필요하다면 **`useSearchParams`를 쓰지 말고** `@/shared/lib`의 `useNextParam`처럼 `useSyncExternalStore`로 읽는다. 그러면 경계 자체가 필요 없다.
- 로그인 후 복귀 경로(`?next=`)는 **`safeNextPath`로만 검증한다**(`@/shared/config`). 직접 문자열 검사를 짜지 말 것 — 아래 오픈 리다이렉트 항목 참고.

## 에러 안전망 (파일 컨벤션)

쿼리 에러는 화면이 `EmptyState`로 처리하지만, 그 **바깥의 렌더 오류**는 파일 컨벤션이 받는다.

- `app/error.tsx` — 모든 화면의 렌더 오류. 활성화되면 화면 셸까지 대체되므로 **재시도 + "홈으로" 탈출 경로**를 함께 둔다.
- `app/global-error.tsx` — 루트 layout이 깨졌을 때의 최후 안전망. `html`·`body`와 전역 스타일을 직접 갖추고, 공용 UI 컴포넌트에 기대지 않는다.
- `app/not-found.tsx` — 없는 경로·`notFound()`.
- 재시도 prop은 Next 16 기준 **`unstable_retry`** 다(`reset`은 재조회 없이 상태만 초기화하는 특수 케이스용).

## 서버 조회 (generateMetadata·404 판정)

화면 본문은 전부 클라이언트 쿼리로 그린다. 서버에서 조회하는 곳은 **글 관련 두 페이지**뿐이고, 목적이 서로 다르다.

| 페이지 | 조회하는 이유 | `cache()` |
|---|---|---|
| `app/posts/[id]/page.tsx` | 공유 링크의 `<title>`·`og:*` + 404 판정 | **필수** — `generateMetadata`와 `Page`가 같은 데이터를 쓴다 |
| `app/posts/[id]/edit/page.tsx` | 404 판정만 (`metadata`는 정적) | 불필요 — 소비자가 `Page` 하나라 요청당 1회다 |

**둘 다 아래 규약을 똑같이 지켜야 한다.** 서버 조회를 새로 붙일 때도 마찬가지다.

- `generateMetadata`와 `Page`가 같은 데이터를 쓰면 **React `cache()`로 감싸 요청당 1회**만 돌게 한다. 소비자가 하나뿐이면 감싸지 않아도 되지만, **`generateMetadata`를 나중에 동적으로 바꾸는 순간 조회가 2번이 된다** — 그때 함께 감싼다.
- **`notFound()`는 `Page`(세그먼트 렌더)에서만 효과가 있다.** `generateMetadata`에서 부르면 메타데이터 생성만 중단되고 응답은 200으로 나간다(실측 확인).
- 조회 실패와 "없음"을 구분한다 — 일시 장애로 멀쩡한 글을 404로 단정하면 안 된다.

### ⚠ 요청 API를 try/catch로 감쌀 땐 `unstable_rethrow`

`cookies()`(= `createSupabaseServerClient`)는 "이 라우트를 동적 렌더로 전환하라"는 **Next 내부 에러를 throw**해서 동작한다. `try/catch`가 이걸 삼키면 **페이지가 스켈레톤 상태로 정적 프리렌더되어 버린다**(빌드는 성공하므로 조용히 망가진다).

```ts
} catch (e) {
  unstable_rethrow(e); // next/navigation — 프레임워크 제어용 에러는 되던진다
  console.error(...);
  return { state: "unknown" };
}
```

`notFound()`·`redirect()`도 같은 방식이라 동일한 가드가 필요하다.
**빌드 로그의 `○`(정적) / `ƒ`(동적) 표기로 확인한다** — 동적이어야 할 라우트가 `○`면 가드가 삼킨 것이다.

### 서버 프리페치를 나중에 붙인다면

클라이언트 쿼리만으로 그리는 화면은 초기 HTML이 항상 스켈레톤이다. 첫 화면이 중요해지면 페이지에서 데이터를 미리 조립해 view에 `initialData`로 넘긴다.

- 프리페치는 **최적화일 뿐**이다. 실패하면 `undefined`를 넘겨 클라이언트 조회 경로로 폴백해야 한다.
- ⚠ 붙이는 순간 `formatRelativeTime`의 하이드레이션 문제가 살아난다 → `data-and-state.md` 참고.

## 라우트 그룹

- `app/(auth)/` — 비로그인 전용 화면. layout이 `<GuestOnly>`로 감싼다.
  **소셜 로그인은 로그인과 가입이 같은 동작**이라 가입 화면이 따로 없다.

### 소셜 로그인 콜백 — 전용 라우트를 만들지 않는다

프로바이더에서 돌아오는 주소는 **`/sign-in?code=…` 자기 자신**이다. `createBrowserClient`의
`detectSessionInUrl`이 코드를 교환하고, 세션이 생기면 `GuestOnly`가 목적지를 정한다.

→ 전용 `/auth/callback`을 만들면 **목적지 계산이 두 곳으로 갈린다.** "로그인 후 이동은 가드가
  단독으로 소유한다"(`data-and-state.md`)를 지키려면 복귀 지점을 `/sign-in`으로 두는 편이 맞다.
  `?next=`도 `redirectTo`에 실어 보내 같은 경로로 되돌아온다.

- ⚠ **proxy의 `GUEST_ONLY`에 `/sign-in` 예외를 파지 않는다.** 복귀 시점에는 아직 쿠키가 없어
  (교환이 브라우저에서 일어난다) 비로그인으로 통과한다. 예외를 파면 로그인한 채로 `/sign-in`을
  열 수 있게 되어 가드가 헐거워진다.
- ⚠ 복귀 화면은 **세 가지를 모두** 처리해야 한다 — `?code=` 동안의 대기 표시, 교환이 끝나지
  않을 때의 **상한**(supabase는 교환에 실패해도 조용히 빠져나간다), 프로바이더가 돌려준
  `?error=`·`error_description=`(사용자가 동의를 취소한 경우가 여기로 온다).
- ⚠ **복귀 지점은 `/sign-in` 하나가 아니다.** 계정 연결(`linkIdentity`)이 `/profile`로 돌아오므로
  그 화면도 같은 규약을 진다 — 실제로 빠뜨려서 **동의를 취소하면 화면이 아무 말도 하지 않았다.**
  `redirectTo`를 새로 지정하는 곳이 생기면 그 화면을 복귀 화면으로 취급한다.
  판정은 **서버에서** 하고 props로 내린다(클라 effect로 URL을 읽으면 React #418이 난다).
  단 상한은 화면 성격에 따라 다르다 — `/profile`은 교환이 실패해도 화면 자체가 정상 동작하므로
  배너만 걷어내면 되고, `/sign-in`처럼 화면 전체가 대기 상태가 되는 곳에만 타임아웃이 필요하다.
- 설정·트러블슈팅은 [`docs/oauth-setup.md`](../oauth-setup.md).

## 메타데이터

- 접미사는 루트 layout의 **`title.template`** 이 단일 소스다(`"%s | 온더볼"`). 각 page는 자기 제목만 적는다. 유일한 예외가 `global-error.tsx`인데, 루트 layout이 대체된 상태라 템플릿이 닿지 않아 접미사를 직접 적는다 — 구분자를 바꾸면 **여기도 함께** 고친다.
- ⚠ **`title`만 채우면 링크 프리뷰는 달라지지 않는다.** 카카오톡·슬랙 등은 `og:title`/`og:description`을 먼저 읽으므로, 상세에 og를 안 넣었더니 **모든 글의 공유 프리뷰가 루트 설명 하나로 똑같았다**(공유 버튼이 있는 화면이라 실사용 경로다).
- 제목·본문 요약은 **길이를 클램프**해서 넣는다(120자 제목이 `<title>`에 그대로 들어갔다).
- 로그인 필수 화면(`/posts/new`·`/posts/[id]/edit`·`/profile`)은 `robots: { index: false }`. 본문이 스켈레톤뿐인 페이지가 정적 프리렌더되어 색인될 수 있다.
- `global-error.tsx`에서는 `metadata`가 동작하지 않는다 — React `<title>`을 직접 쓴다(Next 16 문서 명시).

### 아이콘·OG 이미지 (파일 컨벤션)

`app/` 루트의 파일이 곧 메타데이터다 — `icon.svg`(+`icon.png`·`favicon.ico` 폴백) · `apple-icon.png` · `opengraph-image.png`(+`.alt.txt`).

- ⚠ **`opengraph-image.alt.txt`는 파일 내용이 그대로 들어간다.** 끝에 개행을 남기면 `og:image:alt` 값에 `\n`이 붙는다(실측). 개행 없이 저장한다.
- ⚠ **`apple-icon`은 SVG를 지원하지 않는다**(`.jpg|.jpeg|.png`만). 그리고 iOS가 자체 마스크를 씌우므로 **모서리를 둥글리지 않은 전면 채움**으로 만든다 — 라운드된 타일을 넣으면 모서리가 두 번 깎인다. 투명 영역은 검게 칠해지므로 알파도 없앤다.
- ⚠ **`metadataBase`가 없으면 `og:image`가 localhost 절대 URL로 나간다.** `env.siteUrl`(`NEXT_PUBLIC_SITE_URL` → `VERCEL_URL` → localhost)을 루트 layout에서 쓴다.

#### ⚠ 세그먼트가 `openGraph`를 채우면 루트의 이미지가 사라진다

`app/opengraph-image.png`는 하위 라우트로 **자동 상속되지만**, 그 세그먼트의 `generateMetadata`가
`openGraph`를 직접 반환하는 순간 **통째로 대체되어 이미지가 빠진다**(실측 — 글 상세만 이미지 없는
카드로 나갔다). `twitter`도 마찬가지다.

→ `og:title`을 글마다 바꾸는 라우트에서는 `images`를 **명시**한다(`app/posts/[id]/page.tsx`의 `OG_IMAGE`).
  검증은 `curl`로 실제 응답의 `og:image` 유무를 본다 — 빌드는 조용히 통과한다.

## 같은 리소스는 라우트마다 **같은 판정**을 내려야 한다

`/posts/[id]`는 없는 글에 404를 주는데 `/posts/[id]/edit`는 `parsePostId` 실패만 보고 있어서
**없는 글·삭제된 글의 수정 URL이 200을 반환했다**(실측). 클라이언트가 화면에서 안내하더라도
HTTP 상태가 200이면 색인·공유에서 정상 페이지로 취급된다.
→ 수정 페이지도 서버에서 존재를 확인하고 `notFound()`한다. 요청 API를 try/catch로 감쌌으니
  `unstable_rethrow`도 함께 간다(안 그러면 조용히 정적 프리렌더된다).

## Proxy (구 middleware)

- 세션 쿠키 갱신 + **낙관적 라우트 가드**를 `proxy.ts`가 담당한다(Next 16에서 middleware → proxy로 개명).
- Next 공식 authentication 가이드가 권하는 구조다 — proxy는 낙관적 체크만 하고 **진짜 방어는 데이터 소스에 가장 가까운 곳(DB의 RLS)** 에서 한다. 이미 매 요청 돌던 `getUser()` 결과를 재사용하므로 추가 비용이 없다.
- **3중 방어**: proxy(하드 내비게이션·직접 URL) → `AuthRequired`/`GuestOnly`(SPA 전이·세션 만료) → **RLS(최종)**.
- **matcher는 빌드타임에 정적 분석되므로 상수여야 한다** → 경로별 분기는 함수 안에서 한다.
- ⚠ **proxy와 페이지가 같은 파서를 써야 한다.** proxy가 `\d+` 정규식, 페이지가 `Number(id)`로
  판정했더니 `Number()`가 받아들이는 `1e3`·`0x10`·`1.0`에서 판정이 갈려 **가드가 그냥 뚫렸다**.
  지금은 양쪽 다 `@/shared/lib/post-id`의 `parsePostId`(엄격한 십진수)를 쓴다.
  덤으로 `/posts/2`·`/posts/002`·`/posts/2.0` 별칭 URL도 사라졌다.
- ⚠ **경로 비교 전에 `decodeURIComponent`** 한다. Next는 퍼센트 인코딩을 디코딩해 라우팅하므로
  원문과 비교하면 `/posts/%6Eew`(= `/posts/new`)가 가드를 통과한다(실측 확인).
- ⚠ **`?next=` 오픈 리다이렉트는 두 번 뚫렸다.** 반드시 `safeNextPath`를 쓰고 직접 짜지 않는다.
  1차: 문자열 prefix 검사(`startsWith("/") && !startsWith("//")`)는 `/\evil.com`을 통과시킨다 —
     WHATWG 파서가 http(s)에서 역슬래시를 슬래시로 취급하기 때문.
  2차: `new URL(next, origin).origin === origin`만으로도 부족하다 — 파서가 `/..`을 정규화하며
     `//evil.com`을 **pathname으로** 남기고, 그 문자열을 다시 해석하면 프로토콜 상대 URL이 된다.
  → **파싱 결과로 만든 반환값을 같은 기준으로 한 번 더 대조**해야 닫힌다.
- 브라우저 세션이 **쿠키**에 있어야 proxy가 읽을 수 있다. `@supabase/ssr`의 `createBrowserClient`를 `@supabase/supabase-js`의 `createClient`(localStorage)로 바꾸면 서버 가드가 통째로 무력화된다.
- `<Link>`가 뷰포트에 들어오면 **프리페치 요청도 proxy를 탄다** → 비로그인 상태에서 `/posts/new` 링크가 307을 받는다. 기능은 정상이고 로그만 시끄럽다. 문제가 되면 matcher에 `missing: [{ type: "header", key: "next-router-prefetch" }]`를 적용한다(초기에는 넣지 않는다).
