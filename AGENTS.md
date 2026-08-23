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

위 문서들은 원칙만이 아니라 **목록**을 담고 있다(예외 화이트리스트 · 재사용 헬퍼 · 현역/미사용 UI · deep import 허용 경로). 목록은 코드가 움직이면 조용히 틀려진다 — 손으로 세면 반드시 갈린다.

- **코드나 목록을 고쳤으면 `pnpm check:conventions`를 돌린다.** `supabase/tests/run-rls.sh`가 DB에 대해 하는 일을 프론트 규약에 대해 한다.
- 두 검사의 역할 분담: **DB(RLS·권한·`security definer`)는 `run-rls.sh`**, **프론트(레이어·배럴·스타일 화이트리스트)는 `check:conventions`**.

### 규약 문서는 규칙만 담는다 — 수정 이력은 커밋이 갖는다

이 문서들의 모든 문장은 **"지금부터 무엇을 하라"** 에 복무해야 한다. 무엇을 언제 지웠고 어떤 목록이 틀렸었는지는 읽는 사람의 판단을 돕지 않는다.

- **사고 사례는 남긴다 — 단 그것이 "코드·시스템의 실패"일 때만.**
  "`startsWith("/")`는 `/\evil.com`을 통과시킨다"는 독자가 **반복할 수 있는 실패**라 규칙의 근거다.
  "이 표에 3건이 잘못 올라와 있었다"는 **문서를 잘못 썼던 이야기**라 근거가 아니다.
- **판정법: 그 문장을 지웠을 때 규칙이 약해지는가.** 약해지지 않으면 이력이다.
- **사라진 심볼·파일을 규칙의 주어로 삼지 않는다.** 독자가 열어볼 수 없는 이름에 규칙을 묶으면 규칙째 죽는다. 경로의 실재 여부는 `check:conventions`가 대조한다(`doc-dead-path`).
- **개수를 적지 않는다.** "예외 4곳"·"전량 8개"는 행을 더하는 순간 거짓이 된다 → "아래 표가 전부다"로 쓴다. 개수 **자체가 규칙의 내용**인 경우만 예외다(`api-and-db.md`의 "anon EXECUTE 5개 중 definer는 셋" — 개수를 빼면 문장이 성립하지 않는다).
- **일회성 상태 스냅샷을 규칙 자리에 두지 않는다.** "지금은 X 하나뿐"·"아직 라우트가 없다"는 코드가 움직이면 조용히 거짓이 된다. 그 상태에 걸린 주의사항이 있다면 **조건문 규칙으로** 쓴다("이 링크를 없애려면 대체 진입점을 먼저 만든다").
- **이력의 행선지**: 왜 이렇게 됐는지는 **커밋 메시지**, 코드 한 지점의 사연은 **그 자리의 주석**, 큰 스냅샷은 **`docs/legacy/`**(작성일을 박는다).

## React·Next 성능 (Vercel 스킬)

React·Next 컴포넌트·데이터패칭·번들·렌더링·성능 작업을 작성/리뷰할 때는 `react-best-practices` 스킬(`.claude/skills/react-best-practices/`, Vercel 공식 70규칙)을 참조한다. 내부 FSD 슬라이스 배럴은 `architecture.md`의 배럴 규칙이 우선한다(`bundle-barrel-imports`는 서드파티 라이브러리 대상).
