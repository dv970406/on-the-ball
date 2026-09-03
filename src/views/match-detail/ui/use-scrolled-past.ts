"use client";

import { useCallback, useRef, useState } from "react";

/**
 * 붙여 둔 표식이 **위로 스크롤되어 화면 밖으로 나갔는가.**
 *
 * 경기 상세의 고정 바가 이 값으로 스코어 요약을 켠다 — 대진(`h1`)이 보이는 동안에는
 * 같은 정보를 두 번 그리지 않기 위해서다.
 *
 * ⚠ **도메인을 모르는 순수 DOM 메커니즘이라 `model/`이 아니라 컴포넌트 옆에 둔다**
 *   (`architecture.md` — `shared/ui/use-sheet-drag`가 선례).
 * ⚠ **스크롤 이벤트로 짜지 않는다.** 스크롤 컨테이너가 `<main>`이라 `window` 스크롤은
 *   움직이지 않고, 매 프레임 `getBoundingClientRect`를 부르는 형태가 된다.
 *   IntersectionObserver는 **조상의 overflow 클리핑까지 계산에 넣으므로**(root 없이도
 *   `<main>`에 잘리는 것이 그대로 잡힌다) 여기서는 root를 지정할 필요가 없다.
 * ⚠ 판정을 `false`로 시작한다 — 서버 렌더에는 관측기가 없고, 화면 맨 위에서 시작하는 것이
 *   실제로도 맞다. 그래서 하이드레이션 직후 값이 튀지 않는다.
 *
 * ⚠⚠ **`useEffect` + `ref.current`로 짜지 않는다 — 표식이 나중에 마운트되면 영영 붙지 않는다.**
 *   경기 상세의 표식은 `{match && …}` 안에 있어서 **첫 커밋에는 없을 수 있다**(서버
 *   프리페치가 실패하면 첫 렌더가 로딩 상태다 — 프리페치는 최적화일 뿐이라는 규약 그대로다).
 *   빈 의존성 배열의 effect는 그때 한 번 돌고 끝이라 관측기가 붙지 않고, 증상은
 *   "스코어 요약이 영영 안 뜬다"로만 나타나 조용하다.
 *   → **콜백 ref**로 노드가 생기는 순간 붙인다(React 19는 ref 콜백이 돌려준 함수를
 *     정리 함수로 쓴다).
 */
export function useScrolledPast() {
  /**
   * 표식 노드 — 호출부가 스크롤 위치를 **재는 데** 쓴다(탭 전환 시 되감기).
   * ⚠ 콜백 ref를 쓰면 `ref.current`가 없으므로 여기 따로 담는다. 두 값의 성격이 다르다 —
   *   `ref`는 붙이는 것이고 `node`는 읽는 것이다.
   */
  const node = useRef<HTMLDivElement | null>(null);
  const [past, setPast] = useState(false);

  const ref = useCallback((el: HTMLDivElement | null) => {
    node.current = el;
    // 관측기가 없는 환경에서는 요약을 켜지 않는다 — 없어도 화면은 그대로 돈다
    if (el === null || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => setPast(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(el);

    return () => {
      observer.disconnect();
      node.current = null;
      // 표식이 사라졌는데 "지나갔다"로 남으면 다시 나타났을 때 첫 프레임이 틀린다
      setPast(false);
    };
  }, []);

  return { ref, node, past };
}
