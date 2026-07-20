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

## React·Next 성능 (Vercel 스킬)

React·Next 컴포넌트·데이터패칭·번들·렌더링·성능 작업을 작성/리뷰할 때는 `react-best-practices` 스킬(`.claude/skills/react-best-practices/`, Vercel 공식 70규칙)을 참조한다. 내부 FSD 슬라이스 배럴은 `architecture.md`의 배럴 규칙이 우선한다(`bundle-barrel-imports`는 서드파티 라이브러리 대상).
