# 아키텍처 컨벤션 (FSD)

이 프로젝트는 **FSD(Feature-Sliced Design)** 를 따른다. `app/`(Next 라우팅)은 얇게 두고, 구현은 전부 `src/` 레이어에 둔다.

## 레이어

`src/` 아래 레이어 (위가 상위):

- `app` — FSD app 레이어: `providers`(QueryClient + AuthProvider), `fonts`, `styles/globals.css`
- `views` — 화면 조립. ⚠ **`pages` 금지** (Next Pages Router로 오감지됨 → 반드시 `views`)
  post-list / post-detail / post-write / post-edit / survey-list / survey-detail / sign-in / profile
- `widgets` — app-bar / bottom-tab-bar / sub-header / tab-scroll-area / auth-shell / auth-status
- `features` — 사용자 액션 1개 = 슬라이스 1개
  sign-in(소셜 OAuth) / sign-out / link-identity / update-profile /
  write-post / delete-post / write-comment / delete-comment / toggle-post-like / view-post /
  cast-poll-vote / cast-survey-vote / block-user / report-post
- `entities` — session / post / comment / profile / poll / survey / block (도메인 타입·쿼리 훅·도메인 UI)
- `shared` — ui / api / lib / config

`app/`(루트)의 페이지는 라우팅 전용이며 view만 마운트한다.

## 의존 방향 (단방향)

```
shared ← entities ← features ← widgets ← views
```

- 하위 레이어는 상위를 import하지 않는다.
- **동일 레이어 간 import 금지** (예: `views` → `views`, `entities` → `entities`).
- 상위가 하위 여러 슬라이스를 참조하는 것은 정상(예: `post-detail` view가 post·comment·session 엔티티와 여러 feature를 사용).

## Public API & 배럴(index.ts)

- 각 슬라이스는 **`index.ts` 배럴로 공개 API만 노출**한다. 내부 파일은 구현 세부사항.
- 소비는 **슬라이스 루트**에서: `import { ROUTES } from "@/shared/config"`.
- **deep import 금지**: `@/shared/config/palette` ❌ → `@/shared/config` ✅.
- 이점: 캡슐화 / 파일 이동에 강함(배럴만 수정) / 단방향 의존 감시 용이.
- **슬라이스 내부 훅은 배럴에 올리지 않는다.** 배럴은 **다른 레이어가 소비하는 것**만 담는다. 화면 슬라이스의 배럴을 읽는 것은 서버 컴포넌트(`app/**`의 page·layout)인데 서버는 `"use client"` 훅을 **호출할 수 없으므로**(아래 절), 올려 봐야 아무도 부를 수 없는 값이 공개 API에 남는다. 같은 슬라이스 안에서는 상대 경로로 가져온다 — 선례 `shared/ui/sheet.tsx`가 `./use-sheet-drag`를 직접 가져온다.
  - ⚠ `pnpm check:conventions`는 이 위반을 **잡지 못한다.** 상대 경로 소비도 "현역"으로 세기 때문이다(배럴 미사용 검사의 목적은 죽은 export를 찾는 것이다).
- Vercel `react-best-practices`의 `bundle-barrel-imports`는 **서드파티 라이브러리 배럴**(lucide-react·@mui 등, 최대 수천 개 재export) 대상이다. 내부 슬라이스 배럴은 위 deep-import 금지 규칙을 유지한다. 서드파티는 Next의 `optimizePackageImports` **기본 목록이 이미 커버**한다(`lucide-react` 포함 — `next/dist/server/config.js`의 기본값). next.config에 따로 적지 않는다.

### ⚠ 배럴의 트리셰이킹은 `package.json`의 `sideEffects` 선언에 달려 있다

`@/shared/ui` 배럴은 **루트 layout이 마운트하는 `AppProviders`가 `ToastViewport` 하나 때문에 이미 타고 있다.** 그래서 이 배럴이 재export하는 모듈 중 털리지 않는 것이 생기면 그것을 쓰지 않는 화면까지 포함해 **전 라우트의 초기 JS에 들어간다.**

실제로 그런 일이 있었다 — react-markdown이 목록·로그인·404에까지 실려 초기 JS가 **43.6KB(gzip) 부풀어 있었다.** 원인은 배럴이 아니라 **`package.json`에 `sideEffects` 선언이 없던 것**이었다(반사실 빌드로 실측: 배럴을 그대로 둔 채 선언만 추가하니 `/sign-in`이 332.5KB → 290KB로 떨어지고 마크다운은 글 상세 한 라우트에만 남았다).

- **순수한 모듈은 선언이 없어도 털린다.** 미사용 v1 컴포넌트는 선언 전에도 프로덕션 청크에 0건이었다. 문제가 된 것은 **서드파티 의존을 끌고 있어 번들러가 순수성을 증명하지 못한** 모듈 하나뿐이었다.
- 그러므로 **무거운 모듈이 생겼다고 배럴에서 빼지 않는다.** 먼저 `sideEffects`가 선언돼 있는지 보고, 그래도 남으면 그때 FSD가 권하는 형태(`shared/ui`·`shared/lib`를 컴포넌트별 index로 쪼개기)를 검토한다 — deep import를 여는 것은 **공개 API 규칙 위반**이다(FSD: "Modules outside of this slice/segment can only reference the public API").

⚠ **`sideEffects`는 번들러에 대한 약속이다.** 지금 이 프로젝트에서 import 시점 부작용은 `globals.css` 두 곳뿐이라 `["*.css"]`로 선언했다. 앞으로 **import만으로 무언가를 등록하는 모듈**(폴리필·전역 초기화·analytics 부트스트랩)을 추가하면, 아무도 그 export를 쓰지 않을 때 **조용히 통째로 삭제된다.** 그런 모듈이 생기면 목록에 함께 적는다.

## 서버/클라이언트 경계 (배럴이 담당)

배럴은 "무엇을 노출하지 않을지"도 정한다. `"use client"` 훅이나 `next/headers` 의존 모듈이 잘못된 런타임으로 새지 않게 한다.

**서버 소비자는 `generateMetadata`와 서버 컴포넌트(page·layout)다.**

- `@/shared/api` — 클라이언트 안전 모듈만 노출. 서버 전용(`supabase-server` = `next/headers` 의존)은 **직접 경로**로 import: `@/shared/api/supabase-server`.
- `@/shared/lib` — `"use client"` 훅(`useScrollRestore`·`useNowMs`·`useToast`·`useFocusTrap`·`useNextParam`) 포함. **서버에서는 순수 함수를 직접 경로로 import**: `@/shared/lib/cn`·`format`·`post-id`·`text`. 위 나열이 곧 `shared/lib`의 화이트리스트이고 **단일 소스는 `src/shared/lib/index.ts` 말미의 주석**이다.
  - ⚠ **`"use client"`를 붙이지 않은 `shared/ui` 컴포넌트도 서버 소비자다.** 배럴을 거치면 서버 렌더 여지를 잃는다 — `markdown`·`empty-state`·`avatar`·`pill`·`skeleton`과 클래스 함수들(`button-class`·`action-chip-class`·`chip-class`)이 `@/shared/lib/cn` 직접 경로를 쓰는 이유다(사유는 `empty-state.tsx` 주석에).
- `@/entities/post`·`@/entities/comment`·`@/entities/profile`·`@/entities/survey` — `"use client"` 쿼리 훅·UI 포함. **서버는 `model/types`·`api/mappers`·`api/keys`·`api/list-query`를 직접 import**. post의 순수 헬퍼도 마찬가지다 — `app/posts/[id]/page.tsx`가 `@/entities/post/lib/plain-summary`를 직접 경로로 가져와 `og:description`을 만든다.
- `@/entities/session` — 배럴이 zustand 스토어·Provider·가드를 재export(전부 클라이언트). 순수 함수 `toAuthErrorMessage`는 `lib/auth-error-message`에, 쿼리 키는 `api/keys`에 따로 있다.
- `@/features/sign-in` — 배럴이 `"use client"` 훅(`useOAuthSignIn`)을 포함한다. **서버가 쓰는 순수 함수 `hasPkceVerifier`는 `@/features/sign-in/lib/pkce-verifier` 직접 경로**로 가져간다(`app/(auth)/sign-in/page.tsx`가 선례). features 레이어에도 같은 예외가 성립한다는 뜻이다 — 배럴이 클라이언트 훅을 담고 있으면 서버 소비자는 직접 경로를 쓴다.
- 선례: `app/posts/[id]/page.tsx`는 **`"use client"`를 담은 배럴을 하나도 거치지 않는다.** 서버 안전 모듈은 전부 직접 경로로 가져오고, 배럴을 쓰는 곳은 순수 상수만 담은 `@/shared/config`와 서버가 **렌더**하는 뷰(`@/views/post-detail`)뿐이다(렌더는 합법 — 아래 절 참고).

### 요청당 1회 — 서버 조회는 React `cache()`로 감싼다

`generateMetadata`와 `Page`가 같은 데이터를 필요로 하면 조회가 **요청당 2번** 나간다. `cache()`로 감싸 한 번만 돌게 한다.

- 선례: `app/posts/[id]/page.tsx`의 `fetchPostHead` — 제목(메타데이터)과 존재 여부(404 판정)를 한 번의 조회로 함께 얻는다.
- ⚠ **`notFound()`는 반드시 `Page`(세그먼트 렌더)에서 부른다.** `generateMetadata`에서 부르면 메타데이터 생성만 중단되고 응답은 200으로 나간다.
- ⚠ 조회 실패("unknown")와 글 없음("missing")을 구분한다. 일시 장애로 멀쩡한 글을 404로 단정하면 안 된다.

### `"use client"` 모듈의 값은 서버에서 호출할 수 없다

`"use client"` 파일의 export는 서버에서 값이 아니라 **클라이언트 참조**가 된다. 컴포넌트로 렌더하는 건 되지만 **함수로 호출하면 런타임 에러**다(`Attempted to call X() from the server`). 서버 컴포넌트(`not-found.tsx` 등)에서도 필요한 순수 함수는 별도 파일로 뺀다.

- 선례: `shared/ui/button-class.ts`(순수 `buttonClassName`) ↔ `shared/ui/button.tsx`(`"use client"` `Button`). 배럴은 각각의 소스에서 재export하므로 소비 경로(`@/shared/ui`)는 그대로다.
- 같은 이유로 `shared/ui/markdown.tsx`에는 `"use client"`를 **붙이지 않는다**(서버 렌더 여지를 남긴다). 입력기인 `markdown-editor.tsx`만 클라이언트다.

### 클라이언트 컴포넌트를 서버에서 **렌더**하는 것은 정상이다

위 규칙이 금지하는 것은 **호출**이다. 서버 컴포넌트가 `"use client"` 컴포넌트를 JSX로 렌더하는 것은 합법이며 실제로 그렇게 쓰고 있다 — `app/(auth)/layout.tsx`가 `GuestOnly`를, `app/posts/new/page.tsx`가 `AuthRequired`를 렌더한다.

## 파일·네이밍

- 파일명은 **kebab-case** (`post-card.tsx`, `use-create-post.ts`, `plain-summary.ts`).
- 컴포넌트·함수는 **named export** (`page`·`layout`·`template`·`error`·`global-error`·`not-found`의 default export는 Next 요구사항이라 예외).
- 주석·문서는 **한국어**, 변수·함수명은 영어.
- 슬라이스 내부 구조: `ui/`(프레젠테이션) · `model/`(상태·타입·훅) · `api/`(쿼리·매퍼) · `lib/`(순수 유틸) + `index.ts`.
  - 화면 슬라이스(`views`)와 위젯도 `model/`을 갖는다 — 무엇을 `model/`로 빼는지는 `code-quality.md`가 정한다.
  - ⚠ **컴포넌트 하나 전용 훅은 예외적으로 그 컴포넌트 옆(`ui/`)에 둔다.** 도메인을 모르는 순수 메커니즘(제스처·요소 측정·마운트 유지)이라 `model/`의 성격이 아니고, `shared`에는 애초에 `model/`이 없어(훅·상태를 `lib/`에 두는 선례) 이 배치가 선택이 아니라 강제다.
