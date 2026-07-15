# 재사용 헬퍼 (중복 구현 금지 · DRY)

새 유틸·계산·포맷을 만들기 전에 **여기 있는 것부터 확인**한다. 같은 로직을 여러 곳에 복붙하지 않는다. 공통 로직이 필요하면 아래 위치에 추가하고 배럴로 노출한다.

## `@/shared/lib/format` (순수 함수 — 서버·클라 공용)
- `formatCount` — 숫자 → `"28,412"`
- `formatPct` — 0~1 비율 → `"57%"`
- `formatDday` — 마감일 → `"D-8"`/`"마감"` (순수 표시용)
- `isClosed` — 마감 여부 boolean 판정 (표시 문자열 비교 금지, 이 함수로 판정)
- `todayUtc` — 오늘 날짜 `"YYYY-MM-DD"`(UTC, Postgres `current_date`와 정합)

## `@/shared/lib` (배럴 — 클라이언트 훅 포함)
- `cn` — Tailwind 클래스 병합
- `useDelayedReveal` — "선택 → 지연 → 리빌" 시퀀스(밸런스 380ms·TMI 600ms 등)
- `useScrollRestore` — 탭 스크롤 위치 저장/복원

## `@/entities/poll/api/mappers` (서버 전용 — 라우트에서 직접 import)
- `fetchMyVotesByPoll` — 내 투표를 poll_id→option_id 맵으로 조회(RLS·빈배열 가드 내장)
- `groupOptionsByPoll` — poll_options를 poll_id로 그룹핑
- `buildPollListItem` / `buildVotesByOption` — 리스트 아이템·득표 맵 조립

## `@/entities/poll/lib` (meta 안전 파서)
- `readSideMeta` / `pickSides`(밸런스), `readKitMeta`, `readRankingMeta`, `readTmiOptionMeta`, `readTmiPollMeta`

## `@/shared/config`
- `ROUTES` — 경로 헬퍼. **경로 문자열 하드코딩 금지**(`"/balance"` ❌ → `ROUTES.balanceList`).
- `COLOR` — JS 인라인 style용 색 상수. **토큰 hex 하드코딩 금지**.

## `@/shared/ui`
- 공용 컴포넌트: `Button`·`Pill`·`Icon`·`Flag`·`Shirt`·`Avatar`·`RatioBar`·`Skeleton`·`EmptyState`·`SectionHead`·`LiveDot`·`Wordmark`·`PlayerSilhouette` — 새로 만들기 전 여기 확인.
