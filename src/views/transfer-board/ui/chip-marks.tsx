import { Heart, X } from "lucide-react";
import { Icon } from "@/shared/ui";

/**
 * 보드 필터 링크 안의 표지 — 모바일 칩 줄(`FilterRail`)과 넓은 화면 왼쪽 레일(`BoardRail`)이 같은 모양·같은 낭독을 쓴다.
 * 아이콘은 모양만 지고 뜻은 `sr-only` 글자가 진다(`code-quality.md` ARIA 절 — 링크 이름에 덧붙어 읽힌다).
 */

/**
 * 켜진 필터의 X — 누르면 그 필터가 풀린다는 표시.
 * 칩 안에서는 12px에 오른쪽 여백을 반 칸 당기고(칩 패딩과 시각 균형), 글자 링크("관심만 보기") 안에서는 `compact`로 11px만 둔다.
 */
export function ClearFilterMark({ compact = false }: { compact?: boolean }) {
  return (
    <>
      {compact ? <Icon as={X} size={11} /> : <Icon as={X} size={12} className="-mr-0.5" />}
      <span className="sr-only">필터 해제</span>
    </>
  );
}

/** 응원 구단 칩의 하트 — 응원 구단이 칩 줄 맨 앞에 놓이는 이유를 보여 준다 */
export function FollowedClubMark() {
  return (
    <>
      <Icon as={Heart} size={11} className="fill-current" />
      <span className="sr-only">응원 구단</span>
    </>
  );
}
