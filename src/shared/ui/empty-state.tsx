import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/shared/lib";
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
