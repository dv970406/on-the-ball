<!-- BEGIN:nextjs-agent-rules -->

# Next.js: ALWAYS read docs before coding

Before any Next.js work, find and read the relevant doc in `node_modules/next/dist/docs/`. Your training data is outdated — the docs are the source of truth.

<!-- END:nextjs-agent-rules -->

## Project conventions

아래는 이 프로젝트에서 확립한 코딩 컨벤션이다. 코드 작성 전 관련 토픽을 따른다.

@docs/conventions/architecture.md
@docs/conventions/nextjs.md
@docs/conventions/data-and-state.md
@docs/conventions/styling.md
@docs/conventions/api-and-db.md
@docs/conventions/reuse.md
@docs/conventions/code-quality.md

### 규약 문서의 "목록"은 손으로 세지 않는다

위 문서들은 원칙만이 아니라 **목록**을 담고 있다(예외 화이트리스트 · 재사용 헬퍼 · 현역/미사용 UI · deep import 허용 경로). 목록은 코드가 움직이면 조용히 틀려지고, 실제로 세 번 되돌아 고쳤다 — 한 번은 보안 표면 목록이 3건 거짓이었다.

- **코드나 목록을 고쳤으면 `pnpm check:conventions`를 돌린다.** `supabase/tests/run-rls.sh`가 DB에 대해 하는 일을 프론트 규약에 대해 한다.
- 두 검사의 역할 분담: **DB(RLS·권한·`security definer`)는 `run-rls.sh`**, **프론트(레이어·배럴·스타일 화이트리스트)는 `check:conventions`**.

## React·Next 성능 (Vercel 스킬)

React·Next 컴포넌트·데이터패칭·번들·렌더링·성능 작업을 작성/리뷰할 때는 `react-best-practices` 스킬(`.claude/skills/react-best-practices/`, Vercel 공식 70규칙)을 참조한다. 내부 FSD 슬라이스 배럴은 `architecture.md`의 배럴 규칙이 우선한다(`bundle-barrel-imports`는 서드파티 라이브러리 대상).
