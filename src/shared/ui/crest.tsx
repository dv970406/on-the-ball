"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/shared/lib";

interface CrestProps {
  /** 이미지 경로. `null`이면 처음부터 모노그램 폴백을 그린다(코드가 비어 있는 경우). */
  src: string | null;
  /** 폴백 모노그램에 쓸 이름 — 앞 2글자를 그린다(약칭 기준). */
  label: string;
  /** px. */
  size: number;
  className?: string;
}

/**
 * 엠블럼류 이미지 + 하이드레이션 전 실패 감지 + 모노그램 폴백의 공통 메커니즘.
 *
 * ⚠ **`entities/match/ui/team-crest.tsx`에서 승격했다.** 도메인을 모르는 순수 메커니즘인데
 *   두 엔티티(`match`의 구단 엠블럼과 `transfer`의 이적 구단 엠블럼)가 같은 것을 써야 한다.
 *   entities끼리는 import할 수 없어(`architecture.md` 단방향 규칙) 여기로 올렸다 —
 *   `avatarUrl`이 `shared`에 있는 것과 같은 사정이다. `code-quality.md`의 공용화 기준(중복
 *   3회 이상·형태가 진짜 같음)에는 지금 2곳뿐이라 못 미치지만, entities 교차 재사용이 그
 *   레이어 규칙상 애초에 불가능한 구조적 제약이라 "성급한 추상화" 쪽이 아니라 `avatarUrl`·
 *   `OAUTH_PROVIDERS`와 같은 "공유해야만 하는 메커니즘" 쪽으로 판단했다.
 * ⚠ 도메인(팀·구단) 지식은 이 컴포넌트에 없다 — 호출부가 `src`·`label`을 조립한다.
 *   `TeamCrest`(`@/entities/match`)는 이 컴포넌트를 감싸는 얇은 래퍼로 남는다(렌더 결과 불변).
 *
 * ⚠ **`next/image`가 아니라 `<img>`다** — `avatar.tsx`·`markdown.tsx`·`split-card.tsx`와 같은
 *   판단이다. 자산이 이미 목표 크기라 최적화 파이프라인이 줄 이득이 없다.
 * ⚠ **`Avatar`를 재사용할 수 없다.** 그쪽은 `rounded-full` + `object-cover`라 방패 모양
 *   엠블럼의 모서리가 잘린다. 여기는 `object-contain`으로 원본 비율을 지킨다.
 * ⚠ **폴백이 두 갈래인데 둘 다 필요하다.**
 *   ① `src`가 애초에 `null`이다(호출부가 코드를 못 붙였을 때).
 *   ② 파일이 있어야 하는데 404다(승격팀처럼 자산이 아직 커밋되지 않았을 때).
 */
export function Crest({ src, label, size, className }: CrestProps) {
  /**
   * ⚠ **boolean이 아니라 "실패한 경로"를 기억한다.** 목록이 리페치로 재배열되면 같은
   *   컴포넌트 인스턴스에 **다른 대상**이 들어오는데, boolean이면 그 대상까지 모노그램으로
   *   남는다. 경로와 대조하면 값이 바뀌는 순간 저절로 풀린다.
   */
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const broken = src === null || failedSrc === src;

  /**
   * ⚠ **`onError`만으로는 새는 경로가 있다.** 이 이미지는 SSR HTML에 실려 나가므로 **HTML
   *   파서가 로드를 시작**하고 하이드레이션 전에 끝날 수 있는데, 그때 실패하면 React가
   *   핸들러를 붙이기 전에 `error`가 지나가 폴백이 영영 뜨지 않는다 — 자리에 **깨진 이미지
   *   아이콘**만 남는다. `error`는 버블링하지 않아 루트 위임으로도 잡히지 않는다.
   *   → 마운트 뒤에 **이미 끝난 로드의 결과**를 직접 읽는다. `complete && naturalWidth === 0`이
   *     "로드가 끝났는데 그림이 없다"는 뜻이다. 진행 중인 로드는 아래 `onError`가 받는다.
   * ⚠ **`img.src`가 아니라 `src`를 저장한다.** `img.src`는 브라우저가 해석한 절대 URL이라
   *   상대 경로와 값이 다르다 — 그러면 위 `failedSrc === src`가 영영 false가 되어 폴백이
   *   뜨지 않는다. `onError` 경로와 같은 값을 써야 두 판정이 갈리지 않는다.
   * ⚠ `src`를 deps에 둔다 — 목록이 재배열되어 다른 대상이 들어오면 다시 확인해야 한다.
   */
  const imgRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const img = imgRef.current;
    if (src !== null && img?.complete && img.naturalWidth === 0) setFailedSrc(src);
  }, [src]);

  if (broken) {
    return (
      <span
        aria-hidden
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-sm border border-hairline-cool bg-canvas-soft font-semibold leading-none text-ink-mute",
          className,
        )}
        // 크기는 호출부가 정하는 런타임 값이라 클래스로 확정할 수 없다(`VsBadge`가 선례)
        style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      >
        {[...label].slice(0, 2).join("")}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- 이미 목표 크기의 자산이다(위 주석)
    <img
      ref={imgRef}
      src={src}
      /* 이름이 바로 옆에 있는 장식이다 — 라벨을 겹쳐 쓰면 스크린리더가 이름을 두 번 읽는다 */
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailedSrc(src)}
      className={cn("shrink-0 object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}
