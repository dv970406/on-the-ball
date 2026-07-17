# 폰트 파일 안내

이 폴더의 woff2는 `src/app/fonts.ts`가 `next/font/local`로 로드한다.

## JetBrainsMono-Regular.subset.woff2 / JetBrainsMono-Medium.subset.woff2 — **서브셋 생성물**

숫자·통계·라벨 전용(`--font-mono`) 폰트다. 손으로 편집하지 않는 **생성물**이다.

원본 JetBrains Mono는 1,754 글리프(키릴·그리스 등 포함, 굵기당 ~90KB)지만,
이 앱은 **숫자·라틴·부호 ~95자**만 쓴다. 그래서 실제 쓰는 글자만 남긴 **정적 서브셋**으로 교체했다.

- 크기: 굵기당 ~90KB → **~23KB** (합계 186KB → 46.6KB, 75%↓)
- 모양 보존: 남긴 글리프 아웃라인은 원본과 **바이트 동일**. 제거한 건 CSS로 켜지 않는 스타일 기능뿐 → 렌더 결과 불변.
- 이유: JetBrains Mono는 이미 작고 쓰는 글자가 고정적이라 Pretendard식 **동적 분리(다중 파일)는 부적합** — 파일 하나로 줄이는 정적 서브셋이 맞다.

### 재생성 / 글자 추가

새 라틴 글자·부호를 mono로 써야 하면 아래로 다시 서브셋한다(유니코드 범위에 추가):

```bash
# fonttools 필요 (프로젝트 의존성 아님 — 임시 venv에서 실행)
python3 -m venv /tmp/ftenv && /tmp/ftenv/bin/pip install fonttools brotli

VER=2.304                     # JetBrains Mono 버전
UNI="U+0020-007E,U+00B7,U+00D7,U+2013,U+2014,U+2022,U+2026,U+2212,U+2192,U+2191,U+2193,U+25B8"
FEAT="ccmp,locl,calt,kern,mark,mkmk"   # 렌더 정확성 기능만 유지, 미사용 스타일 기능 제거

# 원본 static woff2(또는 ttf)에서 → .subset.woff2 로 출력:
for w in Regular Medium; do
  /tmp/ftenv/bin/pyftsubset "JetBrainsMono-$w.woff2" \
    --unicodes="$UNI" --layout-features="$FEAT" \
    --flavor=woff2 --output-file="JetBrainsMono-$w.subset.woff2"
done
```

- 원본: JetBrains Mono, SIL Open Font License 1.1 (https://github.com/JetBrains/JetBrainsMono)
- 파일명(`.subset.woff2`)을 유지해야 `fonts.ts` 수정이 필요 없다.

## Pretendard

Pretendard는 이 폴더가 아니라 `public/fonts/pretendard/`에 동적 서브셋으로 자체 호스팅한다.
자세한 내용은 `public/fonts/pretendard/README.md` 참고.
