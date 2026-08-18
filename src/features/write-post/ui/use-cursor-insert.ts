"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { Insertion } from "../lib/markdown-snippet";

interface Snapshot {
  start: number;
  end: number;
  /** 스냅샷을 뜬 시점의 본문 — 그 사이 값이 바뀌었으면 위치를 신뢰할 수 없다 */
  value: string;
}

/**
 * textarea의 현재 커서 자리에 텍스트를 끼워 넣는다.
 *
 * `PostForm` 전용 구현 세부사항이라 **배럴에 노출하지 않는다** — 도메인을 모르는 순수
 * DOM 메커니즘이라 `model/`이 아니라 자기 컴포넌트 옆에 둔다(`use-auto-grow-textarea`와 같은 배치).
 *
 * ⚠ **본문을 prop이 아니라 DOM(`el.value`)에서 읽는다.** 이게 규약이다.
 *   삽입은 파일 선택·오버레이를 거쳐 **비동기로** 일어나는데, 렌더 시점 `value`를 클로저에
 *   담아 두면 그 사이 사용자가 친 글이 통째로 사라진다(`onChange`가 낡은 문자열로 값을
 *   덮어쓰기 때문). 게다가 스냅샷 무효화(`snap.value === value`)의 **비교 대상까지 같이 얼어
 *   항상 "유효"로 판정**되어, 이 파일이 적어 둔 방어가 정확히 그 경로에서만 무력했다.
 *   제어 컴포넌트의 `el.value`는 마지막 커밋된 값이라 언제 읽어도 최신이다.
 *
 * ⚠ **`useAutoGrowTextarea` 바로 아래에서 호출한다.** 같은 컴포넌트의 passive effect는 등록
 *   순서대로 돌기 때문에, 이 훅의 캐럿 복원이 높이 확정보다 **뒤에** 와야 한다. 뒤집으면
 *   `style.height = "auto"`가 만드는 높이 붕괴 프레임 위에서 캐럿을 잡게 되어 스크롤이 튄다.
 *
 * ⚠ **네이티브 undo 스택이 끊긴다.** 제어 컴포넌트라 값을 통째로 교체하기 때문이다.
 *   `document.execCommand("insertText")`를 쓰면 undo가 보존되지만 deprecated이고 실패 시
 *   폴백이 필요해 삽입 경로가 둘로 갈린다 — 모바일 우선이라 그 비용을 지지 않는다.
 *
 * @param value 캐럿 복원 effect의 **트리거**로만 쓴다(삽입 계산에는 쓰지 않는다 — 위 주석).
 */
export function useCursorInsert(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  onChange: (next: string) => void,
) {
  /** 오버레이를 여는 순간의 선택 영역. 오버레이가 뜨면 textarea는 이미 blur된 뒤다 */
  const snapshot = useRef<Snapshot | null>(null);
  /** 값 갱신이 DOM에 반영된 뒤 복원할 캐럿 위치 */
  const pending = useRef<[number, number] | null>(null);

  /**
   * 선택 영역을 떠 두고 **그때 선택돼 있던 텍스트를 돌려준다.**
   *
   * ⚠ 텍스트를 여기서 돌려주는 이유가 규약이다 — 호출부가 렌더 중에 `selectedText()` 같은
   *   것을 부르면 ref·DOM을 렌더 중에 읽게 되고, React Compiler를 켜면 그 결과가 메모이즈되어
   *   선택이 바뀌어도 옛 값이 굳는다. 이벤트 핸들러에서 한 번 뽑아 state로 넘긴다.
   */
  const capture = useCallback((): string => {
    const el = ref.current;
    if (!el) return "";
    snapshot.current = { start: el.selectionStart, end: el.selectionEnd, value: el.value };
    return el.value.slice(el.selectionStart, el.selectionEnd);
  }, [ref]);

  /**
   * 삽입 지점과 그 시점의 본문을 함께 정한다.
   * ⚠ 스냅샷을 뜬 뒤 본문이 바뀌었으면(업로드를 기다리는 동안 타이핑) 그 위치는 거짓이다 —
   *   현재 선택 영역으로, 그것도 없으면 맨 끝에 붙인다. 엉뚱한 자리에 끼우느니 낫다.
   */
  const resolve = useCallback((): { text: string; start: number; end: number } => {
    const el = ref.current;
    const text = el?.value ?? "";
    const snap = snapshot.current;
    if (snap && snap.value === text) return { text, start: snap.start, end: snap.end };
    return {
      text,
      start: el?.selectionStart ?? text.length,
      end: el?.selectionEnd ?? text.length,
    };
  }, [ref]);

  /** 삽입 지점 **앞**의 본문 — 줄머리인지 판정해야 하는 블록 삽입(이미지)이 쓴다 */
  const textBefore = useCallback(() => {
    const { text, start } = resolve();
    return text.slice(0, start);
  }, [resolve]);

  const insert = useCallback(
    ({ text: snippet, caret }: Insertion) => {
      const { text, start, end } = resolve();

      onChange(text.slice(0, start) + snippet + text.slice(end));
      pending.current = caret
        ? [start + caret[0], start + caret[1]]
        : [start + snippet.length, start + snippet.length];
      snapshot.current = null;
    },
    [resolve, onChange],
  );

  useEffect(() => {
    const el = ref.current;
    const caret = pending.current;
    if (!el || !caret) return;
    pending.current = null;
    // ⚠ preventScroll — 앱 프레임이 overflow-hidden이라 브라우저가 scroll-into-view를 하면
    //   사용자가 되돌릴 수 없게 화면이 밀린다(useFocusTrap이 같은 이유로 쓴다).
    el.focus({ preventScroll: true });
    el.setSelectionRange(caret[0], caret[1]);
  }, [ref, value]);

  return { capture, textBefore, insert };
}
