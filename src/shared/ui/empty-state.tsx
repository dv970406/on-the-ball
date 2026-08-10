import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
// ⚠ 배럴이 아니라 직접 경로다 — `@/shared/lib`는 "use client" 훅을 포함하는데 이 컴포넌트는
//   서버에서 렌더된다(app/not-found.tsx). 배럴 자신이 index.ts에 "서버는 여기서 import 금지"를
//   적어 두었고, 같은 디렉터리의 button-class.ts가 같은 이유로 직접 경로를 쓴다.
import { cn } from "@/shared/lib/cn";
import { Icon } from "./icon";
import { Button } from "./button";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** 하단 액션 (버튼 등) — 명시하면 onRetry보다 우선 */
  action?: ReactNode;
  /** 오류 재시도 핸들러 — action이 없을 때 "다시 시도" 버튼을 자동 렌더 */
  onRetry?: () => void;
  /** 재시도 버튼 라벨 (기본 "다시 시도") */
  retryLabel?: string;
  /** 재시도 버튼 톤 (기본 "dark") */
  retryVariant?: "dark" | "secondary";
  /**
   * 조회 실패 등 **비동기로 나타나는** 상태인지.
   *
   * 로딩 스켈레톤이 이 컴포넌트로 통째로 교체되는 게 화면상으로는 명확하지만,
   * 스크린리더에는 아무 알림도 가지 않았다(스켈레톤은 aria-hidden이다).
   * 처음부터 화면에 있는 빈 상태("아직 글이 없어요")는 알림이 필요 없으므로 기본값은 false다.
   */
  live?: boolean;
  className?: string;
}

/** 빈 상태·오류·설정 안내 공용 컴포넌트 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  onRetry,
  retryLabel = "다시 시도",
  retryVariant = "dark",
  live = false,
  className,
}: EmptyStateProps) {
  // action 우선, 없으면 onRetry로 재시도 버튼 구성
  const footer =
    action ??
    (onRetry ? (
      <Button variant={retryVariant} size="sm" onClick={onRetry}>
        {retryLabel}
      </Button>
    ) : null);

  return (
    <div
      role={live ? "status" : undefined}
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-8 py-14 text-center",
        className,
      )}
    >
      {icon && (
        <span className="mb-1 flex size-11 items-center justify-center rounded-full border border-hairline-cool bg-canvas-soft text-ink-mute">
          <Icon as={icon} size={20} />
        </span>
      )}
      <p className="text-[15px] font-medium text-ink">{title}</p>
      {description && (
        <p className="text-[13px] leading-relaxed text-ink-mute">{description}</p>
      )}
      {footer && <div className="mt-3">{footer}</div>}
    </div>
  );
}
