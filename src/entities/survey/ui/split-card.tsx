"use client";

import { COLOR, surveyImageUrl } from "@/shared/config";
import { cn } from "@/shared/lib";
import type { SurveyOption } from "../model/types";
import { type SplitCount, splitLayout } from "../lib/split-layout";
import { VsBadge } from "./vs-badge";

interface SplitCardProps {
  /** 2~4개. **개수가 도형을 정한다** — 호출부는 `splitCount()`로 먼저 걸러 넘긴다 */
  options: SurveyOption[];
  count: SplitCount;
  /** 내가 고른 선택지 — 그 면에 체크 표시를 남긴다 */
  myOptionId: number | null;
  /** 없으면 읽기 전용(히어로) — 세션 판정은 상위(features)가 한다 */
  onPick?: (optionId: number) => void;
  /** VS 배지 등장 pop */
  animateVs?: boolean;
}

/**
 * 이미지 위에 까는 스크림 — **글자를 읽히게 하는 장치다.**
 *
 * ⚠ 사진은 밝기가 제각각이라 `text_color`만으로는 대비를 보장할 수 없다. 흰 글씨면
 *   어둡게, 잉크 글씨면 밝게 덮어 어떤 사진이 와도 최소 대비가 남는다.
 * ⚠ 위쪽을 더 진하게 준다 — 이름·부제가 면의 바깥 모서리에 붙기 때문이다.
 * ⚠ `bg-linear-*` 유틸을 쓰지 않는다(oklab 보간이라 중간색이 달라진다) — 그리고 어차피
 *   런타임 값과 합성해야 해서 `style`이다(styling.md).
 */
const SCRIM = {
  dark: "rgba(0,0,0,0.55), rgba(0,0,0,0.3)",
  light: "rgba(255,255,255,0.65), rgba(255,255,255,0.4)",
} as const;

/**
 * 선택지를 면적으로 등분한 분할 카드 — 서베이의 시그니처.
 * 도형(clip-path·앵커·이름 크기·VS 위치)은 전부 `lib/split-layout`이 소유한다.
 *
 * ⚠ **면 색은 `style`로 준다.** DB에서 오는 런타임 값이라 클래스로 확정할 수 없다 —
 *   styling.md가 `style`을 허용하는 바로 그 경우다.
 * ⚠ **그림자를 두지 않는다.** resting 카드는 flat + 1px 헤어라인이 규약이다.
 * ⚠ 면의 색은 문항이 정하는 **콘텐츠**이고, 이 뷰포트의 에메랄드 이벤트는 VS 배지 하나뿐이다
 *   (styling.md의 컬러 예외 절).
 */
export function SplitCard({
  options,
  count,
  myOptionId,
  onPick,
  animateVs = false,
}: SplitCardProps) {
  return (
    <div
      // ⚠ 목록과 상세가 같은 카드를 쓰므로 비율이 갈릴 이유가 없다 — 1:1 고정이다.
      // ⚠ **화면 밖 카드는 그리지 않는다**(`content-visibility`). 목록이 진행 중 문항을
      //   전부 카드로 나열하는데 면 배경이 CSS `background-image`라, 렌더되는 즉시 모든
      //   이미지가 요청된다 — 첫 진입에 수백 KB가 한꺼번에 내려왔다.
      //   `contain-intrinsic-size`를 함께 줘야 스크롤바가 튀지 않는다(1:1이라 폭과 같다).
      className="relative aspect-square overflow-hidden rounded-[18px] border border-hairline [contain-intrinsic-size:auto_100vw] [content-visibility:auto]"
    >
      {options.map((option, i) => (
        <Face
          key={option.id}
          option={option}
          index={i}
          count={count}
          mine={myOptionId === option.id}
          onPick={onPick}
        />
      ))}
      <VsBadge animate={animateVs} />
    </div>
  );
}

interface FaceProps {
  option: SurveyOption;
  index: number;
  count: SplitCount;
  mine: boolean;
  onPick?: (optionId: number) => void;
}

function Face({ option, index, count, mine, onPick }: FaceProps) {
  const { clipPath, anchor, nameSize } = splitLayout(count, index);
  // 색은 splitCount()가 이미 걸렀다 — 여기 도달하면 둘 다 채워져 있다
  const color = option.textColor ?? undefined;
  // 밝은 글씨 = 어두운 면 → 스크림을 그 대비에 맞춘다.
  // ⚠ 토큰과 같은 hex를 여기에 적지 않는다 — 색의 단일 소스는 `COLOR`다(styling.md).
  const onDark = (option.textColor ?? "").toLowerCase() !== COLOR.ink.toLowerCase();

  /**
   * 배경 — **이미지가 있으면 이미지가 이기고, 색은 그 아래 깔린다.**
   *
   * ⚠ 색을 지우지 않고 **함께** 얹는 이유: 이미지가 아직 안 왔거나 실패했을 때 면이
   *   투명해지면 아래 면이 비쳐 카드가 통째로 깨진다. `background-color`가 항상 받쳐 준다.
   * ⚠ `background-image`는 **런타임 값**(DB에서 온 경로)이라 `style`이 맞다(styling.md).
   *
   * ⚠ **`next/image`를 쓰지 않는 이유**(`avatar.tsx`·`markdown.tsx`가 `<img>` 사유를 남긴 것과
   *   같은 자리다): 이 면은 `clip-path` 폴리곤으로 잘린 **배경**이고 색과 스크림을 한 프로퍼티에
   *   합성해 쌓는다 — 이미지가 늦거나 실패해도 면이 투명해지지 않게 하는 장치다. `<Image fill>`로
   *   바꾸면 그 합성이 세 레이어로 흩어지고 도형마다 z-순서를 다시 맞춰야 한다.
   *   대신 카드 자체에 `content-visibility`를 걸어 화면 밖 요청을 미룬다.
   */
  const image = surveyImageUrl(option.imagePath);
  const background = image
    ? `linear-gradient(${SCRIM[onDark ? "dark" : "light"]}), url("${image}") center/cover no-repeat, ${option.bgColor}`
    : (option.bgColor ?? undefined);

  // ⚠ clipPath는 **완성된 클래스 문자열**이다(split-layout 주석 참고) — 여기서 조립하지 않는다
  const faceClassName = cn("absolute inset-0 overflow-hidden", clipPath);

  const content = (
    <span className={cn("absolute block", anchor)}>
      <span className={cn("block font-bold", nameSize)}>{option.label}</span>

      {option.subtitle && (
        <span className="mt-2 block text-[12px] opacity-70">{option.subtitle}</span>
      )}

      {/* ⚠ 텍스트가 든 요소라 aria-label을 붙이지 않는다(콘텐츠를 덮어쓴다) */}
      {mine && <span className="sr-only">— 내가 고른 선택지</span>}
    </span>
  );

  // 읽기 전용(히어로) — 카드 전체를 감싼 Link가 이동을 맡는다
  if (!onPick) {
    return (
      <div className={faceClassName} style={{ background, color }}>
        {content}
      </div>
    );
  }

  // 투표 모드 — 네이티브 button (Enter/Space·포커스 링·커서를 브라우저가 제공한다)
  return (
    <button
      type="button"
      aria-pressed={mine}
      onClick={() => onPick(option.id)}
      className={cn(faceClassName, "cursor-pointer text-left")}
      style={{ background, color }}
    >
      {content}
    </button>
  );
}
