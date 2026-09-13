"use client";

import { useState } from "react";
import { COLOR, surveyImageUrl } from "@/shared/config";
import { cn } from "@/shared/lib";
import { CountUp, DrawnCheck } from "@/shared/ui";
import type { SurveyOption, SurveyResult } from "../model/types";
import { type SplitCount, splitLayout, splitSeam } from "../lib/split-layout";
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
  /**
   * 선택지별 득표수. **`null`·`undefined`면 아직 볼 수 없다**(미참여·비로그인·집계 대기) —
   * 열리면 면이 득표비로 갈리고(2분할) 각 면에 퍼센트가 얹힌다. 빈 배열은 "열렸는데
   * 표가 없다"라 전부 0%다(`SurveyBlock`과 같은 계약).
   */
  results?: SurveyResult[] | null;
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
 * 선택지를 면적으로 등분한 분할 카드 — 입축구의 시그니처.
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
  results,
}: SplitCardProps) {
  const open = results != null;
  const total = results?.reduce((sum, r) => sum + r.voteCount, 0) ?? 0;
  const ratioOf = (optionId: number) =>
    total > 0 ? (results?.find((r) => r.optionId === optionId)?.voteCount ?? 0) / total : 0;
  /**
   * 결과가 열리면 **면적이 득표비를 말한다**(Instagram 투표 스티커). 2분할만 시임이 움직이고
   * 3·4분할은 도형을 두고 숫자만 얹는다 — 사유는 `splitSeam` 주석에.
   * ⚠ 총 0표(내 표가 롤백된 직후)면 반반으로 둔다 — 0으로 나눈 NaN이 폴리곤에 들어가면
   *   면이 통째로 사라진다.
   */
  const seam = open ? splitSeam(count, total > 0 ? ratioOf(options[0].id) : 0.5) : null;

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
          clipPathOverride={seam?.clipPaths[i]}
          percent={open ? Math.round(ratioOf(option.id) * 100) : null}
        />
      ))}
      <VsBadge animate={animateVs} topPct={seam?.junctionTopPct} />
    </div>
  );
}

interface FaceProps {
  option: SurveyOption;
  index: number;
  count: SplitCount;
  mine: boolean;
  onPick?: (optionId: number) => void;
  /** 결과가 열린 뒤의 시임(2분할) — 런타임 값이라 `style`로 간다 */
  clipPathOverride?: string;
  /** 결과가 열렸을 때의 득표율. `null`이면 아직 닫혀 있다 */
  percent: number | null;
}

function Face({ option, index, count, mine, onPick, clipPathOverride, percent }: FaceProps) {
  const { clipPath, anchor, nameSize, percentBelow } = splitLayout(count, index);
  const open = percent !== null;
  /**
   * **방금 골랐는가** — 체크의 획을 그릴지 판정한다. 마운트될 때 이미 내 면이었으면(SSR·이동해
   * 온 화면) 그리지 않는다 — 그때 획이 그려지면 "지금 골랐다"는 거짓 신호다(`DrawnCheck` 주석).
   * 값을 마운트 시점에 고정하므로 갈아탄 면은 언제나 "방금"이고, 되돌아온 면도 마찬가지다.
   */
  const [initiallyMine] = useState(mine);
  const justPicked = mine && !initiallyMine;
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

  // ⚠ clipPath는 **완성된 클래스 문자열**이다(split-layout 주석 참고) — 여기서 조립하지 않는다.
  //   결과가 열린 뒤의 시임만 `style`이 덮는다(런타임 값). 같은 프로퍼티라 트랜지션이 잇는다.
  // ⚠ 내 면이 아닌 면은 결과가 열리면 채도를 낮춘다 — 체크가 이미 "내 것"을 말하므로 색은
  //   거들 뿐이다(색이 정보를 혼자 지지 않는다, styling.md). 이미지 면도 함께 눌러 사진이
  //   글자보다 튀지 않게 한다.
  const faceClassName = cn(
    "absolute inset-0 overflow-hidden transition-[clip-path,filter] duration-300 ease-otb",
    clipPath,
    open && !mine && "[filter:saturate(0.5)_brightness(0.85)]",
  );
  const faceStyle = {
    background,
    color,
    clipPath: clipPathOverride,
    WebkitClipPath: clipPathOverride,
  };

  /**
   * 퍼센트 + 체크 — 결과가 열리면 이름 곁에 한 줄이 열린다(시임에 가까운 쪽, `percentBelow`).
   * ⚠ 높이를 `grid-template-rows: 0fr → 1fr`로 트랜지션해 이름이 미끄러져 자리를 내준다.
   * ⚠ `inline-flex`인 이유: 앵커의 `text-align`(left/right/center)을 그대로 따르기 위해서다.
   * ⚠ 체크는 결과가 닫혀 있어도 내 면에 뜬다 — 집계를 기다리는 동안에도 "내 표가 들어갔다"는
   *   응답이 있어야 탭이 먹었는지 알 수 있다.
   */
  const shown = open || mine;
  const percentRow = (
    <span
      className={cn(
        "grid transition-[grid-template-rows] duration-300 ease-otb",
        shown ? "[grid-template-rows:1fr]" : "[grid-template-rows:0fr]",
      )}
    >
      <span className="block overflow-hidden">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 font-mono text-[26px] font-semibold leading-none tabular-nums",
            percentBelow ? "pt-2" : "pb-2",
            "transition-opacity duration-300 ease-otb",
            shown ? "opacity-100" : "opacity-0",
          )}
        >
          {mine && <DrawnCheck size={22} animate={justPicked} />}
          {open && (
            <span>
              <CountUp value={percent} />%
            </span>
          )}
        </span>
      </span>
    </span>
  );

  const content = (
    <span className={cn("absolute block", anchor)}>
      {!percentBelow && percentRow}
      <span className={cn("block font-bold", nameSize)}>{option.label}</span>

      {option.subtitle && (
        <span className="mt-2 block text-[12px] opacity-70">{option.subtitle}</span>
      )}
      {percentBelow && percentRow}

      {/* ⚠ 텍스트가 든 요소라 aria-label을 붙이지 않는다(콘텐츠를 덮어쓴다) */}
      {mine && <span className="sr-only">— 내가 고른 선택지</span>}
    </span>
  );

  /**
   * 네이티브 button — Enter/Space·포커스 링·커서를 브라우저가 제공한다.
   *
   * ⚠⚠ **읽기 전용이어도 요소 타입을 바꾸지 않는다(`disabled`로만 가른다).** 한때 `onPick`이 없으면
   *   `div`를 그렸는데, 서버 렌더·하이드레이션은 세션 `loading`이라 `div`였다가 세션이 복원되는
   *   순간 `button`으로 바뀌면서 **면의 서브트리가 통째로 재마운트**됐다 — 그 안의 `CountUp`이
   *   하이드레이션 뒤에 새로 마운트된 것으로 판정돼 이미 참여한 카드가 하드 로드마다
   *   100%→0%→100%로 튀었다(실측). 세션 상태로 갈리는 것은 속성까지다(`useEntranceMotion` 주석).
   */
  return (
    <button
      type="button"
      aria-pressed={mine}
      disabled={!onPick}
      onClick={onPick ? () => onPick(option.id) : undefined}
      className={cn(faceClassName, "text-left", onPick && "cursor-pointer")}
      style={faceStyle}
    >
      {content}
    </button>
  );
}
