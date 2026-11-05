import { cn } from "@/shared/lib/cn";

/**
 * 본문에 놓인 보조 링크 — 밑줄 글자 + 누르는 높이 44px. 앵커에 입히는 클래스만 갖는다(`buttonClassName`·`chipClassName`과 같은 분리).
 * ⚠ 줄 안에 흐르는 링크(`hit-area`)가 아니라 **그 자체로 한 줄**을 차지하는 링크용이다.
 */
export function textLinkClassName(className?: string) {
  return cn(
    "inline-flex min-h-11 items-center text-[13px] font-medium text-ink underline decoration-hairline-strong underline-offset-[3px] hover:decoration-ink",
    className,
  );
}
