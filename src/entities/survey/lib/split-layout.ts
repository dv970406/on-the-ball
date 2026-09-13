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
 * ⚠⚠ **세 도형의 접합점은 전부 카드 정중앙이다** — 2분할 시임(0,58%)-(100%,42%)의 중점도,
 *   3분할의 Y 접합점도, 4분할 X의 교점도 (50%, 50%)다. `VsBadge`가 그 사실에 기대어
 *   위치를 고정하므로, 폴리곤을 고칠 때 이 불변식을 깨면 배지가 시임에서 떨어진다.
 */
const CLIP: Record<SplitCount, readonly string[]> = {
  // 비스듬한 대각선 — 58%/42% 좌표를 두 면이 공유해 지그재그 시임을 만든다.
  // ⚠ **왼쪽이 낮다(58%).** 위 면의 이름은 왼쪽 위, 아래 면의 이름은 오른쪽 아래에 붙는데
  //   그 모서리가 각 면의 **두꺼운 쪽**이어야 결과가 열려 시임이 밀렸을 때도(`splitSeam`)
  //   이름·퍼센트가 잘리지 않는다. 반대로 기울이면 진 면의 글자가 얇은 쐐기에 갇힌다.
  2: [
    "[clip-path:polygon(0_0,100%_0,100%_42%,0_58%)] [-webkit-clip-path:polygon(0_0,100%_0,100%_42%,0_58%)]",
    "[clip-path:polygon(0_58%,100%_42%,100%_100%,0_100%)] [-webkit-clip-path:polygon(0_58%,100%_42%,100%_100%,0_100%)]",
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
/**
 * 결과가 열렸을 때 퍼센트 줄을 이름 **아래**에 둘지(위에 붙은 면) **위**에 둘지(아래에 붙은 면).
 * 어느 쪽이든 퍼센트가 시임에 가깝다 — 면적과 숫자가 같은 사실을 말하므로 나란히 둔다.
 * 4분할의 좌우 면은 세로 중앙이라 어느 쪽이든 되는데, 위 면과 같은 순서(이름 → 퍼센트)로 읽힌다.
 */
const PERCENT_BELOW: Record<SplitCount, readonly boolean[]> = {
  2: [true, false],
  3: [true, true, false],
  4: [true, true, false, true],
};

const NAME_SIZE: Record<SplitCount, string> = {
  2: "text-[46px] leading-[0.95] tracking-[-2px]",
  3: "text-[30px] leading-[1] tracking-[-1.2px]",
  4: "text-[22px] leading-[1.1] tracking-[-0.8px]",
};


export interface SplitLayout {
  clipPath: string;
  anchor: string;
  nameSize: string;
  percentBelow: boolean;
}

/** 면 하나가 필요로 하는 값 묶음 — 호출부가 맵을 각각 뒤지지 않게 한다 */
export function splitLayout(count: SplitCount, index: number): SplitLayout {
  return {
    clipPath: CLIP[count][index],
    anchor: ANCHOR[count][index],
    nameSize: NAME_SIZE[count],
    percentBelow: PERCENT_BELOW[count][index],
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

/**
 * 결과가 열린 뒤의 시임 — **면적이 득표비를 말한다**(Instagram 투표 스티커의 결과 화면).
 *
 * 2분할만 움직인다. 시임은 (0, y왼)–(100%, y오) 대각선이고 위 면의 면적비가 (y왼+y오)/2 이므로,
 * 기울기(16%p)를 그대로 둔 채 두 y를 평행이동하면 면적이 정확히 비율을 따라간다.
 * 접합점은 (50%, (y왼+y오)/2) — `VsBadge`가 이 값을 받아 시임을 따라 내려간다.
 *
 * ⚠ **3·4분할은 `null`이다.** 접합점 하나를 옮기면 세 면·네 면의 면적이 비선형으로 갈려
 *   "면적 = 비율"이 성립하지 않는다 — 거짓 면적을 그리느니 도형을 두고 숫자만 얹는다.
 * ⚠ 비율을 **30~70%로 잠근다.** 100:0이면 진 면이 사라져 이름도 퍼센트도 그릴 자리가 없다.
 *   하한은 글자 블록에서 나온다 — 이름(46px)·퍼센트 줄·부제·여백을 합친 ~130px가 320px 카드의
 *   40%인데, 두꺼운 쪽 모서리 높이가 접합점 ± 8%p이므로 접합점이 30%면 38%가 남는다.
 *   그래서 이 도형은 "정확한 비율"이 아니라 **"어느 쪽이 얼마나 우세한가"** 를 그리는 것이고,
 *   정확한 숫자는 면 위의 퍼센트가 진다(`SurveyBlock`의 막대는 정확하다).
 * ⚠ 값이 런타임(득표)이라 클래스가 아니라 `style`로 준다 — `CLIP`의 완성된 클래스 문자열
 *   규약은 **정적** 도형의 것이고, 여기는 styling.md가 `style`을 허용하는 "런타임에 결정되는
 *   동적 값" 그 자리다. `VsBadge`의 세로 위치도 같은 이유로 `style`이다.
 */
export interface SplitSeam {
  /** 면 순서대로의 `clip-path` 값 */
  clipPaths: [string, string];
  /** 접합점의 세로 위치(%) — VS 배지 자리 */
  junctionTopPct: number;
}

const SEAM_HALF_DROP = 8; // 시임 기울기 = 16%p (정적 도형의 58/42과 같다)
const SEAM_MIN_PCT = 30;
const SEAM_MAX_PCT = 70;

export function splitSeam(count: SplitCount, topRatio: number): SplitSeam | null {
  if (count !== 2) return null;
  const junction = Math.min(SEAM_MAX_PCT, Math.max(SEAM_MIN_PCT, topRatio * 100));
  // 정적 도형과 같은 방향 — 왼쪽이 낮다(위 면의 이름이 있는 왼쪽 위가 두껍다)
  const yLeft = junction + SEAM_HALF_DROP;
  const yRight = junction - SEAM_HALF_DROP;
  return {
    clipPaths: [
      `polygon(0 0, 100% 0, 100% ${yRight}%, 0 ${yLeft}%)`,
      `polygon(0 ${yLeft}%, 100% ${yRight}%, 100% 100%, 0 100%)`,
    ],
    junctionTopPct: junction,
  };
}
