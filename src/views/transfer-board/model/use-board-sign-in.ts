"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type BoardQuery, boardHref } from "../lib/board-href";

/** 로그인 안내 한 벌의 내용 — 문구(`~하려면`)와 로그인 뒤 돌아올 곳 */
interface SignInPrompt {
  action: string;
  next: string;
}

/**
 * 보드의 로그인 안내와 돌아올 주소. 안내는 한 벌이고(`SignInDialog`) 관심 칩·레일의 관심 딜 자리·딜 판의 동작이 문구만 바꿔 쓴다.
 *
 * ⚠ 돌아올 주소에는 **판에 열린 딜**까지 싣는다(모바일에는 고른 딜이 없다). 기본값(`/transfers`)으로 두면 로그인하고 돌아왔을 때 필터가 풀리고 판이
 *   첫 딜을 연다 — 주소에 딜이 없던 기본 선택도 id를 싣는다(로그인 뒤 목록이 달라져도 같은 딜이 열리게).
 * ⚠ 콜백은 메모된 레일에 내려가 참조가 고정돼야 한다 — 고른 딜은 누르는 순간에 ref로 읽는다(렌더 값을 잡으면 행을 고를 때마다 콜백이 바뀌어 `memo`가 헛돈다).
 * ⚠ 닫아도 내용은 남긴다 — 닫히는 애니메이션 동안 문구가 비면 글자가 깜빡인다.
 */
export function useBoardSignIn({ query, selectedId }: { query: BoardQuery; selectedId: number | null }) {
  const [prompt, setPrompt] = useState<SignInPrompt>({ action: "", next: "" });
  const [open, setOpen] = useState(false);
  const selectedIdRef = useRef(selectedId);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const show = useCallback((next: SignInPrompt) => {
    setPrompt(next);
    setOpen(true);
  }, []);

  /** 판의 동작 — 돌아오면 지금 보드 + 판에 열린 딜이다 */
  const promptPanelSignIn = useCallback(
    (action: string) => show({ action, next: boardHref(query, selectedIdRef.current) }),
    [show, query],
  );
  /** 관심 딜 모아 보기 — 누른 것이 "관심 딜만 보기"라, 돌아오면 그 필터가 걸려 있어야 다시 누르지 않는다 */
  const promptWatchSignIn = useCallback(
    () => show({ action: "관심 딜을 모아 보려면", next: boardHref({ ...query, watch: true }, selectedIdRef.current) }),
    [show, query],
  );

  return {
    promptPanelSignIn,
    promptWatchSignIn,
    /**
     * 상단 바 "로그인"이 돌아올 주소 — 판에 딜이 열리면 주소가 그 딜의 상세 경로라, 지금 주소로 돌아오면 보드가 아니라 상세가 뜬다.
     * 판의 로그인 안내와 같은 보드 주소(`?deal=`)다.
     */
    returnPath: selectedId === null ? undefined : boardHref(query, selectedId),
    dialog: { open, onClose: () => setOpen(false), action: prompt.action, next: prompt.next },
  };
}
