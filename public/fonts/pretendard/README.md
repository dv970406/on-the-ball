# Pretendard Variable — 자체 호스팅 동적 서브셋

이 폴더의 `PretendardVariable.subset.{0..91}.woff2` 92개 파일은 **손으로 편집하지 않는 생성물**이다.
Pretendard 공식 배포본을 그대로 가져와 자체 호스팅한 것이다.

## 왜 92개인가

한글(CJK)은 글리프가 수천~수만 자라, 폰트를 **`unicode-range`로 분할한 다수의 작은 woff2 조각**으로 쪼개
브라우저가 **페이지에 실제 등장한 글자 범위의 조각만** 내려받게 하는 것이 표준이다.
Google Fonts의 Noto Sans KR도 동일하게 100+ 조각으로 서빙하고, `next/font/google`도 이 조각들을 빌드 폴더로 self-host한다.
즉 "폰트 파일이 많다"는 이상한 게 아니라 **한글 웹의 일반적인 로딩 방식**이다.

효과: 단일 ~2MB 통짜 로드 대신, 일반 페이지 초기 폰트 전송이 ~100–200KB 수준으로 떨어진다.

## 출처 / 버전

- 패키지: [`pretendard`](https://github.com/orioncactus/pretendard) **v1.3.9**
- 원본 경로: `dist/web/variable/`
  - CSS: `pretendardvariable-dynamic-subset.css`
  - woff2: `woff2-dynamic-subset/PretendardVariable.subset.{0..91}.woff2`
- 라이선스: **SIL Open Font License 1.1** (© 2021 Kil Hyung-jin, Reserved Font Name Pretendard).
  OFL 고지는 `src/app/styles/pretendard-subset.css` 상단 원본 주석에 유지되어 있다.

## 연관 파일 (여기만 보지 말 것)

| 파일 | 역할 |
|---|---|
| `src/app/styles/pretendard-subset.css` | 92개 `@font-face`(unicode-range) + CLS 방지 fallback face. url을 `/fonts/pretendard/`로 재작성 |
| `src/app/styles/globals.css` | `@import`로 위 CSS 로드, `--font-sans` 토큰이 `"Pretendard Variable"`을 가리킴 |
| `app/layout.tsx` | 최빈 조각 `[91]`(라틴·숫자·최빈 한글) / `[90]`(차상위 최빈 한글) `<link rel="preload">` |
| `next.config.ts` | `/fonts/pretendard/*`에 `Cache-Control: public, max-age=31536000, immutable` |

## 재생성 / 버전 업그레이드

버전을 올리거나 파일을 다시 받으려면 (아래 `VER`만 바꾸면 됨):

```bash
VER=1.3.9
BASE="https://cdn.jsdelivr.net/npm/pretendard@${VER}/dist/web/variable"

# 1) 92개 woff2 조각을 이 폴더(public/fonts/pretendard/)에 내려받기
seq 0 91 | xargs -P 8 -I {} \
  curl -sSL "$BASE/woff2-dynamic-subset/PretendardVariable.subset.{}.woff2" \
  -o "PretendardVariable.subset.{}.woff2"

# 2) 동적 서브셋 CSS를 받아 url 경로를 자체 호스팅 경로로 치환 → pretendard-subset.css 로 저장
#    (파일 상단 한국어 주석 헤더와 하단 CLS fallback face 블록은 수동 유지)
curl -sSL "$BASE/pretendardvariable-dynamic-subset.css" \
  | sed 's#url(\./woff2-dynamic-subset/#url(/fonts/pretendard/#g' \
  > /tmp/pretendard-subset.body.css
#    → 위 결과의 @font-face 블록을 src/app/styles/pretendard-subset.css 본문으로 반영
```

> CLS fallback face의 `ascent-override: 95.21%` / `descent-override: 24.12%`는
> Pretendard 실측 메트릭(em 2048, hhea ascent 1950, descent -494)에서 산출한 값이다.
> 폰트 메이저 버전이 바뀌어 메트릭이 달라지면 이 값도 재계산할 것.

## 하지 말 것

- 개별 `.subset.N.woff2`를 직접 열어 편집하거나 이름을 바꾸지 말 것 (CSS의 `unicode-range` 매핑이 깨진다).
- `select` 하듯 임의로 조각 일부만 지우지 말 것 — 해당 범위의 글자가 fallback 폰트로 튄다.
