# 아키텍처 컨벤션 (FSD)

이 프로젝트는 **FSD(Feature-Sliced Design)** 를 따른다. `app/`(Next 라우팅)은 얇게 두고, 구현은 전부 `src/` 레이어에 둔다.

## 레이어

`src/` 아래 레이어 (위가 상위):

- `app` — FSD app 레이어: `providers`(QueryClient·익명 세션), `fonts`, `styles/globals.css`
- `views` — 화면 조립. ⚠ **`pages` 금지** (Next Pages Router로 오감지됨 → 반드시 `views`)
- `widgets` — app-bar / bottom-nav / sub-header / tab-scroll-area
- `features` — cast-vote / submit-quiz-attempt / write-comment / like-comment
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

## 서버/클라이언트 경계 (배럴이 담당)

배럴은 "무엇을 노출하지 않을지"도 정한다. `"use client"` 훅이나 `next/headers` 의존 모듈이 잘못된 런타임으로 새지 않게 한다.

- `@/shared/api` — 클라이언트 안전 모듈만 노출. 서버 전용(`handler`, `supabase-server` = `next/headers` 의존)은 **직접 경로**로 import: `@/shared/api/handler`.
- `@/shared/lib` — `"use client"` 훅(`useDelayedReveal` 등) 포함. **Route Handler는 순수 함수를 `@/shared/lib/format`에서 직접 import**.
- `@/entities/poll` — `"use client"` UI 포함. **Route Handler는 `@/entities/poll/model/types`·`@/entities/poll/api/mappers`를 직접 import**.

## 파일·네이밍

- 파일명은 **kebab-case** (`split-card.tsx`, `use-cast-vote.ts`, `option-meta.ts`).
- 컴포넌트·함수는 **named export** (page/layout의 default export는 Next 요구사항이라 예외).
- 주석·문서는 **한국어**, 변수·함수명은 영어.
- 슬라이스 내부 구조: `ui/`(프레젠테이션) · `model/`(상태·타입·훅) · `api/`(쿼리·매퍼) · `lib/`(순수 유틸) + `index.ts`.
