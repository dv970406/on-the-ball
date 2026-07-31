# 아키텍처 컨벤션 (FSD)

이 프로젝트는 **FSD(Feature-Sliced Design)** 를 따른다. `app/`(Next 라우팅)은 얇게 두고, 구현은 전부 `src/` 레이어에 둔다.

## 레이어

`src/` 아래 레이어 (위가 상위):

- `app` — FSD app 레이어: `providers`(QueryClient·익명 세션), `fonts`, `styles/globals.css`
- `views` — 화면 조립. ⚠ **`pages` 금지** (Next Pages Router로 오감지됨 → 반드시 `views`)
- `widgets` — app-bar / bottom-nav / sub-header / tab-scroll-area
- `features` — cast-vote / submit-quiz-attempt / write-comment / like-comment / like-poll
- `entities` — poll / quiz / user (도메인 타입·쿼리 훅·도메인 UI)
- `shared` — ui / api / lib / config

`app/`(루트)의 페이지는 라우팅 전용이며 view만 마운트한다.

## 의존 방향 (단방향)

```
shared ← entities ← features ← widgets ← views
```

- 하위 레이어는 상위를 import하지 않는다.
- **동일 레이어 간 import 금지** (예: `views` → `views`, `entities` → `entities`).
- 상위가 하위 여러 슬라이스를 참조하는 것은 정상(예: `home` view가 poll·quiz·user 엔티티 사용).

## Public API & 배럴(index.ts)

- 각 슬라이스는 **`index.ts` 배럴로 공개 API만 노출**한다. 내부 파일은 구현 세부사항.
- 소비는 **슬라이스 루트**에서: `import { ROUTES } from "@/shared/config"`.
- **deep import 금지**: `@/shared/config/palette` ❌ → `@/shared/config` ✅.
- 이점: 캡슐화 / 파일 이동에 강함(배럴만 수정) / 단방향 의존 감시 용이.
- Vercel `react-best-practices`의 `bundle-barrel-imports`는 **서드파티 라이브러리 배럴**(lucide-react·@mui 등, 최대 수천 개 재export) 대상이다. 내부 슬라이스 배럴은 위 deep-import 금지 규칙을 유지한다. 서드파티는 Next의 `optimizePackageImports` **기본 목록이 이미 커버**한다(`lucide-react` 포함 — `next/dist/server/config.js`의 기본값). next.config에 따로 적지 않는다.

## 서버/클라이언트 경계 (배럴이 담당)

배럴은 "무엇을 노출하지 않을지"도 정한다. `"use client"` 훅이나 `next/headers` 의존 모듈이 잘못된 런타임으로 새지 않게 한다.

- `@/shared/api` — 클라이언트 안전 모듈만 노출. 서버 전용(`handler`, `supabase-server` = `next/headers` 의존)은 **직접 경로**로 import: `@/shared/api/handler`.
- `@/shared/lib` — `"use client"` 훅(`useDelayedReveal` 등) 포함. **Route Handler는 순수 함수를 `@/shared/lib/format`에서 직접 import**.
- `@/entities/poll` — `"use client"` UI 포함. **Route Handler는 `@/entities/poll/model/types`·`@/entities/poll/api/mappers`를 직접 import**.
- `@/entities/user` — 배럴이 `"use client"` 쿼리 훅(`useMyProfileQuery`)을 재export. **Route Handler는 `@/entities/user/model/types`·`@/entities/user/api/mappers`를 직접 import**.

### 응답 계약(response contract) seam — 화면 전용 타입은 view에 두되 서버 안전하게

집계 응답처럼 **owning 엔티티가 없고 특정 화면에만 쓰이는 타입**(예: `HomeFeed`, `MyActivity`)은 그 화면의 `views/*/model/types.ts`에 co-locate한다. 이 파일은 **뷰와 그 화면의 Route Handler가 함께 소비**하므로, 다음 규칙으로 서버 안전성을 유지한다:

- **Route Handler → view 계약 타입**: `@/views/home/model/types` 등 **`import type`로만** 직접 참조한다(런타임 값은 금지 — 타입은 완전 소거되어 단방향 의존을 깨지 않는다).
- **view 계약 타입 파일 → 하위 엔티티 타입**: `@/entities/poll/model/types`처럼 **서버 안전 deep 경로**를 쓴다. 이 파일이 Route Handler에 물리므로, `"use client"` UI를 포함한 슬라이스 배럴(`@/entities/poll`)을 경유하면 클라 코드가 라우트로 샌다.

즉 계약 타입 파일은 위 "Route Handler" 규칙과 동일한 서버 안전 제약을 따른다.

### 서버 조립 모듈 seam — Route Handler와 서버 컴포넌트가 같은 조립 로직을 공유할 때

화면을 서버에서 프리페치하면 **같은 응답을 만드는 코드가 Route Handler와 page.tsx 두 곳에서 필요**해진다. 이때 로직을 복붙하지 않고 `views/*/api/*.ts`에 서버 안전 모듈로 두고 양쪽이 deep 경로로 소비한다.

- 선례: `@/views/home/api/build-home-feed` — `app/api/home/route.ts`와 `app/(tabs)/page.tsx`가 함께 쓴다.
- 이 파일은 **`"use client"` 금지**이며, 위 Route Handler 규칙대로 하위 레이어를 서버 안전 경로로만 참조한다.
- **슬라이스 배럴(`@/views/home`)에 싣지 않는다** — 배럴은 클라 UI를 포함하므로 라우트로 클라 코드가 샌다.
- 계약 타입(`import type`)만 허용하는 위 규칙의 예외다. 판단 기준은 "런타임 값이냐"가 아니라 **"서버 안전하냐"** 이다.

### `"use client"` 모듈의 값은 서버에서 호출할 수 없다

`"use client"` 파일의 export는 서버에서 값이 아니라 **클라이언트 참조**가 된다. 컴포넌트로 렌더하는 건 되지만 **함수로 호출하면 런타임 에러**다(`Attempted to call X() from the server`). 서버 컴포넌트(`not-found.tsx` 등)에서도 필요한 순수 함수는 별도 파일로 뺀다.

- 선례: `shared/ui/button-class.ts`(순수 `buttonClassName`) ↔ `shared/ui/button.tsx`(`"use client"` `Button`). 배럴은 각각의 소스에서 재export하므로 소비 경로(`@/shared/ui`)는 그대로다.

## 파일·네이밍

- 파일명은 **kebab-case** (`split-card.tsx`, `use-cast-vote.ts`, `option-meta.ts`).
- 컴포넌트·함수는 **named export** (`page`·`layout`·`template`·`error`·`global-error`·`not-found`의 default export는 Next 요구사항이라 예외).
- 주석·문서는 **한국어**, 변수·함수명은 영어.
- 슬라이스 내부 구조: `ui/`(프레젠테이션) · `model/`(상태·타입·훅) · `api/`(쿼리·매퍼) · `lib/`(순수 유틸) + `index.ts`.
