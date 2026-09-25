import { Bell } from "lucide-react";
// ⚠ 배럴이 아니라 직접 경로다 — `"use client"`가 없어 서버 렌더 여지를 남긴다(`pill.tsx`와 같은 이유)
import { cn } from "@/shared/lib/cn";
import { Icon } from "@/shared/ui";

/**
 * 관심 표시 — 18px 에메랄드 원 + `Bell` 11. **선수 이름 앞**에 붙는다(handoff §3 `Watch`).
 *
 * ⚠ 표시일 뿐 토글이 아니다 — 토글은 상세의 `WatchToggle`(`features/watch-transfer`)뿐이다.
 * ⚠ 에메랄드 자리다("내 관심"은 handoff의 고정 색 의미). 글자가 없어 "색이 정보를 혼자 지지
 *   않는다"는 **형태(종 아이콘)** 가 지고, sr-only 텍스트가 스크린리더에 같은 뜻을 준다.
 * ⚠ 원(`rounded-full`)은 컨트롤이 아니라 표시 요소 — `styling.md` "대상이 아닌 것".
 */
export function WatchMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-grid size-[18px] shrink-0 place-items-center rounded-full bg-primary text-on-primary",
        className,
      )}
    >
      <Icon as={Bell} size={11} />
      <span className="sr-only">관심 등록됨</span>
    </span>
  );
}
