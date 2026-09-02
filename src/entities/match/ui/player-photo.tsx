"use client";

import { User } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/shared/lib";
import { playerPhotoUrl } from "../lib/player-photo";

interface PlayerPhotoProps {
  externalId: string | null;
  /** 지름(px) — 피치(36)와 후보 명단(24)이 다르다 */
  size: number;
  className?: string;
}

/**
 * 선수 얼굴 — 없으면 **등번호**로 떨어진다.
 *
 * ⚠ **`"use client"`가 필요하다.** 실패 판정에 `useState`·`useEffect`가 있어서다.
 *   형제 컴포넌트들은 디렉티브가 없지만 지금은 다 같이 클라이언트로 내려간다 —
 *   여기만 **상태를 갖기 때문에** 붙이는 것이지 경계를 나누려는 것이 아니다.
 *
 * ⚠⚠ **`next/image`다 — `TeamCrest`·`Avatar`와 갈리는 지점이고, 근거는 실측이다.**
 *   원본이 150×150 PNG(평균 28KB)인데 여기서 그리는 크기는 36·24px이라, 한 경기 라인업
 *   40장이 **1.07MB**로 나갔다. 제공자 CDN은 `?width=`·`?w=`·`?tr=` 같은 리사이즈 파라미터를
 *   **전부 403으로 거부**하고 `Accept`로 포맷 협상도 하지 않는다(실측) — 줄이려면 우리가
 *   최적화 파이프라인을 태우는 수밖에 없다. 108px webp로 재인코딩하면 장당 1.6KB,
 *   40장 **약 53KB(95% 감소)** 다.
 *   ⚠ `TeamCrest`가 `<img>`인 것은 **이미 우리가 줄여 커밋한 자산**이라 파이프라인이 줄 이득이
 *     없어서다. 여기는 반대로 원본이 그대로 오므로 같은 판단이 성립하지 않는다.
 *   ⚠ `next.config.ts`의 `images.remotePatterns`에 이 호스트를 등재해야 동작한다.
 *
 * ⚠ **폴백이 두 갈래인데 둘 다 필요하다**(`TeamCrest`와 같은 사정).
 *   ① `external_id`가 없거나 형태가 다르다 — URL을 만들 수 없다.
 *   ② 404 — 제공자에 사진이 없는 선수가 있다. 참고 화면조차 일부는 회색 실루엣이다.
 *
 * ⚠ **폴백은 실루엣이다 — 등번호가 아니다.** 한때 등번호를 그렸는데, 호출부가 등번호를
 *   **이미 따로 그리고 있어서**(피치는 이름 앞, 명단은 번호 칸) 사진 없는 선수는 번호가
 *   나란히 두 번 찍혔다. 같은 사실을 두 곳이 그리지 않는다.
 * ⚠ **`Avatar`를 재사용하지 않는다.** 그쪽 폴백은 **이름 첫 글자**라 바로 옆·아래의 이름과
 *   겹쳐 읽힌다.
 */
export function PlayerPhoto({ externalId, size, className }: PlayerPhotoProps) {
  /**
   * ⚠ **boolean이 아니라 "실패한 경로"를 기억한다**(`TeamCrest`와 같은 이유). 목록이
   *   리페치로 재배열되면 같은 인스턴스에 다른 선수가 들어오는데, boolean이면 그 선수까지
   *   등번호로 남는다.
   */
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = playerPhotoUrl(externalId);
  const broken = src === null || failedSrc === src;

  /**
   * ⚠ **`onError`만으로는 새는 경로가 있다.** 이 이미지는 SSR HTML에 실려 나가 **HTML 파서가
   *   로드를 시작**하므로, 하이드레이션 전에 실패하면 React가 핸들러를 붙이기 전에 `error`가
   *   지나가 폴백이 영영 뜨지 않는다 — 자리에 깨진 이미지 아이콘만 남는다.
   *   → 마운트 뒤에 이미 끝난 로드의 결과를 직접 읽는다(`complete && naturalWidth === 0`).
   * ⚠ `next/image`가 `forwardRef` + `useMergedRef`로 **내부 `<img>`에 ref를 넘겨 준다**(확인함)
   *   — 그래서 `<img>`에서 `Image`로 옮겨도 이 판정이 그대로 선다.
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
          "flex shrink-0 items-center justify-center rounded-full border border-hairline-cool bg-canvas-soft text-ink-mute",
          className,
        )}
        // 크기는 호출부가 정하는 런타임 값이라 클래스로 확정할 수 없다(`TeamCrest`가 선례)
        style={{ width: size, height: size }}
      >
        <User size={Math.round(size * 0.55)} strokeWidth={1.5} />
      </span>
    );
  }

  return (
    <Image
      ref={imgRef}
      src={src}
      /* 이름이 바로 옆·아래에 있다 — 라벨을 겹쳐 쓰면 스크린리더가 이름을 두 번 읽는다 */
      alt=""
      width={size}
      height={size}
      /* ⚠ 한 화면에 40장이 동시에 뜬다 — 본문 읽기와 대역을 다투지 않게 낮춘다 */
      fetchPriority="low"
      onError={() => setFailedSrc(src)}
      className={cn(
        "shrink-0 rounded-full border border-hairline-cool bg-canvas-soft object-cover",
        className,
      )}
      style={{ width: size, height: size }}
    />
  );
}
