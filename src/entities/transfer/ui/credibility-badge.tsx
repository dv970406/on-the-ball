// ⚠ 배럴이 아니라 직접 경로다 — `"use client"`가 없어 서버 렌더 여지를 남긴다(`pill.tsx`와 같은 이유)
import { cn } from "@/shared/lib/cn";
import { credibilityOf } from "../lib/credibility";
import type { TransferReport } from "../model/types";

/**
 * 달 위상 — 어두울수록 공신력이 낮다. 🌘·🌗·🌖은 **오른쪽이 어두워지는** 쪽(그믐 방향)으로 통일해
 * 1→5가 한 방향으로 차오르게 읽힌다.
 */
const MOON: Record<1 | 2 | 3 | 4 | 5, string> = { 1: "🌑", 2: "🌘", 3: "🌗", 4: "🌖", 5: "🌕" };
/**
 * ⚠ **변형 선택자(U+FE0F)를 반드시 붙인다.** 🎖(U+1F396)은 기본 표시가 "글자"라, 없으면 Windows에서
 *   흑백 기호로 그려질 수 있다. 달(U+1F311~)은 기본 표시가 이모지라 필요 없다.
 */
const MEDAL = "\u{1F396}\uFE0F";
const MOON_LABEL: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "공신력 매우 낮음",
  2: "공신력 낮음",
  3: "공신력 보통",
  4: "공신력 높음",
  5: "공신력 매우 높음",
};
const MEDAL_LABEL = "공신력 높은 매체";

interface CredibilityBadgeProps {
  report: Pick<TransferReport, "sourceId" | "attribution" | "attributedTo">;
  className?: string;
}

/**
 * 출처 공신력 뱃지 — 🎖️(오피셜에 육박하는 매체) 또는 🌑~🌕(그 밖의 매체·기자 5단계). 등재되지 않은 출처면 그리지 않는다.
 *
 * ⚠ **이모지만 두지 않는다** — 스크린리더는 이모지를 "보름달"처럼 모양 이름으로 읽어 뜻이 전해지지 않는다.
 *   이모지는 `aria-hidden`, 뜻은 `sr-only` 글자가 진다(마우스 사용자에게는 `title`).
 * ⚠ 이모지 폰트를 명시한다 — 본문 폰트(Pretendard)에 이모지가 없어, 대체 폰트를 브라우저에 맡기면
 *   OS마다 흑백 기호가 잡히기도 한다(국기와 같은 폰트 스택).
 */
export function CredibilityBadge({ report, className }: CredibilityBadgeProps) {
  const c = credibilityOf(report);
  if (c === null) return null;
  const emoji = c.kind === "medal" ? MEDAL : MOON[c.level];
  const label = c.kind === "medal" ? MEDAL_LABEL : MOON_LABEL[c.level];
  return (
    <span title={label} className={cn("inline-flex shrink-0 items-center", className)}>
      <span
        aria-hidden
        className="font-['Apple_Color_Emoji','Segoe_UI_Emoji','Noto_Color_Emoji',sans-serif] text-[13px] leading-none"
      >
        {emoji}
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
