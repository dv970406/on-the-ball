# 출처 및 갱신 (프로젝트 메타 — Vercel 원문 아님)

이 스킬은 Vercel 공식 `react-best-practices`를 **원문 그대로(verbatim)** 이 레포에 vendoring 한 것이다.
아래 파일(`SKILL.md`, `rules/`, `metadata.json`, `README.md`)은 Vercel 원본이며 수정하지 않는다. 이 `SOURCE.md`만 프로젝트가 추가한 메타 파일이다.

## 출처

- 레포: https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices
- 블로그: https://vercel.com/blog/introducing-react-best-practices
- 라이선스: MIT (Vercel Engineering) — `SKILL.md` frontmatter의 `license`/`author`로 귀속
- vendoring 기준 커밋: `dc8367e6f91c022d83361f03c3313fa05e848ee5` (main, 2026-04-14)

## vendoring 범위

- **포함**: `SKILL.md` + `rules/`(70개 규칙 + `_sections.md`·`_template.md`) + `metadata.json` + `README.md`.
- **제외**: 컴파일본 `AGENTS.md`(108KB) — `rules/`의 단순 연결이라 중복이고, 파일명이 프로젝트 지침으로 오인될 수 있어 제외. **규칙 70개는 `rules/`에 100% 보존**된다.
- 컬렉션의 다른 스킬(composition-patterns·view-transitions 등)은 이 프로젝트에 불필요해 **react-best-practices 단일 스킬만** 가져왔다.

## 갱신법

업스트림이 바뀌면 아래 중 하나로 갱신한다(원문 verbatim 유지, 위 커밋 SHA를 새 값으로 교체).

```bash
# 방법 A) 공식 CLI — 단, 컬렉션 전체가 설치될 수 있으니 react-best-practices 외 스킬은 정리한다
npx skills add vercel-labs/agent-skills

# 방법 B) 원문만 재취득 (이 디렉터리에서, 단일 스킬 정밀 갱신)
BASE="repos/vercel-labs/agent-skills/contents/skills/react-best-practices"
for f in SKILL.md README.md metadata.json; do
  gh api "$BASE/$f" --jq '.content' | base64 -d > "$f"
done
gh api "$BASE/rules" --jq '.[].name' | while read -r n; do
  gh api "$BASE/rules/$n" --jq '.content' | base64 -d > "rules/$n"
done
```

## 프로젝트 적용 규칙 (충돌·조정)

70개 규칙을 프로젝트 컨벤션(FSD + 토스 4대 기준)과 대조한 결과. **모든 충돌은 프로젝트 규약이 우선**하며, Vercel 원문 파일은 수정하지 않고 여기와 해당 컨벤션 문서에만 조정을 기록한다.

### 직접 충돌 (규칙대로 따르면 프로젝트 규약 위반)

| Vercel 규칙 | 충돌 대상 | 조정 (프로젝트 우선) |
|---|---|---|
| `bundle-barrel-imports` | FSD 배럴·deep-import 금지 (`architecture.md`) | 규칙 대상은 **서드파티 라이브러리 배럴**(lucide-react·@mui 등). 내부 슬라이스 배럴은 유지, 서드파티는 next.config `optimizePackageImports`. |
| `client-swr-dedup` | **TanStack Query 전용** (`data-and-state.md`) | 의도(중복 제거·raw fetch 금지)만 취하고 **SWR API는 도입하지 않음**. 기존 TanStack Query로 동일 목적 달성. |
| `rendering-hydration-suppress-warning` | **렌더 중 `new Date()`/`Date.now()`/`Math.random()` 금지** (`data-and-state.md`) | `suppressHydrationWarning`으로 덮지 않음. 비결정값을 렌더에 넣지 않고 헬퍼(`formatDday`·`isClosed`·`todayUtc`)로 **원천 차단**. |

### 소프트 텐션 (모순 아님, 우선순위)

- `js-*` 마이크로 최적화(`js-combine-iterations`·`js-cache-property-access`·`js-min-max-loop` 등)는 명료성을 성능과 맞바꾼다(Vercel도 LOW-MEDIUM). **토스 가독성이 우선** — 핫패스에서 측정된 이득이 있을 때만 적용. 단 `js-early-exit`·`js-tosorted-immutable`·`js-flatmap-filter`는 가독성·예측가능성과 오히려 일치.
- 선택 의존성(`better-all`·`lru-cache`) 추가는 프로젝트의 최소 의존·"성급한 추상화보다 중복" 성향과 텐션. 실이득이 명확할 때만.

### 적용성 (충돌 아님, 참고)

- `server-*`(auth-actions·cache-react·hoist-static-io 등)는 RSC 직접 패칭·서버액션을 가정한다. 이 프로젝트는 **route handler + SECURITY DEFINER RPC** 경유(`api-and-db.md`)라 컨텍스트가 다르나, 규칙 자체는 핸들러 안에서 재사용 가능하다.
- `rendering-hydration-no-flicker`의 `dangerouslySetInnerHTML` 인라인 스크립트는 클라 저장소 UI(테마 토글 등) 대상 — 현재 프로젝트에 해당 케이스가 적다.
