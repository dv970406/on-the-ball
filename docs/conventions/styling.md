# 스타일 컨벤션 (Tifo 디자인 시스템)

## 토큰

- Tailwind v4 `@theme` 토큰은 `src/app/styles/globals.css`에 정의. **파운데이션 이후 동결** — 새 토큰이 필요하면 arbitrary value로.
- **토큰과 동일한 hex를 하드코딩하지 않는다.**
  - Tailwind 유틸로 표현: `bg-primary`, `text-ink`, `border-hairline` …
  - 알파는 토큰+투명도: `bg-primary/[0.12]` (❌ `bg-[rgba(62,207,142,0.12)]`).
  - 인라인 `style`·SVG 속성에 JS 색이 필요해지면 토큰과 같은 값의 상수를 `@/shared/config`에 **한 곳만** 두고 참조한다. 뷰별 로컬 색 상수 재정의 금지.

## 스타일 적용 방식

### className(Tailwind) + `cn()`이 기본, `style`은 예외

- 모든 스타일은 Tailwind 유틸 클래스로 표현하고, 조건 분기는 `cn()`(`@/shared/lib`)으로 처리한다.
- 토큰으로 표현할 수 없는 특수값은 arbitrary를 쓴다 — `@theme` 블록은 동결이다.
  - arbitrary **value**: `border-[1.5px]`, `tracking-[-0.6px]`, `bg-[linear-gradient(...)]`
  - arbitrary **property**: `[clip-path:polygon(...)]`, `[transform:...]`, `[transition:...]`
- ⚠ **`bg-linear-*` 그라데이션 유틸은 `in oklab` 보간이다.** 프로토타입의 sRGB `linear-gradient(...)`를 그대로 옮길 땐 `bg-[linear-gradient(...)]` arbitrary를 쓴다(중간색이 달라진다).
- ⚠ **`[vertical-align:...]`·`[font-family:...]` arbitrary property는 생성되지 않는다(실측)** — Tailwind가 이미 그 이름의 표준 유틸(`align-*`·`font-*`)을 갖고 있으면 arbitrary property 형태를 스캐너가 인식하지 못한다. 대신 그 표준 유틸에 arbitrary **value**를 준다: `align-[-1px]`·`font-['Apple_Color_Emoji','Segoe_UI_Emoji','Noto_Color_Emoji',sans-serif]`(이적시장 상세의 국기 이모지 폰트 스택이 선례 — `views/transfer-detail/ui/transfer-detail-view.tsx`).
- ⚠ 벤더 prefix는 자동 생성되지 않는다(browserslist 미설정 → Lightning CSS 기본 타깃). 구형 사파리 지원이 필요한 속성은 `[-webkit-clip-path:...]`처럼 병기한다.

### `style` prop이 허용되는 유일한 경우 — 런타임에 결정되는 동적 값

빌드 시점에 클래스 문자열로 확정할 수 없는 값만 `style`에 남긴다.

- DB `meta` jsonb에서 온 색: `style={{ background: meta.tone, color: meta.text }}`
- 계산된 비율: ``style={{ width: `${truePct}%` }}``
- prop으로 받은 px: `style={{ width: size, height: size }}`

**값이 유한한 열거형(tone·side·상태)은 동적이 아니다** — `Record<K, string>` 클래스 맵으로 만든다.
(예: `shared/ui/pill.tsx`의 `PILL_VARIANT`, `shared/ui/button-class.ts`의 `BUTTON_VARIANT`)

CSS 변수를 `style`로 주입해 클래스에서 읽는 패턴(`style={{ "--w": ... }}` + `w-[var(--w)]`)은 쓰지 않는다 — 간접 계층만 늘어난다.

### `CSSProperties`를 반환하는 헬퍼 함수 금지

상태별 스타일은 **className 문자열을 반환하는 함수**나 `cn()` 분기로 표현한다.
선례: `shared/ui/button-class.ts`의 `buttonClassName`, `shared/ui/chip-class.ts`의 `chipClassName`.

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

1. **`@keyframes`와의 합성.** 키프레임이 `transform: translate(-50%,-50%) rotate(-12deg) scale(...)`을 애니메이트하는데 같은 요소에 `-translate-x-1/2`를 얹으면 `translate` 프로퍼티가 **추가로** 적용되어 -50%가 두 번 먹고 위치가 깨진다.
2. **`transition-property` 불일치.** `transition-[transform,opacity]`는 `translate`/`scale`/`rotate` 변화를 **트랜지션하지 않는다**(`transition-transform`만 `transform, translate, scale, rotate`를 전부 커버). `scale-[1.04]`로 바꾸면 애니메이션이 조용히 사라지고 순간이동한다.

```tsx
// ❌
<span className="animate-[pop_300ms] -translate-x-1/2 -translate-y-1/2 rotate-[-12deg]" />
// ✅
<span className="animate-[pop_300ms] [transform:translate(-50%,-50%)_rotate(-12deg)]" />
```

**유일한 예외**: 같은 요소에 animation도, transform을 건드리는 transition도 **없는** 순수 정적 배치는 `-translate-x-1/2 -translate-y-1/2` 센터링을 그대로 써도 된다.
같은 센터링이라도 그 요소에 애니메이션이 붙어 있으면 예외가 아니다 — **애니메이션·트랜지션 유무로 판단**하고, "센터링이니까 표준 유틸"로 판단하지 않는다.

한 요소에 `[transition:...]` arbitrary와 표준 `transition-*` 유틸을 섞지 않는다 — twMerge가 서로 다른 그룹으로 보아 둘 다 남는다.

### 값을 상수로 뺄지 판단하는 기준

`code-quality.md`의 "성급한 추상화보다 중복"을 그대로 적용한다.

1. **`@theme` 토큰 추가 — 하지 않는다**(동결). 여러 슬라이스가 공유하는 디자인 결정이 새로 생겼을 때만 별도 논의.
   선례: 이적시장 결렬 행의 회색 배경은 `bg-[#f3f3f3]`(arbitrary value)다 — 토큰에 없는 값이라 토큰을
   늘리지 않고 인라인으로 둔다(`entities/transfer/ui/deal-row.tsx`).
2. **슬라이스 내부 `Record<K, string>` 클래스 맵** — 판별자(tone·side·상태)가 **이미 있고** 값들이 반드시 함께 바뀔 때만. 새 추상화를 만드는 게 아니라 기존 맵의 값 타입을 바꾸는 수준이어야 한다.
3. 그 외는 전부 **인라인 arbitrary**. 길어도 1회 사용이면 이름을 붙이지 않는다 — 바로 위 한국어 주석이 이미 의미를 설명한다.

## 디자인 규칙 (Tifo)

- **한 화면에서 "눌러야 할 곳"을 가리키는 에메랄드는 하나다.** 나머지는 잉크 그레이 래더.
  - ⚠ **원칙은 이유를 설명할 뿐이고, 판정은 아래 표가 한다.** 브랜드 마크·상태 표시·메타
    액센트는 CTA가 아니라서 이 셈에 들어가지 않는데, 그 경계를 문장으로 그으면 반드시
    갈린다 — 실제로 활성 탭 아이콘(에메랄드)과 선택된 칩(잉크)은 둘 다 선택 상태를 그리는
    컨트롤이라 어떤 원칙으로도 나뉘지 않는다. 그래서 **자리를 센다.**
  - ⚠ **에메랄드가 나타나는 자리는 아래가 전부다.** 새로 칠하려면 이 표와
    `scripts/check-conventions.mjs`의 `bg-primary`·`text-primary` 항목에 함께 적는다 —
    `pnpm check:conventions`가 양방향으로 대조한다(알약·그림자 예외와 같은 장치).

    | 자리 | 무엇 |
    |---|---|
    | `shared/ui/button-class.ts` | `primary` 버튼 — 그 화면의 CTA |
    | `shared/ui/dialog.tsx` | `confirmTone="primary"` 확인 버튼 |
    | `shared/ui/wordmark.tsx` | 워드마크의 볼 — 브랜드 마크 |
    | `shared/ui/pill.tsx` | `green` 배지 |
    | `shared/ui/sign-in-dialog.tsx` | `confirmTone="primary"` — 로그인 안내의 확인 버튼 |
    | `entities/transfer/ui/status-badge.tsx` | 이적시장 오피셜 뱃지 — CTA가 아니라 상태 표시라 이 셈에 들어가지 않고, 글자("오피셜")를 담아 "색이 정보를 혼자 지지 않는다"도 만족한다 |
    | `entities/transfer/ui/watch-mark.tsx` | 이적시장 관심 표시 원(목록 행) — 상태 표시. 글자 대신 종 아이콘(`Bell`, `fill-current`)이 형태를 지고 `sr-only` 텍스트가 스크린리더에 같은 뜻을 준다 |
    | `entities/transfer/ui/fee-delta.tsx` | 이적시장 이적료 상승 화살표(`text-primary-deep`) — 콘텐츠 값의 방향 표시라 CTA 셈에 들어가지 않고, `ArrowUp` 아이콘이 형태를 진다(하락은 `text-crimson`) |
    | `widgets/bottom-tab-bar/ui/bottom-tab-bar.tsx` | 활성 탭 아이콘 |
    | `entities/comment/ui/comment-item.tsx` | 댓글의 `나` 뱃지(`Pill variant="green"`) — 상태 표시라 CTA 셈 밖이고, 글자("나")가 뜻을 진다 |
    | `features/vote-comment/ui/comment-vote-buttons.tsx` | 댓글 좋아요 활성(`text-primary-deep`) — 상태 표시. 누른 쪽 아이콘을 채워(`fill-current`) 형태로도 구분하고 `aria-pressed`가 같은 뜻을 준다 |

    (검사는 **주석을 걷어낸 소스**를 훑는다 — 주석에 적힌 `bg-primary`는 세지 않는다.)

  - ⚠ **리터럴만 세면 새는 자리가 있다.** `Pill variant="green"`은 `bg-primary`를 간접으로 쓰므로 리터럴 대조를 구조적으로 통과할 수 없다 — 실제로 그 경로로 목록 카드에 에메랄드가 카드 수만큼 들어왔는데 검사도 이 표도 알지 못했다. 그래서 `check-conventions.mjs`가 `variant="green"`도 함께 센다. **에메랄드를 감싼 컴포넌트를 새로 만들면 그 prop도 검사에 등재한다.**
  - ⚠ **그마저도 리터럴일 때만 보인다.** `variant={ok ? "green" : …}` 같은 동적 값은 어떤 문자열 대조도 통과하므로, 검사가 **`Pill variant={` 자체를 금지**한다 — 에메랄드가 걸린 prop은 리터럴로 쓴다.

  - ⚠ **색이 정보를 혼자 지지 않는다.** 에메랄드(#3ecf8e)는 흰 배경 대비가 **1.99:1**이라
    WCAG의 비텍스트 최소 3:1에 못 미친다 — 이 색에 **글자나 형태 없는 표시를 싣지 않는다.**
    관심 표시 원이 성립하는 것은 종 아이콘의 채우기(`fill-current`)가 형태를 함께 지기 때문이고,
    오피셜 뱃지는 글자가 뜻을 진다.
  - ⚠ **한 화면에 CTA가 둘이면 나중 것을 잉크로 둔다.** 이적 상세의 댓글 `등록` 버튼이 그 자리다 — 그 화면의
    에메랄드 CTA는 하단 관심 토글이다.
  - ⚠ **목록 항목마다 되풀이되는 에메랄드는 "내 것"처럼 드문 항목에만 붙인다.** 댓글의 `나` 뱃지는 내가 쓴
    댓글에만 뜨므로 목록 전체를 칠하지 않는다 — 모든 항목에 붙는 표시라면 에메랄드가 항목 수만큼 늘어나
    위 "간접으로 새는 자리" 사고가 된다.
- 에메랄드(`bg-primary`) 위 텍스트는 항상 `text-on-primary`(#171717) — **흰색 금지**.
- 버튼은 **6px 라운드**(`rounded-sm`) — pill 버튼 금지. **예외는 아래 표에 못박아 두었다.**
  - ⚠ **버튼을 품은 입력칸은 버튼이 아니라 서피스다** — 댓글 입력칸(`등록` 버튼을 안에 품는다)은 8px(`rounded-md`)이고,
    비로그인에게 같은 모양으로 보여 주는 트리거(`CommentSignInField` — 누르면 로그인 안내)도 입력칸의 치수를
    그대로 쓴다(`COMMENT_FIELD_BOX` 공유). 입력칸처럼 보이는 것이 다른 라운드로 그려지면 다른 컨트롤로 읽힌다.
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
  - ⚠ **끝이 없는 진행 표시(스피너)도 이 시간·이징 규칙의 대상이 아니다** — 시작과 끝이 없어
    감속·가속 커브가 뜻을 갖지 않고, 등속(`linear`)이라 바운스·스프링 금지에도 걸리지 않는다.
    Tailwind 기본 `animate-spin`(1s linear infinite)을 그대로 쓴다.
    - ⚠ **다만 뮤테이션 진행 표시의 기본값이 아니다.** 라벨을 가진 컨트롤은 그 라벨을 바꾸는 것이
      먼저다(`저장 중…`·`로그아웃 중…`) — 무엇이 진행 중인지를 글자가 말해 준다.
      스피너는 **라벨을 둘 자리가 없을 때**만 쓴다: 아이콘만 있는 컨트롤이거나, 진행 중임을
      대상 위에 겹쳐 보여야 하는 자리. 선례는 아바타 업로드(`views/profile/ui/profile-view.tsx`).
    - ⚠ **사진 위에 얹는 스피너는 스크림 없이 성립하지 않는다.** 아래 깔린 것이 사용자가 올린
      이미지라 밝기를 가정할 수 없다 — 순백 사진 위 흰 링의 대비는 `bg-ink/40`에서 **1.6:1**로
      비텍스트 최소 3:1에 한참 못 미쳐 링이 묻힌다. `bg-ink/75`가 3.4:1로 그 선을 넘는 지점이다.
  - ⚠ **등장 모션은 "늦게 도착하는 것"에만 건다.** 사용자의 행동 뒤에 열리는 결과, 이동으로 새로
    그려지는 구역이 대상이고 **SSR로 이미 그려진 HTML에는 걸지 않는다** — 첫 페인트를 늦추고
    숫자 카운트업이 서버 HTML과 어긋난다. 판정은 "하이드레이션 이후에 마운트됐는가"로 하고, 그 판정을
    화면마다 다시 짜지 않고 한 곳에 둔다. **목록 전체에 스태거를 거는 것은 이 규칙의 반대편이다** —
    목록은 SSR이고 스크롤 복원이 있어 뒤로가기마다 재생된다.
  - ⚠ **실패에는 모션을 주지 않는다.** 강조할 감정이 아니고, 흔들기류는 오버슛이라 어차피 규약 밖이다.
  - ⚠ **transform을 애니메이트하는 키프레임은 표준 translate/scale 유틸이 있는 요소에 얹지 않는다**
    (위 transform 절의 합성 사고). 센터링이 필요한 요소는 **안쪽 래퍼**에 애니메이션을 건다.
    키프레임은 `globals.css`에 일반 `@keyframes`로 두고 arbitrary 유틸로 소비한다(`@theme`는 동결).
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

### 파선 테두리는 "아직 없는 것을 더하는 자리"에만

`border-dashed`는 헤어라인 규칙의 예외가 아니라 **의미가 다른 선**이다 — 실선 헤어라인이
"여기까지가 이 구조"를 그린다면, 파선은 **비어 있고 채울 수 있는 자리**를 그린다.
그래서 "선택지 추가"처럼 **누르면 항목이 하나 생기는 컨트롤**에만 쓴다.

⚠ 카드·입력창·구분선을 파선으로 바꾸지 않는다. 그 자리에서 파선은 "미완성"으로 읽힌다.

### 알약(`rounded-full`) 예외

프로토타입 치수를 그대로 옮긴 자리를 여기 적는다. **이 목록에 없으면 `rounded-sm`이다.**

| 자리 | 파일 |
|---|---|
| (지금은 없다) | — |

⚠ 알약 컨트롤을 새로 두려면 이 표와 `scripts/check-conventions.mjs`의 `STYLE_ALLOWED["rounded-full"]`에
**함께** 적는다 — 한쪽만 적으면 검사가 실패한다.

**이 규칙이 말하는 "버튼"은 라벨을 담은 직사각형 컨트롤이다.** 그 밖의 `rounded-full`은 애초에 이 규칙의 대상이 아니므로 예외 목록에 넣지 않는다:

| 대상이 아닌 것 | 이유 | 실제 위치 |
|---|---|---|
| `size-11`/`size-9` 원형 아이콘 **버튼** | 버튼 라운드가 아니라 **원형 히트 영역** | `sub-header` · `profile-view`(사진 변경) |
| 원형 아이콘 **컨테이너**(클릭 불가) | 히트 영역도 아닌 순수 장식 | `shared/ui/empty-state.tsx` |
| 아바타·`Pill`(과 그 도트)·워드마크의 볼 | 컨트롤이 아닌 **표시 요소** | `avatar` · `pill` · `wordmark` · `profile-view`의 아바타 스켈레톤·업로드 스피너 |
| 바텀시트 **그래버**(36×4px 바) | 누르는 컨트롤이 아니라 **드래그 어포던스** — 아래로 끌면 시트가 따라 내려간다 | `shared/ui/sheet.tsx` |
| 이적시장 **상태 뱃지**·**관심 표시 원**·**결렬 X 원·부인 빗금 원**·**보도 타임라인 점** | 누르는 컨트롤이 아니라 상태·경로·시간순을 그리는 표시 요소다 | `entities/transfer/ui/status-badge.tsx` · `watch-mark.tsx` · `club-route.tsx` · `views/transfer-detail/ui/report-timeline.tsx` |

⚠ 위의 알약 예외 표와 이 "대상이 아닌 것" 표는 **`pnpm check:conventions`가 대조한다** — 목록에 없는 `rounded-full`이 생기면 검사가 실패한다. 그림자·`backdrop-blur` 예외도 같다.
⚠ 다만 검사가 대조하는 것은 **파일 경로**이고 행 수가 아니다. 여기에 "세 목록"·"4곳" 같은 **개수를 적지 않는다** — 표에 행을 더하면 그 개수가 곧바로 거짓이 된다.

경계가 헷갈리는 대비 선례:

- **칩(`chipClassName`)은 `rounded-sm`이다.** "칩이니까 알약"이 아니다 — 이적 보드의 구간 칩이 6px이다.

### 콘텐츠가 정하는 색은 크롬 규칙 밖이다

면·배지의 색을 **데이터가 정하는** 자리(DB에서 온 색, 구단·국가 색)는 "한 뷰포트당 에메랄드 1개"와
부딪혀 보이지만, 그 규칙이 막는 것은 **크롬**의 색이고 여기 색은 콘텐츠 자체다 —
"강한 컬러는 콘텐츠로만 허용"에 해당한다.

- 다만 **크롬(버튼·네비·헤더)의 에메랄드 1개 규칙은 그대로다.** 콘텐츠 바깥에 에메랄드를 더하지 않는다 —
  색 있는 콘텐츠와 같은 층의 액션 버튼은 `dark`·`secondary`를 쓴다. 스크림 위로 뜬 `Dialog`는 층이
  달라 따로 센다.
- ⚠ 색은 `style`로 준다 — DB에서 오는 런타임 값이라 클래스로 확정할 수 없다(위 "동적 값" 규칙).

#### ⚠ clip-path 도형은 **완성된 클래스 문자열**로 둔다

도형을 `[clip-path:polygon(...)]` 클래스로 그릴 때는 그 문자열을 **통째로** 맵에 담는다.
Tailwind는 소스 텍스트에서 클래스 후보를 훑으므로 `` `[clip-path:${x}]` ``처럼 런타임에
조립하면 **그 유틸이 아예 생성되지 않아 도형이 통짜 사각형으로 나온다** — 빌드는 조용히 통과한다.
arbitrary 값 안의 공백은 `_`로 쓴다. 값이 정말 런타임이면(비율에 따라 움직이는 좌표) 그 부분만 `style`로 준다.

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
  `aria-hidden`이고 `aria-modal`이 바깥을 가린다). 항목이 전부 `disabled`인 메뉴라면
  **시트 안 활성 컨트롤이 0개**가 되는데, 그때 이 버튼이 유일한 탈출구다.
  높이도 44px(`py-5` + 바 4px)로 잡는다 — 짚어야 끌 수 있는 띠라 히트 영역 기준을 지킨다.
- 항목 사이에 **헤어라인을 긋지 않는다.** 좌우 여백이 없어 구분선이 화면을 가로지르는 선이 된다.
- ⚠ 라운드 20px은 **서피스** 값이라 "버튼 6px" 규칙과 무관하다(카드 14px · `Dialog` 16px과 같은 계열).
