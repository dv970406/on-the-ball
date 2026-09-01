"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/shared/lib";
import type { Team } from "../model/types";

/**
 * 엠블럼 자산의 위치 — **파일명이 곧 팀 코드다.**
 *
 * ⚠ `team.code`를 그대로 URL에 싣는다. DB CHECK가 `^[a-z][a-z0-9-]*$`(40자 이하)로 강제하는
 *   슬러그라 경로를 벗어나는 문자가 들어올 수 없다 — 그래서 인코딩이 필요 없다.
 * ⚠ 파일은 `scripts/fetch-team-crests.mjs`가 만들어 **저장소에 커밋한다.** 런타임에 늘어나지
 *   않는다는 뜻이라, 승격팀은 파일이 없어 404 → 모노그램으로 떨어진다(아래 폴백).
 *   `scripts/team-names-ko.json`이 한국어 표기를 다루는 방식과 같은 모양이다.
 */
const CREST_DIR = "/crests";

interface TeamCrestProps {
  team: Team;
  /** px. 목록 카드는 24, 상세 스코어보드는 44 */
  size: number;
  className?: string;
}

/**
 * 구단 엠블럼 — 목록·상세에서 팀을 알아보는 시각 앵커.
 *
 * ⚠ **제공자 CDN을 직접 걸지 않고 우리가 줄인 사본을 서빙한다.** 원본이 여기서 그리는 크기
 *   (24·44px)에 비해 한참 과하고, 리사이즈 파라미터를 지원하지 않아(`?width=` 등이 전부
 *   원본을 준다 — 실측) 줄이려면 사본을 두는 수밖에 없다.
 *   128px 팔레트 PNG로 **20팀 1,068KB → 약 85KB(92% 감소)** 가 된다(API-Football 기준 실측).
 *   ⚠ 128px인 이유는 상세(44px)의 DPR 3 필요치(132px)를 덮기 때문이다. 96px이면 28KB 더
 *     줄지만 고배율 화면에서 상세 엠블럼이 흐려진다 — 그 화면의 주인공이라 안 된다.
 *   ⚠ 포맷·크기·품질의 근거는 `scripts/fetch-team-crests.mjs`가 갖는다(WebP가 이 그림에서
 *     오히려 크고, AVIF는 조금 작지만 디코드 실패가 조용한 모노그램이 된다).
 *
 * ⚠ **`next/image`가 아니라 `<img>`다** — `avatar.tsx`·`markdown.tsx`·`split-card.tsx`와 같은
 *   판단이다. 자산이 이미 목표 크기라 최적화 파이프라인이 줄 이득이 없다.
 *
 * ⚠ **`Avatar`를 재사용할 수 없다.** 그쪽은 `rounded-full` + `object-cover`라 방패 모양
 *   엠블럼의 모서리가 잘린다. 여기는 `object-contain`으로 원본 비율을 지킨다.
 *
 * ⚠ **폴백이 두 갈래인데 둘 다 필요하다.**
 *   ① 팀 코드가 비어 있다 — 조회가 팀을 못 붙였을 때(`UNKNOWN_TEAM`).
 *   ② 파일이 없어 404 — **승격팀이 생기면 반드시 겪는다.** 매핑 파일과 마찬가지로 사람이
 *      스크립트를 돌려 커밋해야 채워지므로, 그 사이에도 화면이 깨지지 않아야 한다.
 */
export function TeamCrest({ team, size, className }: TeamCrestProps) {
  /**
   * ⚠ **boolean이 아니라 "실패한 경로"를 기억한다.** 목록이 리페치로 재배열되면 같은
   *   컴포넌트 인스턴스에 **다른 팀**이 들어오는데, boolean이면 그 팀까지 모노그램으로
   *   남는다. 경로와 대조하면 값이 바뀌는 순간 저절로 풀린다.
   */
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = team.code === "" ? null : `${CREST_DIR}/${team.code}.png`;
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
   * ⚠ `src`를 deps에 둔다 — 목록이 재배열되어 다른 팀이 들어오면 다시 확인해야 한다.
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
        {[...team.shortName].slice(0, 2).join("")}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- 이미 목표 크기의 자산이다(위 주석)
    <img
      ref={imgRef}
      src={src}
      /* 팀 이름이 바로 옆에 있는 장식이다 — 라벨을 겹쳐 쓰면 스크린리더가 이름을 두 번 읽는다 */
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
