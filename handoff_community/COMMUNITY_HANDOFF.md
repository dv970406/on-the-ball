# 온더볼 커뮤니티 — 구현 지침 (에이전트용)

이 문서는 프로토타입 `온더볼 커뮤니티.html`을 실제 제품 코드로 옮길 때 그대로 따르면 되는 명세다.
대상: **로그인 · 글 목록 · 글 상세 · 글 생성/수정.** 모바일 전용(375–430px). 스택은 **Tailwind CSS 기반** — 토큰 매핑과 유틸리티 레시피는 6장.

시작 전에 반드시: **프로토타입 소스를 직접 열어라.** `app/community.css`와 `app/screen-community-*.jsx`가 모든 수치의 원본이다.
**프로토타입이 진실의 원본이다.** 애매한 부분은 명세 → 프로토타입 코드 → 이 문서의 원칙 순으로 판단한다.
구현이 끝나면 **9장 체크리스트를 전부 통과해야 한다.**

## 0. 지켜야 할 것 / 하지 말 것

지켜야 할 것
- 모든 색·radius·간격·타이포는 `design/colors_and_type.css`의 CSS 변수만 사용한다. 새 색을 만들지 않는다. **Tailwind 프로젝트에서는 6-1의 테마 매핑으로 등록해서 유틸리티로 쓴다.**
- **한 화면에 컬러 이벤트 1개.** emerald(`--primary`)는 화면당 한 곳에만 쓴다.
  - 목록 = 없음(글쓰기 버튼은 잉크 블랙)
  - 작성/수정 = `등록` 버튼
  - 상세 = 좋아요 활성 상태
  - 로그인 = 없음 (카카오 옐로우는 카카오 브랜드 규정상 예외)
- 카드/행의 구조는 **1px 헤어라인**으로만 만든다. 기본 상태에 그림자 없음.
- 버튼 radius는 `--radius-sm`(6px). **알약형 버튼 금지** — 예외는 카운터형 액션 칩(`.cm-act`), 댓글 입력창, 플로팅 글쓰기 버튼뿐이다.
- emerald 위 글자는 `--on-primary`(#171717). 흰 글자 금지.
- 모션은 페이드/불투명도 위주, `cubic-bezier(0.2,0,0,1)`, 상태 150ms · 레이아웃 200ms · 모달 250~350ms. **스프링·바운스·스케일 금지.**
- `prefers-reduced-motion` 존중.
- 한국어 카피는 프로토타입 문구를 그대로 쓴다. 임의로 다시 쓰지 않는다.

하지 말 것
- 그라디언트 배경, 글래스모피즘(탭바 제외), 블러 처리된 모달 배경(모달 스크림은 `rgba(23,23,23,.5)` 불투명).
- display 굵기를 600 초과로 올리는 것.
- 아이콘으로 이모지/유니코드 문자 사용. 아이콘은 전부 **Lucide**, 스트로크 1.5px, 16/20/24px.
- 새로운 accent 색을 시스템 색으로 승격. `--accent-crimson`은 HOT 배지와 파괴적 액션에만.

## 1. 토큰 (자주 쓰는 값)

| 용도 | 토큰 | 값 |
|---|---|---|
| 강조 | `--primary` / `--primary-deep` | #3ecf8e / #24b47e |
| emerald 위 글자 | `--on-primary` | #171717 |
| 본문 | `--ink` / `--ink-secondary` | #171717 / #212121 |
| 보조·캡션 | `--ink-mute` / `--ink-mute-2` / `--ink-faint` | #707070 / #9a9a9a / #b2b2b2 |
| 면 | `--canvas` / `--canvas-soft` | #ffffff / #fafafa |
| 선 | `--hairline` / `--hairline-cool` / `--hairline-strong` | #dfdfdf / #ededed / #c7c7c7 |
| 위험 | `--accent-crimson` | #e2005a |
| radius | `xs/sm/md/lg/xl/full` | 4 / 6 / 8 / 12 / 16 / 9999 |
| 그림자 | `--shadow-2` / `--shadow-3` | 카드 hover / 모달 |

폰트: `--font-display`, `--font-body` = Pretendard(로컬 woff2), `--font-mono` = JetBrains Mono.
**숫자는 전부 mono + tabular-nums.** 좋아요/조회/댓글 수, 타이머, 코드 입력칸, `12 POSTS` 같은 메타 라벨이 해당한다. 천 단위 콤마 필수(`12,480`).

## 1-B. 실행 환경 · 프로토타입 전용 요소

### 프로토타입 실행
정적 파일이다. 루트에서 `python3 -m http.server 8000` 후 `http://localhost:8000/온더볼 커뮤니티.html`. React 18 + Babel standalone을 CDN에서 로드하므로 빌드 단계가 없다. **파일에서 직접 열면(`file://`) 폰트와 JSX 로드가 막힌다.**

### 폰트
- Pretendard Variable: `design/fonts/PretendardVariable.woff2` (weight 100–900 variable). 프로덕션에도 이 파일을 그대로 셀프호스팅한다. CDN·Google Fonts 대체 금지.
- JetBrains Mono: `colors_and_type.css`가 Google Fonts에서 import(400/500). 프로덕션에서는 셀프호스팅으로 바꿔도 된다.
- `font-display: swap`, Pretendard는 preload 권장.

### 프로토타입 전용 (프로덕션에 옮기지 말 것)
- `ios-frame.jsx` — 디바이스 베젤·노치·홈 인디케이터. **실제 앱에는 존재하지 않는다.**
- `.otb-stage`, `.otb-stage-meta` — 프레임 바깥 캡션.
- 화면 상단의 `padding-top: 60px` (`.cm-head`, `.otb-bar`) — 노치를 피하기 위한 값. 프로덕션에서는 `env(safe-area-inset-top)`으로 대체한다.
- 하단 고정 바의 `padding-bottom: 30px` — 홈 인디케이터 자리. `env(safe-area-inset-bottom)`으로 대체.
- `image-slot.js` (드래그&드롭 이미지 슬롯) — 실제 업로더로 교체.
- `app/community-data.jsx` 시드 데이터 — API로 교체.

### z-index 스케일 (충돌 방지용, 그대로 유지)
```
 5  앱바 (스티키)
20  서브페이지 헤더 (스티키)
60  하단 고정 바 (툴바 / 댓글 입력)
66  플로팅 글쓰기 버튼
70  하단 탭바
80  모달 스크림
81  바텀시트
82  다이얼로그
95  토스트
```

### 하단 탭바 (`.otb-tabbar`, 기존 앱 공용)
좌우 12px·하단 18px 띄운 다크 알약. 배경 `rgba(23,23,23,.92)` + `backdrop-blur(20px) saturate(160%)`, radius 28px, 패딩 8px, `0 12px 32px rgba(0,0,0,.18)` + `inset 0 0 0 1px rgba(255,255,255,.06)`.
탭 5개: 홈(`home`) · 밸런스(`split-square-vertical`) · 커뮤니티(`messages-square`) · TMI(`flame`) · 내 활동(`user`). 아이콘 20px + 라벨 10px/500. 비활성 `rgba(255,255,255,.55)`, 활성은 흰 글자 + `rgba(255,255,255,.08)` 배경 + **아이콘만 emerald**.
※ 탭바의 blur는 이 시스템에서 허용된 유일한 반투명 요소다.

### 아이콘 인벤토리 (Lucide, 전부 이 이름 그대로)
`search` `bell` `pen-line` `flame` `heart` `message-circle` `chevron-left` `chevron-right` `share-2` `more-horizontal` `bookmark` `bookmark-check` `corner-down-right` `x` `plus` `image` `bar-chart-2` `link` `hash` `pencil` `trash-2` `bell-off` `user-x` `flag` `arrow-up` `arrow-right` `home` `split-square-vertical` `messages-square` `user`

소셜 로그인 아이콘은 Lucide에 없으므로 `app/screen-login.jsx`의 인라인 SVG(카카오·Apple·Google)를 그대로 가져간다. 카카오/Apple 글리프는 `#171717` 단색, Google은 4색 공식 마크.

### 접근성 / 터치
- 모든 탭 가능 요소의 실제 히트 영역 최소 **44×44px**. 시각적으로 작은 아이콘 버튼(예: 22px 슬롯 삭제 버튼)은 투명 패딩으로 44px를 확보한다.
- 아이콘 단독 버튼에는 `aria-label` 필수(검색, 알림, 공유, 더보기, 저장, 전송, 슬롯 삭제).
- 시트·다이얼로그는 열릴 때 포커스 트랩, `Escape`로 닫힘, 닫힐 때 트리거로 포커스 복귀.
- 다이얼로그는 `role="alertdialog"` + `aria-modal`, 시트는 `role="dialog"`.
- 스크림 클릭으로 닫힘 — 단 삭제 다이얼로그도 동일하게 취소 처리(파괴적 액션이 기본값이 되지 않게).
- 좋아요·저장 토글은 `aria-pressed`.
- 본문 텍스트 최소 13px. 그 아래(11/10px)는 mono 메타 라벨에만.

## 2. 화면 명세

### 2-1. 로그인 (`app/screen-login.jsx`)

3단계 상태 머신: `main` → `email` → `code`.

**main**
- 상단 여백 크게, 워드마크 → 헤드라인(30px/500/-1px) → 서브(14px, `--ink-mute`).
- 소셜 버튼 3개, 높이 50px, radius 6px, 세로 8px gap. 순서 고정: **카카오 → Apple → Google.**
  - 아이콘은 좌측 16px 절대 위치, 라벨은 중앙 정렬.
  - 카카오만 배경 `#FEE500`. Apple/Google은 `--hairline-strong` 보더 + 흰 배경. press 시 보더가 `--ink`로.
  - 최근 사용한 수단에 우측 `최근 사용` 마이크로 라벨(mono 9px, `--ink-faint`). 실제 구현에서는 로컬 저장값으로 결정.
- `또는` 구분선(mono 10px, 양쪽 헤어라인).
- 이메일로 계속하기 = 인풋 모양의 행 + 우측 `arrow-right`.
- `먼저 둘러볼게요` = 게스트 진입, 밑줄 텍스트 버튼.
- 하단 법적 문구 11px, 약관/개인정보는 밑줄 링크.

**email** — 뒤로 버튼 헤더, `이메일로 / 계속하기` 헤드라인, 인풋 1개, 하단 고정 `인증 코드 받기`(emerald, `@` 없으면 disabled 40% opacity).

**code** — 6칸 코드 박스(56px 높이, mono 20px). 현재 입력 위치 칸만 보더 `--ink`. 실제 인풋은 시각적으로 숨기고 숫자만 받는다(`inputMode="numeric"`, 6자리 제한). 재전송 타이머 mono + `코드 다시 받기` 텍스트 버튼. 6자리 채워지면 `확인` 활성화.

구현 노트: 패스워드리스(OTP)만 지원. 비밀번호 필드를 추가하지 않는다. 소셜 성공/게스트/코드 검증 모두 목록으로 진입.

### 2-2. 목록 (`app/screen-community-list.jsx`)

- 스티키 앱바(높이 64+ 상태바 여백, 흰 배경, 하단 헤어라인): 워드마크 + 검색/알림 원형 아이콘 버튼.
- 페이지 헤드: `커뮤니티` 26px/500/-0.9px + `오늘 1,284개의 글이 올라왔어요`(숫자만 mono).
- 말머리 칩 레일(가로 스크롤, 스크롤바 숨김): `전체 · 이적설 · 경기 · 선수 · 유니폼 · 잡담`. 선택 시 `--ink` 배경 + 흰 글자, radius 6px.
- 정렬 행: `최신 / 인기 / 댓글순` 텍스트 토글 + 우측 `N POSTS`(mono 10px). 하단 헤어라인.
- 글 행(`.cm-post`): 좌측 텍스트 / 우측 72×72 썸네일.
  - 말머리(mono 10px, uppercase, `--ink-mute-2`) + HOT 배지(`flame` 11px, crimson, 조건부)
  - 제목 15px/500/-0.3px, 최대 2행 클램프 아님(제목은 전체 표시)
  - 발췌 13px `--ink-mute`, **2행 클램프**
  - 메타: 작성자 · 시간 · 좋아요 · 댓글. 구분자는 2px 점(`--hairline-strong`).
  - 썸네일은 **이미지가 있을 때만** 렌더. 이미지가 없는 자리에 빈 박스를 두지 않는다. 프로토타입에서는 중립 스와치(`--canvas-soft` + Lucide `image` 18px, `--ink-faint`) — 실제 구현에서는 `object-fit:cover` 이미지로 교체.
  - press 시 배경만 `--canvas-soft`. translate/scale 없음.
- 피드 끝 `END OF FEED`(mono 10px, `--ink-faint`, 중앙). 실제로는 무한 스크롤 + 로딩 스켈레톤으로 대체 가능.
- 플로팅 글쓰기 버튼: 우하단, 탭바 위 100px, 높이 44px, `--ink` 배경, `pen-line` + `글쓰기`, `0 8px 24px rgba(0,0,0,.18)`.
- 하단 탭바는 기존 앱과 동일한 다크 알약형(`.otb-tabbar`). 커뮤니티 탭 활성.

### 2-3. 작성 / 수정 (`app/screen-community-editor.jsx`)

**같은 컴포넌트로 두 모드를 처리한다.** `post` prop이 있으면 수정 모드.

헤더(스티키): 좌 `취소` 텍스트 버튼 · 중앙 제목(`글쓰기` / `글 수정`, 절대 위치 중앙, `pointer-events:none`) · 우 emerald 버튼(`등록` / `수정 완료`).

본문
1. 말머리 칩(전체 제외) — **필수**. 미선택 시 아래에 `말머리를 하나 골라 주세요`(11px, `--ink-faint`).
2. 제목 인풋 — 보더 없음, 24px/500/-0.7px, 최대 60자 하드 컷.
3. 헤어라인 구분선.
4. 본문 textarea — 보더 없음, 15px/1.65, **자동 높이 확장**(`scrollHeight` 반영), 최소 180px. placeholder는 2행:
   `무슨 얘기를 나눌까요?` / `소문이면 출처를 같이 적어주면 좋아요.`
5. 사진 슬롯 — 3열 그리드, 1:1, 최대 6장. 각 타일 우상단에 22px 삭제 버튼(`--ink` 원, 흰 X, 2px 흰 보더). 마지막에 점선 추가 타일(`N/6`). 슬롯이 0개면 그리드 자체를 렌더하지 않는다.
6. 임시저장 캡션 — 입력이 생긴 뒤 약 900ms 디바운스로 `임시저장됨 · 방금`(mono 10px, `--ink-faint`). 실제 구현에서는 서버/로컬 드래프트 저장 시각을 표시.

하단 고정 툴바(높이 38px 아이콘 4개 + 하단 세이프에어리어 30px): `image · bar-chart-2(투표 첨부) · link · hash`, 우측에 `N / 2,000` 카운터(mono). 상단 헤어라인.

등록 활성 조건: 말머리 선택 && 제목 2자 이상 && 본문 5자 이상. disabled는 opacity 0.4 + pointer-events none.

이탈 방어: **생성 모드에서** 입력이 있으면 `취소` 시 다이얼로그 — `작성을 그만둘까요? / 지금까지 쓴 내용은 임시저장함에 남겨둘게요.` · [계속 쓰기] [나가기(잉크 블랙)]. 수정 모드는 바로 상세로 복귀.

제출 후: 생성 → 목록 최상단에 추가 + `글을 올렸어요` 토스트. 수정 → 상세로 복귀 + `수정했어요` 토스트.

### 2-4. 상세 (`app/screen-community-detail.jsx`)

헤더: 뒤로(`chevron-left` 22px) · 말머리 텍스트 · 우측 `share-2` + `more-horizontal`.

본문 영역
- 말머리 pill + HOT 배지
- 제목 23px/500/-0.7px, `text-wrap:pretty`
- 작성자 행: 34px 아바타 · 닉네임 13px/500 · `시간 · 조회 12,480`(mono 10px) · 우측 `팔로우` secondary sm 버튼
- 본문 단락 15px/1.7 `--ink-secondary`, 단락 간 15px
- 본문 이미지: 16:9, radius 12px, 1px 헤어라인
- 태그: `#태그` 칩, 12px, `--canvas-soft` 배경, radius 4px

액션 바(위아래 헤어라인)
- 좋아요 칩: `heart` + 카운트. 활성 시 배경 emerald + `--on-primary`. **이 화면의 유일한 컬러 이벤트.**
- 댓글 칩: `message-circle` + 총 댓글 수(답글 포함)
- 우측 저장(`bookmark` ↔ `bookmark-check`) — 보더 없는 아이콘, 토글 시 토스트

댓글
- 헤더 `댓글` + 총 개수(mono, `--primary-deep`)
- 최상위 댓글: 28px 아바타, 닉네임 12px, 작성자면 `작성자` 배지(뉴트럴), 내 댓글이면 `내 댓글` 배지(emerald 톤). 시간 우측 mono 10px.
- 본문 14px/1.6, 액션 행: 좋아요(활성 시 `--primary-deep`) · `답글` · 내 댓글이면 우측 `삭제`
- 답글: **1단계까지만.** 좌측 패딩 44px + 배경 `--canvas-soft`, 아바타 24px. 답글에는 `답글` 버튼 없음.
- 대댓글 UI(2단계 이상)를 만들지 않는다. 언급으로 해결한다.

하단 고정 댓글 입력: 알약형 인풋(높이 40px, `--canvas-soft`, 포커스 시 보더 `--ink` + 흰 배경) + 40px 원형 전송 버튼(`arrow-up`, 빈 값이면 disabled). 답글 모드면 입력창 바로 위에 `↳ {닉네임} 에게 답글` 바 + X.

오버플로 시트(`···`)
- 내 글: `수정하기` / `삭제하기`(crimson) / `닫기`
- 남의 글: `이 글 알림 끄기` / `{작성자} 차단하기` / `신고하기`(crimson) / `닫기`
- 시트는 좌우 8px 여백, radius 16px, `--shadow-3`, 아래에서 16px 페이드업.

삭제 확인 다이얼로그: `이 글을 삭제할까요?` / `댓글 N개도 같이 사라져요. 되돌릴 수 없습니다.` · [취소] [삭제(crimson 배경, 흰 글자)]. 확인 시 목록으로 이동 + `글을 삭제했어요` 토스트.
댓글 삭제는 다이얼로그 없이 즉시 + `댓글을 삭제했어요` 토스트. (실제 구현에서는 Undo 토스트를 권장.)

## 3. 내비게이션 · 상태

```
login ──▶ list ──▶ detail ──▶ editor(수정) ──▶ detail
            └────▶ editor(생성) ──▶ list
```
- 화면 전환 시 스크롤 최상단으로 리셋.
- 탭바는 **목록에서만** 보인다. 상세/작성/로그인은 풀스크린(하단이 각자의 고정 바에 쓰이므로).
- 토스트는 1.8초 후 자동 소멸, 탭바가 있으면 bottom 112px / 없으면 40px.

## 4. 데이터 모델

```ts
type Post = {
  id: string; cat: '이적설'|'경기'|'선수'|'유니폼'|'잡담';
  title: string; body: string[];        // 단락 배열
  excerpt: string;                      // 목록용, body[0]에서 파생
  author: string; avatar: string; time: string;
  likes: number; comments: number; views: number;
  thumb: boolean; hot?: boolean; mine: boolean; tags: string[];
};
type Comment = {
  id: string; author: string; avatar: string; time: string;
  text: string; likes: number; liked: boolean;
  mine: boolean; op?: boolean;          // op = 글 작성자
  replies: Comment[];                   // 깊이 1까지만
};
```
- `mine`은 서버에서 내려주는 소유권 플래그. 수정/삭제 UI 노출은 전부 이 값으로 결정.
- 시간은 피드에서 상대 시간(`12분 전`), 절대 타임스탬프를 노출하지 않는다.

필요한 엔드포인트: 목록(카테고리·정렬·페이지네이션), 상세, 생성, 수정, 삭제, 좋아요 토글, 저장 토글, 댓글 목록/생성/삭제/좋아요, 이미지 업로드, OTP 요청/검증, 소셜 OAuth 콜백.

## 5. 파일 지도

| 파일 | 내용 |
|---|---|
| `온더볼 커뮤니티.html` | 엔트리. 스크립트 로드 순서 유지 |
| `design/colors_and_type.css` | 토큰 + `@font-face`. **수정하지 말 것** |
| `design/fonts/PretendardVariable.woff2` | 본문·display 폰트 |
| `image-slot.js` | 프로토타입용 이미지 드롭 슬롯 (교체 대상) |
| `ios-frame.jsx` | 프로토타입용 디바이스 베젤 (이식 안 함) |
| `app/styles.css` | 앱 셸·탭바·버튼·pill·아바타 공용 |
| `app/community.css` | 커뮤니티 전용 클래스(`.cm-*`) |
| `app/community-data.jsx` | 시드 데이터 |
| `app/screen-login.jsx` | 로그인 3단계 |
| `app/screen-community-list.jsx` | 목록 |
| `app/screen-community-editor.jsx` | 작성/수정 |
| `app/screen-community-detail.jsx` | 상세 + 댓글 |
| `app/community-main.jsx` | 셸·라우팅·토스트 |

프로덕션은 **Tailwind 기반**이다. `.cm-*` CSS를 그대로 옮기는 대신 6-1의 토큰 매핑으로 유틸리티를 쓴다. 단, 프로토타입 대조가 가능하도록 각 컴포넌트 루트에 원래 클래스명을 `data-cm="post"` 같은 속성으로 남긴다.

## 6. Tailwind 구현 규칙

### 6-1. 테마 설정

토큰은 **Tailwind 테마로 등록해서 유틸리티로 쓴다.** 임의의 `bg-[#3ecf8e]` 같은 arbitrary value를 코드에 흘리지 않는다.

Tailwind v4 (`app.css`):

```css
@import "tailwindcss";

@theme {
  --color-primary: #3ecf8e;
  --color-primary-deep: #24b47e;
  --color-on-primary: #171717;
  --color-ink: #171717;
  --color-ink-secondary: #212121;
  --color-ink-mute: #707070;
  --color-ink-mute-2: #9a9a9a;
  --color-ink-faint: #b2b2b2;
  --color-canvas: #ffffff;
  --color-canvas-soft: #fafafa;
  --color-hairline: #dfdfdf;
  --color-hairline-cool: #ededed;
  --color-hairline-strong: #c7c7c7;
  --color-crimson: #e2005a;
  --color-kakao: #fee500;

  --radius-xs: 4px;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;

  --font-display: "Pretendard", "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif;
  --font-body: "Pretendard", "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, Menlo, Monaco, monospace;

  --shadow-lift: 0 8px 24px rgba(0,0,0,.08);
  --shadow-modal: 0 16px 48px rgba(0,0,0,.12);
  --shadow-float: 0 8px 24px rgba(0,0,0,.18);

  --ease-brand: cubic-bezier(.2,0,0,1);
}
```

v3라면 같은 값을 `theme.extend.colors / borderRadius / fontFamily / boxShadow / transitionTimingFunction`에 넣는다. 키 이름은 위와 동일하게 유지한다.

타이포는 유틸리티 조합으로 처리한다(별도 텍스트 프리셋을 만들지 않는다):
- 페이지 타이틀 `font-display text-[26px] font-medium tracking-[-0.9px]`
- 상세 제목 `font-display text-[23px] font-medium tracking-[-0.7px] leading-[1.32] text-pretty`
- 목록 제목 `font-display text-[15px] font-medium tracking-[-0.3px] leading-[1.4]`
- 본문 `text-[15px] leading-[1.7] text-ink-secondary`
- 메타/캡션 `text-[11px] text-ink-mute-2`
- 숫자 `font-mono text-[10px] tabular-nums`

### 6-2. 컴포넌트 레시피

프로토타입 클래스 → Tailwind 대응. 이 조합을 그대로 쓴다.

```
/* 칩 .cm-chip */
shrink-0 rounded-sm border border-hairline bg-canvas px-[13px] py-[9px]
font-display text-[13px] font-medium leading-none text-ink-mute
transition-colors duration-150 ease-brand
  선택: bg-ink border-ink text-white

/* 글 행 .cm-post */
flex gap-3 border-b border-hairline-cool px-5 py-4
transition-colors duration-150 ease-brand active:bg-canvas-soft

/* 썸네일 .cm-post-thumb */
size-[72px] shrink-0 overflow-hidden rounded-md border border-hairline
bg-canvas-soft grid place-items-center text-ink-faint

/* 기본 버튼 (emerald) */
rounded-sm bg-primary px-[18px] py-[14px] font-display text-[15px]
font-medium text-on-primary active:bg-primary-deep
disabled:opacity-40 disabled:pointer-events-none

/* 세컨더리 버튼 */
rounded-sm border border-hairline-strong bg-canvas px-[18px] py-[14px]
font-display text-[15px] font-medium text-ink
transition-colors duration-150 ease-brand active:border-ink

/* 액션 칩 .cm-act (알약 예외) */
inline-flex h-9 items-center gap-1.5 rounded-full border border-hairline
bg-canvas px-[13px] font-mono text-xs text-ink-secondary
transition-colors duration-150 ease-brand
  활성: bg-primary border-primary text-on-primary

/* 플로팅 글쓰기 버튼 .cm-write */
absolute right-4 bottom-[100px] z-[66] inline-flex h-11 items-center gap-1.5
rounded-full bg-ink pl-[13px] pr-4 font-display text-sm font-medium
text-white shadow-float

/* 답글 .cm-cmt.is-reply */
border-b border-hairline-cool bg-canvas-soft py-3.5 pl-11 pr-5

/* 스크림 / 시트 / 다이얼로그 */
scrim:   absolute inset-0 z-80 bg-ink/50
sheet:   absolute inset-x-2 bottom-2 z-[81] overflow-hidden rounded-xl
         bg-canvas shadow-modal
dialog:  absolute inset-x-6 top-1/2 z-[82] -translate-y-1/2 rounded-xl
         bg-canvas p-[24px_22px_16px] shadow-modal
toast:   absolute bottom-[112px] left-1/2 z-[95] -translate-x-1/2 rounded-sm
         bg-ink/95 px-4 py-[11px] text-[13px] text-white

/* 하단 고정 바 (툴바 / 댓글 입력) */
absolute inset-x-0 bottom-0 z-[60] flex items-center gap-1 border-t
border-hairline-cool bg-canvas px-3.5 pt-2.5 pb-[30px]

/* 제목 인풋 .cm-ed-title */
w-full border-0 bg-transparent p-0 font-display text-2xl font-medium
tracking-[-0.7px] text-ink outline-none placeholder:text-ink-faint

/* 본문 textarea .cm-ed-body */
w-full resize-none border-0 bg-transparent p-0 text-[15px] leading-[1.65]
text-ink-secondary outline-none placeholder:text-ink-faint min-h-[180px]
```

### 6-3. Tailwind 사용 규칙

- **arbitrary color 금지.** `bg-[#...]`, `text-[#...]`는 쓰지 않는다. 색은 반드시 테마 키로. (arbitrary *크기* 값 `text-[15px]`, `pl-11` 등은 허용 — 위 레시피가 그 예다.)
- `rounded-full`은 카운터 칩·아바타·댓글 입력창·플로팅 버튼에만. 일반 버튼은 `rounded-sm`.
- `shadow-*`는 시트/다이얼로그/플로팅 버튼/떠 있는 카드에만. 목록 행·카드는 보더만.
- `backdrop-blur`는 기존 하단 탭바에서만 유지. 모달 스크림·헤더에는 쓰지 않는다.
- hover는 데스크톱 전용으로 취급하고, 모바일 상태는 `active:` 로 표현한다. `active:scale-*` 금지.
- 트랜지션은 항상 `transition-colors duration-150 ease-brand` 형태. `transition-all` 금지.
- `motion-reduce:transition-none`을 상태 전환 요소에 붙인다.
- 조건부 클래스는 `clsx`/`cva`로 관리하고, 같은 속성을 두 군데서 덮어쓰지 않는다.
- 12개 이상 유틸리티가 붙는 요소는 컴포넌트로 분리한다. `@apply`는 쓰지 않는다.

## 7. 아직 구현하지 않은 것 (프로토타입에서 비활성)

검색, 알림, 팔로우, 투표 첨부, 링크 첨부, 해시태그 입력, 신고/차단 처리, 무한 스크롤, 이미지 라이트박스, 임시저장함 목록. 버튼은 자리만 잡혀 있으니 임의로 동작을 발명하지 말고 별도로 스펙을 받는다.

## 8. 카피 인벤토리 (그대로 사용, 재작성 금지)

| 위치 | 문구 |
|---|---|
| 로그인 헤드라인 | 축구 얘기는 / 여기서 끝까지. |
| 로그인 서브 | 이적설부터 유니폼 취향까지, / 거들 자리를 만들어 뒀어요. |
| 소셜 버튼 | 카카오로 계속하기 / Apple로 계속하기 / Google로 계속하기 |
| 구분선·부가 | 또는 · 이메일로 계속하기 · 최근 사용 · 먼저 둘러볼게요 |
| 법적 문구 | 계속하면 이용약관과 개인정보 처리방침에 동의하는 것으로 봅니다. |
| 이메일 단계 | 이메일로 / 계속하기 · 비밀번호는 없어요. 코드로 로그인합니다. · 인증 코드 받기 |
| 코드 단계 | 인증 코드를 / 입력해 주세요 · {email} 으로 6자리 코드를 보냈어요. · 코드 다시 받기 · 확인 |
| 목록 | 커뮤니티 · 오늘 1,284개의 글이 올라왔어요 · 최신 / 인기 / 댓글순 · N POSTS · END OF FEED · 글쓰기 |
| 말머리 | 전체 · 이적설 · 경기 · 선수 · 유니폼 · 잡담 |
| 에디터 | 글쓰기 / 글 수정 · 취소 · 등록 / 수정 완료 · 말머리를 하나 골라 주세요 · 제목을 입력하세요 · 무슨 얘기를 나눌까요? / 소문이면 출처를 같이 적어주면 좋아요. · 사진 올리기 · 임시저장됨 · 방금 |
| 이탈 다이얼로그 | 작성을 그만둘까요? · 지금까지 쓴 내용은 임시저장함에 남겨둘게요. · 계속 쓰기 / 나가기 |
| 상세 | 팔로우 · 댓글 · 작성자 · 내 댓글 · 답글 · 삭제 · 한 줄 거들기 · 답글을 남겨보세요 · {닉네임} 에게 답글 |
| 시트(내 글) | 수정하기 · 삭제하기 · 닫기 |
| 시트(남의 글) | 이 글 알림 끄기 · {작성자} 차단하기 · 신고하기 · 닫기 |
| 삭제 다이얼로그 | 이 글을 삭제할까요? · 댓글 N개도 같이 사라져요. 되돌릴 수 없습니다. · 취소 / 삭제 |
| 토스트 | 글을 올렸어요 · 수정했어요 · 글을 삭제했어요 · 댓글을 삭제했어요 · 저장했어요 · 저장을 취소했어요 |

어투 규칙: 사용자에게 말하는 문장은 `~어요/~해요`체. 버튼 라벨은 명사형 또는 `~하기`. 시스템이 판단을 내리는 어투("~해야 합니다", "불가합니다")를 쓰지 않는다.

## 9. 완료 체크리스트

구현 후 아래를 하나씩 확인한다. 하나라도 아니면 아직 안 끝난 것이다.

**토큰**
- [ ] 코드 전체에 하드코딩된 hex가 없다 (`#FEE500` 카카오 배경만 예외, 테마 키로 등록)
- [ ] 버튼 radius가 전부 6px이다 (알약 예외 4곳만: 액션 칩·아바타·댓글 입력·글쓰기 버튼)
- [ ] emerald 위 글자가 전부 `#171717`이다
- [ ] 화면당 emerald 사용처가 1개 이하다 (목록 0 · 에디터 1 · 상세 1 · 로그인 0)
- [ ] 기본 상태 카드/행에 그림자가 없다

**로그인**
- [ ] 소셜 순서가 카카오 → Apple → Google
- [ ] 비밀번호 입력이 어디에도 없다
- [ ] 코드 6칸, 현재 위치 칸만 보더가 진하다
- [ ] 게스트 진입이 동작한다

**목록**
- [ ] 말머리 필터가 실제로 필터링한다
- [ ] 이미지 없는 글에 빈 썸네일 박스가 없다
- [ ] 발췌가 2행에서 잘린다
- [ ] 숫자가 mono + 천 단위 콤마
- [ ] press 시 배경만 변하고 움직이지 않는다

**작성/수정**
- [ ] 말머리 미선택이면 등록이 비활성
- [ ] 제목 60자, 본문 2,000자에서 막힌다
- [ ] textarea가 입력에 따라 자동으로 늘어난다
- [ ] 사진 6장에서 추가 타일이 사라진다
- [ ] 생성 모드에서만 이탈 확인이 뜬다
- [ ] 수정 모드에 기존 값이 전부 채워져 있다
- [ ] 등록/수정 후 토스트가 뜬다

**상세**
- [ ] 좋아요 토글 시 카운트가 ±1 되고 emerald로 채워진다
- [ ] 답글이 1단계에서 멈춘다 (답글에 `답글` 버튼 없음)
- [ ] 댓글 수가 답글을 포함한 총합이다
- [ ] 내 글에서만 수정/삭제가 보인다
- [ ] 삭제 후 목록에서 실제로 사라진다
- [ ] 답글 모드 표시 바가 뜨고 X로 해제된다
- [ ] 하단 입력 바가 콘텐츠를 가리지 않는다 (하단 여백 확보)

**전역**
- [ ] 화면 전환 시 스크롤이 최상단으로
- [ ] 탭바가 목록에서만 보인다
- [ ] 콘솔 에러 0
- [ ] `prefers-reduced-motion`에서 트랜지션이 사라진다
- [ ] 모든 터치 타깃 44px 이상
- [ ] iPhone SE(375×667) ~ Pro Max(430×932) 폭에서 깨지지 않는다
