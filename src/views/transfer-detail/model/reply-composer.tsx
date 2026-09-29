"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { useCommentComposer, type UseCommentComposerOptions } from "./use-comment-composer";

type Composer = ReturnType<typeof useCommentComposer>;

interface ReplyTargetValue {
  /** 지금 답글 칸이 열린 댓글 — 없으면 `null` */
  targetId: number | null;
  open: Composer["reply"]["open"];
  close: Composer["reply"]["close"];
}

const ReplyTargetContext = createContext<ReplyTargetValue | null>(null);
const ReplyFieldContext = createContext<Composer["field"] | null>(null);

interface ReplyComposerProviderProps {
  dealId: number;
  watch: NonNullable<UseCommentComposerOptions["watch"]>;
  fallbackFocusRef: RefObject<HTMLElement | null>;
  children: ReactNode;
}

/**
 * 답글 입력칸의 상태를 댓글 목록 **밖**에 가둔다.
 *
 * 답글 훅(`useCommentComposer`)은 섹션이 한 벌 들어야 한다(칸을 닫아도 실패 롤백이 도착해야 한다). 그런데
 * 그 훅의 입력값 state가 목록을 그리는 컴포넌트에 있으면 **글자마다** 댓글 목록 전체(최대 200개 + 표 버튼
 * 400개, 각자 `useMutation` 옵저버)가 다시 그려진다(INP).
 * → 이 컴포넌트가 훅을 들고 목록은 `children`으로 받는다. 자기 state로 다시 렌더돼도 `children` 요소는
 *   부모가 만든 그대로라 React가 그 서브트리를 건너뛴다. 목록 안에서 답글 상태가 필요한 자리(`답글` 버튼·
 *   답글 칸 자리)만 컨텍스트로 읽는다.
 * ⚠ 컨텍스트를 둘로 가른다 — 대상(`targetId`·`open`·`close`)은 칸을 여닫을 때만 바뀌고, 입력값(`field`)은
 *   글자마다 바뀐다. 하나로 합치면 `답글` 버튼 200개가 글자마다 다시 그려져 원점이다.
 * ⚠ `open`·`close`는 안정된 참조다 — 훅이 렌더마다 새로 만드는 콜백을 ref로 읽는다(그래야 위 대상 값이
 *   `targetId`가 바뀔 때만 새 객체가 된다).
 */
export function ReplyComposerProvider({
  dealId,
  watch,
  fallbackFocusRef,
  children,
}: ReplyComposerProviderProps) {
  const composer = useCommentComposer(dealId, { fallbackFocusRef, watch });
  const latest = useRef(composer);
  useEffect(() => {
    latest.current = composer;
  });
  const open = useCallback<Composer["reply"]["open"]>(
    (target, trigger) => latest.current.reply.open(target, trigger),
    [],
  );
  const close = useCallback(() => latest.current.reply.close(), []);
  const targetId = composer.reply.target?.commentId ?? null;
  const target = useMemo(() => ({ targetId, open, close }), [targetId, open, close]);

  return (
    <ReplyTargetContext value={target}>
      <ReplyFieldContext value={composer.field}>{children}</ReplyFieldContext>
    </ReplyTargetContext>
  );
}

/** 답글 대상과 여닫기 — `답글` 버튼과 답글 칸 자리가 읽는다(칸을 여닫을 때만 바뀐다) */
export function useReplyTarget(): ReplyTargetValue {
  const value = useContext(ReplyTargetContext);
  if (!value) throw new Error("useReplyTarget은 ReplyComposerProvider 안에서만 쓴다");
  return value;
}

/** 답글 입력칸에 펼치는 값 — 글자마다 바뀌므로 **입력칸만** 읽는다 */
export function useReplyField(): Composer["field"] {
  const value = useContext(ReplyFieldContext);
  if (!value) throw new Error("useReplyField는 ReplyComposerProvider 안에서만 쓴다");
  return value;
}
