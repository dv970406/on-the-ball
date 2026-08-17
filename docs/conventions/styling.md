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
(예: `shared/ui/live-dot.tsx`의 `DOT_TONE`, `shared/ui/button-class.ts`의 `BUTTON_VARIANT`, `shared/ui/markdown-editor.tsx`의 `TAB_LABEL`)

CSS 변수를 `style`로 주입해 클래스에서 읽는 패턴(`style={{ "--w": ... }}` + `w-[var(--w)]`)은 쓰지 않는다 — 간접 계층만 늘어난다.

### `CSSProperties`를 반환하는 헬퍼 함수 금지

상태별 스타일은 **className 문자열을 반환하는 함수**나 `cn()` 분기로 표현한다.
선례: `shared/ui/button-class.ts`의 `buttonClassName`, `shared/ui/markdown-editor.tsx`의 `tabClassName`.

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

**유일한 예외**: 같은 요소에 animation도, transform을 건드리는 transition도 **없는** 순수 정적 배치는 `-translate-x-1/2 -translate-y-1/2` 센터링을 그대로 써도 된다.
같은 센터링이라도 그 요소에 애니메이션이 붙어 있으면 예외가 아니다 — **애니메이션·트랜지션 유무로 판단**하고, "센터링이니까 표준 유틸"로 판단하지 않는다.

한 요소에 `[transition:...]` arbitrary와 표준 `transition-*` 유틸을 섞지 않는다 — twMerge가 서로 다른 그룹으로 보아 둘 다 남는다.

### 값을 상수로 뺄지 판단하는 기준

`code-quality.md`의 "성급한 추상화보다 중복"을 그대로 적용한다.

1. **`@theme` 토큰 추가 — 하지 않는다**(동결). 여러 슬라이스가 공유하는 디자인 결정이 새로 생겼을 때만 별도 논의.
2. **슬라이스 내부 `Record<K, string>` 클래스 맵** — 판별자(tone·side·상태)가 **이미 있고** 값들이 반드시 함께 바뀔 때만. 새 추상화를 만드는 게 아니라 기존 맵의 값 타입을 바꾸는 수준이어야 한다.
3. 그 외는 전부 **인라인 arbitrary**. 길어도 1회 사용이면 이름을 붙이지 않는다 — 바로 위 한국어 주석이 이미 의미를 설명한다.

### 마크다운 렌더

- **Tailwind Typography(`prose`)를 도입하지 않는다.** 새 의존성인 데다 자체 색·간격 스케일이 Tifo 토큰과 충돌한다. 대신 `shared/ui/markdown.tsx`의 `components` 맵에 태그별 클래스를 명시한다(판별자가 태그명이라 `styling.md`의 "슬라이스 내부 클래스 맵" 기준을 충족).
- **본문 링크를 에메랄드로 칠하지 않는다.** 본문에 링크가 많으면 "뷰포트당 컬러 이벤트 1개"가 깨진다 — 밑줄만으로 충분히 구분된다. GFM 체크박스도 `accent-ink`.
- 넘칠 수 있는 블록(`pre`·`table`)은 **자기 안에서만 가로 스크롤**시킨다(`overflow-x-auto` 래퍼). 페이지 본문이 가로로 밀리면 안 된다.
- react-markdown은 기본적으로 raw HTML을 렌더하지 않는다(rehype-raw 미사용). 본문이 사용자 입력이므로 **이 기본값을 절대 풀지 않는다**.

## 디자인 규칙 (Tifo)

- **한 뷰포트당 컬러 이벤트는 에메랄드 1개.** 나머지는 잉크 그레이 래더.
- 에메랄드(`bg-primary`) 위 텍스트는 항상 `text-on-primary`(#171717) — **흰색 금지**.
- 버튼은 **6px 라운드**(`rounded-sm`) — pill 버튼 금지. **예외는 아래 표에 못박아 두었다.**
- 그림자 대신 **1px 헤어라인**이 카드 구조를 담당, resting 상태는 flat. **예외는 "떠 있는 레이어"뿐이다(아래).**
- 배경 그라데이션·블러·글래스모피즘 금지(하단 탭바만 예외적으로 blur).
- 애니메이션 이징 `ease-otb`(cubic-bezier(0.2,0,0,1)), 150–350ms. 바운스·스프링 금지.
  - ⚠ **오버레이가 물러나는 퇴장은 예외다 — `cubic-bezier(0.4,0,1,1)`(accelerate) 140ms.**
    시트가 화면 밖으로 나가는 것도, 그 스크림이 걷히는 것도 같은 값을 쓴다(둘이 어긋나면
    시트가 맨 배경 위를 미끄러지는 프레임이 생긴다).
    `ease-otb`는 감속 커브라 **마지막 10%를 지나는 데 전체 시간의 약 절반**을 쓴다(시간 53%에 진행 90%).
    진입에는 안착감을 주지만 퇴장에 쓰면 다 닫힌 것처럼 보이는 잔상이 100ms 가까이 남아
    **"닫기가 느리다"는 체감**이 된다. 그래서 퇴장만 가속 커브로 뒤집고 하한(150ms)도 아래로 연다.
    바운스·스프링이 아니므로 위 금지에는 걸리지 않는다. 선례: `Sheet`(`shared/ui/sheet.tsx`).
- 강한 컬러(클럽 컬러·국기)는 **콘텐츠**로만 허용 — 크롬(버튼·네비)에는 금지.
- `prefers-reduced-motion` 존중(전역 처리됨).
  - ⚠ **언마운트를 `animationend`에 거는 요소에는 `motion-safe:`를 붙이지 않는다.** reduce 환경에서
    클래스 자체가 사라져 이벤트가 오지 않고 **그 요소가 화면에 남는다.** 전역 블록이 duration을
    0.01ms로 눌러 주므로 접두어 없이 써야 이벤트가 정상 발화한다(`Sheet`가 그래서 안 쓰고,
    즉시 언마운트하는 `Dialog`·`ToastViewport`는 계속 쓴다). **폴백 타이머도 함께** 둔다 —
    백그라운드 탭에서는 애니메이션이 멈춰 이벤트가 오지 않는다(실측).
- ⚠ **화면 밖에서 시작하는 진입 애니메이션(`translateY(100%)` 등)에 포커스를 함께 주지 않는다.**
  첫 프레임에 프레임 밖인 요소에 `focus()`를 걸면 브라우저가 scroll-into-view로 **앱 프레임 자체를
  스크롤**시키고, 프레임이 `overflow-hidden`이라 사용자가 되돌릴 수 없다(실측 190px 밀림).
  `useFocusTrap`이 `preventScroll: true`로 막고 있다 — 새 오버레이가 직접 `focus()`를 부른다면 같이 붙인다.

### 알약(`rounded-full`) 예외

프로토타입 치수를 그대로 옮긴 자리다. **이 목록에 없으면 `rounded-sm`이다.**

| 자리 | 파일 |
|---|---|
| `ActionChip` (좋아요·댓글 카운터 칩) | `shared/ui/action-chip-class.ts` |
| 댓글 입력창 | `views/post-detail/ui/comment-bar.tsx` |
| 댓글 전송 버튼 | `views/post-detail/ui/comment-bar.tsx` |
| 글쓰기 FAB | `views/post-list/ui/post-list-view.tsx` |

**이 규칙이 말하는 "버튼"은 라벨을 담은 직사각형 컨트롤이다.** 그 밖의 `rounded-full`은 애초에 이 규칙의 대상이 아니므로 예외 목록에 넣지 않는다:

| 대상이 아닌 것 | 이유 | 실제 위치 |
|---|---|---|
| `size-11`/`size-9` 원형 아이콘 **버튼** | 버튼 라운드가 아니라 **원형 히트 영역** | `sub-header` · `post-detail-view` · `profile-view`(사진 변경) |
| 원형 아이콘 **컨테이너**(클릭 불가) | 히트 영역도 아닌 순수 장식 | `shared/ui/empty-state.tsx` |
| 도트·아바타·`Pill`·`RatioBar`·워드마크의 볼 | 컨트롤이 아닌 **표시 요소** | `live-dot` · `avatar` · `pill` · `ratio-bar` · `wordmark` · `post-card`의 구분점 · `profile-view`의 아바타 스켈레톤 |
| 바텀시트 **그래버**(36×4px 바) | 누르는 컨트롤이 아니라 **드래그 어포던스** — 아래로 끌면 시트가 따라 내려간다 | `shared/ui/sheet.tsx` |

⚠ 위의 알약 예외 표와 이 "대상이 아닌 것" 표는 **`pnpm check:conventions`가 대조한다** — 목록에 없는 `rounded-full`이 생기면 검사가 실패한다. 그림자·`backdrop-blur` 예외도 같다.
⚠ 다만 검사가 대조하는 것은 **파일 경로**이고 행 수가 아니다. 여기에 "세 목록"·"4곳" 같은 **개수를 적지 않는다** — 표에 행을 더하면 그 개수가 곧바로 거짓이 된다.

경계가 헷갈리는 대비 선례:

- **`Chip`(말머리)은 `rounded-sm`이다.** "칩이니까 알약"이 아니다. 실제로 같은 화면에서 `Chip`은 6px, `ActionChip`은 알약으로 공존한다.

### 브랜드 버튼 예외 — 소셜 로그인 2개

`views/sign-in/ui/provider-button.tsx`의 카카오·구글 버튼은 **이 디자인 시스템의 통제 밖**이다.
버튼 색·로고·문구를 각 프로바이더의 브랜드 가이드가 강제하고, 카카오는 심사에서 지적 대상이다.

그래서 로그인 화면에서만 두 규칙이 깨진다 — "한 뷰포트당 컬러 이벤트는 에메랄드 1개",
"강한 컬러는 크롬에 금지". **우리가 정할 수 있는 자리가 아니라서 생긴 예외**이고,
다른 화면으로 번지면 안 된다.

| | 가이드가 강제하는 것 | 우리가 정하는 것 |
|---|---|---|
| 카카오 | `#FEE500` 배경 · 검정 85% 텍스트 · 심볼 · "카카오 로그인" | 라운드 6px · 높이 50px · 이징 |
| 구글 | 흰 배경 · `#747775` 1px 테두리 · 4색 G · "Google 계정으로 로그인" | 〃 |

⚠ 로고 SVG는 **각 브랜드 키트가 원본이다.** 배포 전에 공식 자산과 대조한다.
⚠ 색은 토큰이 아니라 arbitrary value로 적는다 — `@theme`에 넣으면 우리 팔레트인 것처럼 보인다.

### 그림자 예외 — "떠 있는 레이어"만

resting 상태의 카드·목록·헤더는 **여전히 flat + 1px 헤어라인**이다. 그림자는 표면 위로 **떠오른** 요소만 갖는다.

| 자리 | 값 |
|---|---|
| `Dialog` | `shadow-[0_16px_48px_rgba(0,0,0,0.12)]` |
| `Sheet` | `shadow-[0_-8px_32px_rgba(0,0,0,0.12)]` — **위로** 던진다(아래는 화면 밖이라 그림자가 갈 곳이 없다) |
| 글쓰기 FAB | `shadow-[0_8px_24px_rgba(0,0,0,0.18)]` |
| `BottomTabBar` | `shadow-[0_12px_32px_rgba(0,0,0,0.18),inset_...]` (blur도 여기만 허용) |

새 그림자를 넣고 싶으면 **"이 요소가 정말 떠 있는가"** 를 먼저 답한다. 카드에 얹고 싶은 거라면 답은 헤어라인이다.

### 바텀시트는 화면 하단에 **붙는다**(edge-to-edge)

`Sheet`는 좌·우·하단 여백 0으로 화면 하단에 붙고 **상단 모서리만** 둥글다(`rounded-t-[20px]`).
한때 프로토타입 `.cm-sheet`를 그대로 옮겨 `inset-x-2 bottom-2 rounded-xl`로 떠 있는 카드였는데,
그 형태는 맨 아래에 "닫기" 행을 요구한다 — 여백이 있으면 스크림을 눌러 닫는다는 것이 읽히지 않아서다.

- 하단 여백 대신 **`pb-[max(8px,env(safe-area-inset-bottom))]`** 로 홈 인디케이터를 피한다
  (`max(고정값, env(safe-area-inset-bottom))` 관용구는 `BottomTabBar`가 선례다 — 그쪽은 `bottom`에 건다).
- 상단에 36×4px **그래버**를 두고, 그 밴드가 실제 드래그 핸들이다 — 끌 수 없는 그래버는
  어포던스 거짓말이다.
- ⚠ **그 밴드는 `button aria-label="닫기"`여야 한다.** 스크림 탭·Escape·스와이프 셋은 전부
  포인터이거나 물리 키보드라 **터치 스크린리더에 닿는 것이 하나도 없다**(스크림·그래버는
  `aria-hidden`이고 `aria-modal`이 바깥을 가린다). 오버플로 메뉴는 남의 글이면 항목이 전부
  `disabled`라 **시트 안 활성 컨트롤이 0개**가 되는데, 그때 이 버튼이 유일한 탈출구다.
  높이도 44px(`py-5` + 바 4px)로 잡는다 — 짚어야 끌 수 있는 띠라 히트 영역 기준을 지킨다.
- 항목 사이에 **헤어라인을 긋지 않는다.** 좌우 여백이 없어 구분선이 화면을 가로지르는 선이 된다.
- ⚠ 라운드 20px은 **서피스** 값이라 "버튼 6px" 규칙과 무관하다(카드 14px · `Dialog` 16px과 같은 계열).
