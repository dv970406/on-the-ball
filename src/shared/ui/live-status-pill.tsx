import type { ReactNode } from "react";
import { COLOR } from "@/shared/config";
import { Pill } from "./pill";

type LiveStatusPillProps = {
  children: ReactNode;
};

/**
 * 라이브 상태 pill — 에메랄드 배경 + 잉크 상태 닷.
 * "진행 중"·"결과 공개" 등 진행 상태 표기를 한 곳에서 통일한다.
 */
export function LiveStatusPill({ children }: LiveStatusPillProps) {
  return (
    <Pill variant="green" dot={COLOR.ink}>
      {children}
    </Pill>
  );
}
