# 스타일 컨벤션 (Tifo 디자인 시스템)

## 토큰

- Tailwind v4 `@theme` 토큰은 `src/app/styles/globals.css`에 정의. **파운데이션 이후 동결** — 새 토큰이 필요하면 arbitrary value로.
- **토큰과 동일한 hex를 하드코딩하지 않는다.**
  - Tailwind 유틸로 표현: `bg-primary`, `text-ink`, `border-hairline` …
  - 알파는 토큰+투명도: `bg-primary/[0.12]` (❌ `bg-[rgba(62,207,142,0.12)]`).
  - 인라인 `style`에 JS 색이 필요하면(예: `RatioBar` segment) `COLOR`(`@/shared/config`)를 참조. 뷰별 로컬 색 상수 재정의 금지.

## 스타일 적용 방식

### className(Tailwind) + `cn()`이 기본, `style`은 예외

- 모든 스타일은 Tailwind 유틸 클래스로 표현하고, 조건 분기는 `cn()`(`@/shared/lib`)으로 처리한다.
- 토큰으로 표현할 수 없는 특수값은 arbitrary를 쓴다 — `@theme` 블록은 동결이다.
  - arbitrary **value**: `border-[1.5px]`, `tracking-[-0.6px]`, `bg-[linear-gradient(...)]`
  - arbitrary **property**: `[clip-path:polygon(...)]`, `[transform:...]`, `[transition:...]`
- ⚠ **`bg-linear-*` 그라데이션 유틸은 `in oklab` 보간이다.** 프로토타입의 sRGB `linear-gradient(...)`를 그대로 옮길 땐 `bg-[linear-gradient(...)]` arbitrary를 쓴다(중간색이 달라진다).
- ⚠ 벤더 prefix는 자동 생성되지 않는다(browserslist 미설정 → Lightning CSS 기본 타깃). 구형 사파리 지원이 필요한 속성은 `[-webkit-clip-path:...]`처럼 병기한다.

### `style` prop이 허용되는 유일한 경우 — 런타임에 결정되는 동적 값

빌드 시점에 클래스 문자열로 확정할 수 없는 값만 `style`에 남긴다.

- DB `meta` jsonb에서 온 색: `style={{ background: meta.tone, color: meta.text }}`
- 계산된 비율: ``style={{ width: `${truePct}%` }}``
- prop으로 받은 px: `style={{ width: size, height: size }}`

**값이 유한한 열거형(tone·side·상태)은 동적이 아니다** — `Record<K, string>` 클래스 맵으로 만든다.
(예: `shared/ui/live-dot.tsx`의 `DOT_TONE`, `entities/poll/ui/split-card.tsx`의 `CLIP`)

CSS 변수를 `style`로 주입해 클래스에서 읽는 패턴(`style={{ "--w": ... }}` + `w-[var(--w)]`)은 쓰지 않는다 — 간접 계층만 늘어난다.

### `CSSProperties`를 반환하는 헬퍼 함수 금지

상태별 스타일은 **className 문자열을 반환하는 함수**나 `cn()` 분기로 표현한다.
선례: `shared/ui/button.tsx`의 `buttonClassName`, `views/tmi/ui/tmi-card.tsx`의 `cardClassName`.

```tsx
// ❌ 금지
function cardStyle(peek: boolean): CSSProperties {
  return peek ? { transform: "translateY(12px) scale(0.96)", opacity: 0.6 } : ...;
}

// ✅
function cardClassName(peek: boolean) {
  return peek ? "opacity-60 [transform:translateY(12px)_scale(0.96)]" : ...;
}
```

### transform 계열은 `[transform:...]` arbitrary property로 쓴다

`translate-*` / `scale-*` / `rotate-*` 표준 유틸은 **`transform`이 아니라 개별 CSS 프로퍼티**를 출력한다(Tailwind v4). 그래서 `transform`과 **합성**되고, 이게 두 가지 사고를 낸다.

1. **`@keyframes`와의 합성.** `vs-pop`은 `transform: translate(-50%,-50%) rotate(-12deg) scale(...)`을 애니메이트한다. 같은 요소에 `-translate-x-1/2`를 얹으면 `translate` 프로퍼티가 **추가로** 적용되어 -50%가 두 번 먹고 위치가 깨진다.
2. **`transition-property` 불일치.** `transition-[transform,opacity]`는 `translate`/`scale`/`rotate` 변화를 **트랜지션하지 않는다**(`transition-transform`만 `transform, translate, scale, rotate`를 전부 커버). `scale-[1.04]`로 바꾸면 애니메이션이 조용히 사라지고 순간이동한다.

```tsx
// ❌
<span className="animate-vs-pop -translate-x-1/2 -translate-y-1/2 rotate-[-12deg]" />
// ✅
<span className="animate-vs-pop [transform:translate(-50%,-50%)_rotate(-12deg)]" />
```

**유일한 예외**: 같은 요소에 animation도, transform을 건드리는 transition도 **없는** 순수 정적 배치는 `-translate-x-1/2 -translate-y-1/2` 센터링을 그대로 써도 된다(예: `quiz-pitch.tsx`의 센터서클).
단 `VsBadge`는 똑같은 센터링이지만 `animate-vs-pop` 때문에 **예외가 아니다** — 애니메이션·트랜지션 유무로 판단하고, "센터링이니까 표준 유틸"로 판단하지 않는다.

한 요소에 `[transition:...]` arbitrary와 표준 `transition-*` 유틸을 섞지 않는다 — twMerge가 서로 다른 그룹으로 보아 둘 다 남는다.

### 값을 상수로 뺄지 판단하는 기준

`code-quality.md`의 "성급한 추상화보다 중복"을 그대로 적용한다.

1. **`@theme` 토큰 추가 — 하지 않는다**(동결). 여러 슬라이스가 공유하는 디자인 결정이 새로 생겼을 때만 별도 논의.
2. **슬라이스 내부 `Record<K, string>` 클래스 맵** — 판별자(tone·side·상태)가 **이미 있고** 값들이 반드시 함께 바뀔 때만. 새 추상화를 만드는 게 아니라 기존 맵의 값 타입을 바꾸는 수준이어야 한다.
3. 그 외는 전부 **인라인 arbitrary**. 길어도 1회 사용이면 이름을 붙이지 않는다 — 바로 위 한국어 주석이 이미 의미를 설명한다.

## 디자인 규칙 (Tifo)

- **한 뷰포트당 컬러 이벤트는 에메랄드 1개.** 나머지는 잉크 그레이 래더.
- 에메랄드(`bg-primary`) 위 텍스트는 항상 `text-on-primary`(#171717) — **흰색 금지**.
- 버튼은 **6px 라운드**(`rounded-sm`) — pill 버튼 금지.
- 그림자 대신 **1px 헤어라인**이 카드 구조를 담당, resting 상태는 flat.
- 배경 그라데이션·블러·글래스모피즘 금지(하단 탭바만 예외적으로 blur).
- 애니메이션 이징 `ease-otb`(cubic-bezier(0.2,0,0,1)), 150–350ms. 바운스·스프링 금지.
- 강한 컬러(클럽 컬러·국기)는 **콘텐츠**로만 허용 — 크롬(버튼·네비)에는 금지.
- `prefers-reduced-motion` 존중(전역 처리됨).
