import type { SurveyOption } from "../model/types";

/**
 * 분할 카드의 도형 — clip-path·텍스트 앵커·이름 크기를 **한 곳이 소유**한다.
 * 흩어지면 선택지 수를 늘렸을 때 조용히 어긋난다(면은 3개인데 앵커는 2개인 식).
 *
 * ⚠ **좌표를 % 로 쓴다.** 카드 비율(4/5 · 3/4)이 달라도 면적비가 유지된다.
 * ⚠ **`[-webkit-clip-path:...]`를 병기한다** — browserslist 미설정이라 벤더 prefix가
 *   자동 생성되지 않는다(styling.md).
 * ⚠⚠ **아래 맵은 완성된 클래스 문자열을 담는다 — 조각을 런타임에 이어 붙이지 말 것.**
 *   Tailwind는 소스 텍스트에서 클래스 후보를 훑으므로 `` `[clip-path:${x}]` `` 처럼
 *   조립하면 **그 유틸이 아예 생성되지 않아 카드가 통짜 사각형으로 나온다**(빌드는 통과한다).
 *   같은 이유로 arbitrary 값 안의 공백은 `_`로 쓴다.
 */

/** 분할 카드로 그릴 수 있는 선택지 개수 */
export type SplitCount = 2 | 3 | 4;

/**
 * 면적을 **정확히 등분하는** 다각형.
 *
 * ⚠ 3분할은 **아래 두 팔이 좌우 변에 닿는다**(바닥 모서리가 아니다). 모서리로 보내면
 *   하단이 밑변 100%에서 치솟는 큰 삼각형이 되어, 면적은 1/3인데도 화면을 지배한다.
 *   접합점 y와 팔 높이는 **합이 4/3이면** 어떤 쌍이든 등분되는데(신발끈 공식으로 확인),
 *   (50%, 83.33%)가 하단을 얕은 띠로 만들면서 값도 깔끔한 쌍이다. 임의로 바꾸지 말 것.
 *
 * ⚠⚠ **세 도형의 접합점은 전부 카드 정중앙이다** — 2분할 시임(0,42%)-(100%,58%)의 중점도,
 *   3분할의 Y 접합점도, 4분할 X의 교점도 (50%, 50%)다. `VsBadge`가 그 사실에 기대어
 *   위치를 고정하므로, 폴리곤을 고칠 때 이 불변식을 깨면 배지가 시임에서 떨어진다.
 */
const CLIP: Record<SplitCount, readonly string[]> = {
  // 비스듬한 대각선 — 42%/58% 좌표를 두 면이 공유해 지그재그 시임을 만든다
  2: [
    "[clip-path:polygon(0_0,100%_0,100%_58%,0_42%)] [-webkit-clip-path:polygon(0_0,100%_0,100%_58%,0_42%)]",
    "[clip-path:polygon(0_42%,100%_58%,100%_100%,0_100%)] [-webkit-clip-path:polygon(0_42%,100%_58%,100%_100%,0_100%)]",
  ],
  // 삼각별(Y) — 중앙에서 위로 한 갈래, 아래 두 팔이 **좌우 변**(바닥 모서리가 아니다)에 닿는다
  3: [
    "[clip-path:polygon(0_0,50%_0,50%_50%,0_83.33%)] [-webkit-clip-path:polygon(0_0,50%_0,50%_50%,0_83.33%)]",
    "[clip-path:polygon(50%_0,100%_0,100%_83.33%,50%_50%)] [-webkit-clip-path:polygon(50%_0,100%_0,100%_83.33%,50%_50%)]",
    "[clip-path:polygon(0_83.33%,50%_50%,100%_83.33%,100%_100%,0_100%)] [-webkit-clip-path:polygon(0_83.33%,50%_50%,100%_83.33%,100%_100%,0_100%)]",
  ],
  // X자 — 중앙에서 네 모서리로. 각 면이 밑변 100% · 높이 50%인 삼각형이라 정확히 25%다
  4: [
    "[clip-path:polygon(0_0,100%_0,50%_50%)] [-webkit-clip-path:polygon(0_0,100%_0,50%_50%)]",
    "[clip-path:polygon(100%_0,100%_100%,50%_50%)] [-webkit-clip-path:polygon(100%_0,100%_100%,50%_50%)]",
    "[clip-path:polygon(100%_100%,0_100%,50%_50%)] [-webkit-clip-path:polygon(100%_100%,0_100%,50%_50%)]",
    "[clip-path:polygon(0_100%,0_0,50%_50%)] [-webkit-clip-path:polygon(0_100%,0_0,50%_50%)]",
  ],
};

/**
 * 면의 텍스트 블록을 어디에 붙일지 — 각 면의 **바깥쪽**이라야 잘리지 않는다.
 * ⚠ 세로 중앙 정렬에 `-translate-y-1/2`를 쓰지 않는다 — Tailwind v4가 이를 `transform`이
 *   아닌 개별 `translate` 프로퍼티로 출력해, 나중에 이 요소에 transform 애니메이션이
 *   붙으면 조용히 합성된다(styling.md가 `vs-pop`에서 실제로 겪은 사고다).
 */
const ANCHOR: Record<SplitCount, readonly string[]> = {
  2: ["left-5 right-5 top-5 text-left", "bottom-7 left-5 right-5 text-right"],
  3: [
    "left-5 top-5 w-[38%] text-left",
    "right-5 top-5 w-[38%] text-right",
    // ⚠ 하단은 **팔 아래**(y > 83.33%)에 둬야 잘리지 않는다 — 그 위는 좌우 면이 차지한다
    "bottom-4 left-5 right-5 text-center",
  ],
  4: [
    "left-5 right-5 top-4 text-center",
    "right-4 top-1/2 w-[38%] [transform:translateY(-50%)] text-right",
    "bottom-4 left-5 right-5 text-center",
    "left-4 top-1/2 w-[38%] [transform:translateY(-50%)] text-left",
  ],
};

/**
 * 면이 좁아질수록 이름을 줄인다.
 * ⚠ `style={{ fontSize }}`로 주지 않는다 — 값이 유한한 열거는 동적이 아니다(styling.md).
 */
const NAME_SIZE: Record<SplitCount, string> = {
  2: "text-[46px] leading-[0.95] tracking-[-2px]",
  3: "text-[30px] leading-[1] tracking-[-1.2px]",
  4: "text-[22px] leading-[1.1] tracking-[-0.8px]",
};


export interface SplitLayout {
  clipPath: string;
  anchor: string;
  nameSize: string;
}

/** 면 하나가 필요로 하는 값 묶음 — 호출부가 맵을 각각 뒤지지 않게 한다 */
export function splitLayout(count: SplitCount, index: number): SplitLayout {
  return {
    clipPath: CLIP[count][index],
    anchor: ANCHOR[count][index],
    nameSize: NAME_SIZE[count],
  };
}

/**
 * 이 문항을 분할 카드로 그릴 수 있으면 **면 개수**를, 아니면 `null`을 돌려준다.
 *
 * ⚠ boolean이 아니라 개수를 돌려주는 이유: 호출부가 `options.length`를 `SplitCount`로
 *   다시 캐스트해야 하는데, 그 캐스트가 이 판정과 갈릴 수 있다.
 *
 * ⚠ **판정을 이 함수가 단독으로 소유한다.** 히어로(views)와 참여 UI(features)가 같은 답을
 *   내야 하는데, 한쪽만 조건을 늘리면 "목록에는 분할 카드인데 상세는 목록"이 된다
 *   (`parsePostId`·`lengthOverflow`와 같은 이유 — 두 곳이 같아야 하는 규약은 함수가 갖는다).
 *
 * ⚠ 색을 **전부** 요구한다. 한 면만 비면 배경 없는 면이 생겨 카드가 깨진다. DB CHECK가
 *   `bg_color`↔`text_color` 쌍은 보장하지만 "한 문항 안에서 전부/전무"는 행 간 제약이라
 *   `rls.sql` 섹션 30이 지킨다 — 여기 검사는 그 방어의 클라이언트 쪽 짝이다.
 */
export function splitCount(options: SurveyOption[]): SplitCount | null {
  const n = options.length;
  if (n !== 2 && n !== 3 && n !== 4) return null;
  if (!options.every((o) => o.bgColor !== null && o.textColor !== null)) return null;
  return n;
}
