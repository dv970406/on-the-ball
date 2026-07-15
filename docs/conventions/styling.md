# 스타일 컨벤션 (Tifo 디자인 시스템)

## 토큰

- Tailwind v4 `@theme` 토큰은 `src/app/styles/globals.css`에 정의. **파운데이션 이후 동결** — 새 토큰이 필요하면 arbitrary value로.
- **토큰과 동일한 hex를 하드코딩하지 않는다.**
  - Tailwind 유틸로 표현: `bg-primary`, `text-ink`, `border-hairline` …
  - 알파는 토큰+투명도: `bg-primary/[0.12]` (❌ `bg-[rgba(62,207,142,0.12)]`).
  - 인라인 `style`에 JS 색이 필요하면(예: `RatioBar` segment) `COLOR`(`@/shared/config`)를 참조. 뷰별 로컬 색 상수 재정의 금지.

## 디자인 규칙 (Tifo)

- **한 뷰포트당 컬러 이벤트는 에메랄드 1개.** 나머지는 잉크 그레이 래더.
- 에메랄드(`bg-primary`) 위 텍스트는 항상 `text-on-primary`(#171717) — **흰색 금지**.
- 버튼은 **6px 라운드**(`rounded-sm`) — pill 버튼 금지.
- 그림자 대신 **1px 헤어라인**이 카드 구조를 담당, resting 상태는 flat.
- 배경 그라데이션·블러·글래스모피즘 금지(하단 탭바만 예외적으로 blur).
- 애니메이션 이징 `ease-otb`(cubic-bezier(0.2,0,0,1)), 150–350ms. 바운스·스프링 금지.
- 강한 컬러(클럽 컬러·국기)는 **콘텐츠**로만 허용 — 크롬(버튼·네비)에는 금지.
- `prefers-reduced-motion` 존중(전역 처리됨).
