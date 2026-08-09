import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/shared/lib";

interface AvatarProps {
  /** 표시할 라벨 — 이미지가 없을 때 첫 글자만 사용 */
  label?: string;
  /** 프로필 사진 URL. 없으면 이니셜로 떨어진다 */
  src?: string | null;
  size?: number;
  className?: string;
  /** 그라데이션 등 커스텀 배경용 */
  style?: CSSProperties;
  children?: ReactNode;
}

/**
 * 원형 아바타 — 사진이 있으면 사진, 없으면 이니셜 (댓글·프로필).
 *
 * ⚠ `next/image`가 아니라 `<img>`를 쓴다. 아바타 호스트가 환경마다 다른데
 *   (로컬 `127.0.0.1:64321` ↔ 원격 `*.supabase.co`) `next.config`의 `remotePatterns`는
 *   빌드 시점 상수라 env로 갈리는 값을 담기 어렵다. 이미 업로드 시점에 512px·webp로
 *   줄여 올리므로 최적화로 얻을 것도 거의 없다.
 */
export function Avatar({ label, src, size = 28, className, style, children }: AvatarProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-hairline-cool bg-canvas-soft text-xs font-medium text-ink",
        className,
      )}
      style={{ width: size, height: size, ...style }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- 위 주석 참고
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          className="size-full object-cover"
          loading="lazy"
        />
      ) : (
        (children ?? label?.charAt(0))
      )}
    </span>
  );
}
