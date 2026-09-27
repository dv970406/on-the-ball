"use client";

import { type RefObject, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { useItemGuard, useToast } from "@/shared/lib";
import type { CommentList } from "@/entities/comment";
import { useDeleteComment } from "@/features/delete-comment";

/** 답글 수 재확인을 기다리는 상한 — 로컬 왕복은 수십 ms라 느린 회선을 덮고도 남는다 */
const CHECK_TIMEOUT_MS = 3000;

interface UseCommentDeletionArgs {
  dealId: number;
  /** 받아 온 댓글 목록(거르기 전) — 화면용 목록·확인 문구·대상 소실 판정이 모두 이것에서 나온다 */
  list: CommentList | undefined;
  /** `list`가 자리 표시(다른 사용자로 그린 SSR 목록)인가 — 그동안은 대상 소실을 판정하지 않는다 */
  isPlaceholder: boolean;
  /** 지금 로그인한 사용자 — 대기 중인 댓글이 더는 내 것이 아니면(로그아웃·계정 전환) 다이얼로그를 닫는다 */
  userId: string | undefined;
  /** 목록을 다시 받는다 — `삭제`를 누르는 순간 불러 확인 문구의 답글 수를 최신으로 맞춘다 */
  refetch: () => Promise<unknown>;
  /** 확정·자동 닫힘 뒤 포커스를 받을 자리(댓글 탭 패널) */
  focusFallbackRef: RefObject<HTMLElement | null>;
}

/**
 * 댓글 삭제 — 확인 다이얼로그와 **항목별** 가드(`useItemGuard`)를 조립한다.
 *
 * ⚠ **확인을 늘 받는다.** 삭제 버튼이 답글·표 버튼과 한 줄에 붙어 있어 오탭이 곧 되돌릴 수 없는
 *   삭제가 된다. 답글이 달린 루트면 문구가 "답글 N개도 함께 삭제"를 알린다 — cascade는 RLS가
 *   막지 못하는 경로라 화면이 계약으로 갚는다(`api-and-db.md`).
 * ⚠ **답글 수를 누른 순간의 값으로 굳히지 않는다** — 그러면 화면을 연 뒤 남이 단 답글이 문구에 없이
 *   함께 지워진다(QA 실측). 대기 대상은 id만 들고 문구의 답글 수는 **최신 목록**에서 세며(`dialog.replyCount`),
 *   요청하는 순간 목록을 다시 받아(`refetch`) 문구를 맞춘다.
 * ⚠ **다시 받는 동안에는 확정할 수 없다**(`checking`). 받기 전의 문구로 확정하면 알리지 않은 남의
 *   답글이 지워지는 창이 목록 왕복 시간만큼 남는다(QA 실측 — 느린 회선에서 1초 이상).
 *   받기가 실패하면 풀어 준다 — 그때는 캐시 기준 문구로 판단하게 한다(목록엔 StaleBanner가 뜬다).
 * ⚠ **기다림에 상한을 둔다**(`CHECK_TIMEOUT_MS`). 네트워크 오류는 postgrest-js의 백오프 재시도와
 *   TanStack 재시도가 곱해져 15초, 응답이 멈추면 무기한 확인이 꺼져 있었다(QA 실측). 상한이 지나면
 *   캐시 기준으로 판단하게 하고, 받기가 늦게 끝나면 문구는 그때 최신 값으로 바뀐다(최신 목록에서 센다).
 * ⚠ `disabled={busy}`만으로는 못 막는다 — isPending은 렌더 이후에야 DOM에 반영되고, 같은 tick의
 *   두 번째 요청은 이미 지워진 행이라 0행 → "이미 삭제된 댓글이에요"가 뜬다(옛 게시판 실측).
 *   boolean 하나는 A를 지우는 동안 B를 막고, id 하나는 B를 누르는 순간 A의 잠금이 풀린다 →
 *   **보낸 id의 집합**(`useItemGuard`)이다.
 * ⚠ 다이얼로그는 뷰가 **프레임 직속 자리에** 그린다(`Dialog`가 `absolute`다) — 그래서 대기 대상·문구의
 *   답글 수를 이 훅이 들고 뷰는 `dialog` 묶음을 펼치기만 한다.
 * ⚠ **포커스도 이 훅이 옮긴다.** 확정하거나(대상 버튼이 `삭제 중…`으로 꺼졌다 사라진다) 대상이 이미 없어
 *   저절로 닫히면 다이얼로그가 돌려줄 버튼이 없어 포커스가 `<body>`로 떨어진다(QA 실측) → `focusFallbackRef`로.
 */
export function useCommentDeletion({
  dealId,
  list,
  isPlaceholder,
  userId,
  refetch,
  focusFallbackRef,
}: UseCommentDeletionArgs) {
  const toast = useToast();
  const deleteComment = useDeleteComment(dealId);
  const guard = useItemGuard<number>();
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  /** 지금 기다리는 재확인 — 앞 요청의 늦은 완료·타이머가 뒤 요청의 대기를 풀지 않게 */
  const checkSeqRef = useRef(0);
  /**
   * 내가 삭제를 확정한 댓글 — "남이 지웠다" 안내를 가르는 데 쓴다(답글 칸 — `use-comment-composer`).
   * ⚠ 가드(`isDeleting`)로는 안 된다 — 가드는 `mutateAsync`가 끝나는 순간 풀리는데, 목록이 바뀌어 다시
   *   그려지는 커밋은 그보다 늦다(QA 실측). 렌더에서 읽히도록 state로 둔다.
   */
  const [confirmedIds, setConfirmedIds] = useState<ReadonlySet<number>>(() => new Set());
  /**
   * 삭제에 **성공한** 댓글 — 목록 재조회를 기다리지 않고 화면에서 뺀다. 재조회 대기에 상한(3초)이 있어,
   * 느린 회선에서는 "삭제했어요" 뒤에도 지운 댓글이 활성 `삭제` 버튼과 함께 남을 수 있었다.
   */
  const [removedIds, setRemovedIds] = useState<ReadonlySet<number>>(() => new Set());

  /** 화면에 그릴 목록 — 지운 댓글과 그 답글(cascade)을 뺀다. 탭 건수·확인 문구·대상 소실이 이걸 본다 */
  const visibleList = useMemo(() => {
    if (!list || removedIds.size === 0) return list;
    return {
      ...list,
      comments: list.comments.filter(
        (c) => !removedIds.has(c.id) && !(c.parentId !== null && removedIds.has(c.parentId)),
      ),
    };
  }, [list, removedIds]);

  const focusFallback = () =>
    // 다이얼로그가 닫히며 돌려주는 포커스(사라지거나 꺼진 버튼)보다 뒤에 옮긴다
    requestAnimationFrame(() => focusFallbackRef.current?.focus({ preventScroll: true }));

  const cancel = () => {
    checkSeqRef.current++;
    setChecking(false);
    setPendingId(null);
  };

  /**
   * 대기 중인 삭제가 더는 성립하지 않으면 다이얼로그를 닫는다. 두 경우다.
   * - `gone` — 재확인 결과 그 댓글이 이미 없다(다른 탭·다른 사람이 지웠다 — 루트가 지워져 cascade된 답글 포함).
   *   열어 두면 화면에 없는 댓글의 삭제를 묻고, 확정해야 "이미 삭제됨"이 뜬다 → 알린다.
   * - `notMine` — 그 댓글이 더는 내 것이 아니다(다른 탭의 로그아웃·계정 전환). 열어 두면 게스트에게 삭제를
   *   묻고, 확정하면 권한 없는 요청이 나간다(QA 실측). 세션이 바뀐 것은 화면이 이미 말하므로 조용히 닫는다.
   */
  const pendingTarget =
    pendingId === null ? undefined : visibleList?.comments.find((c) => c.id === pendingId);
  // ⚠ 소유 판정은 자리 표시 목록이어도 한다 — 작성자는 누가 그렸든 같은 사실이라, 기다리면 로그아웃 직후
  //   목록을 다시 받는 동안 게스트에게 다이얼로그가 남는다. 사라짐 판정만 제 목록이 올 때까지 미룬다.
  const pendingInvalid: "gone" | "notMine" | null =
    pendingId === null
      ? null
      : userId === undefined || (pendingTarget !== undefined && pendingTarget.userId !== userId)
        ? "notMine"
        : pendingTarget === undefined && visibleList !== undefined && !isPlaceholder && !checking
          ? "gone"
          : null;
  /**
   * 닫힌 횟수와 사유 — 토스트·포커스는 커밋 뒤에 한다.
   * ⚠ 다이얼로그는 **렌더 중에** 닫는다(이전 값에 맞춰 state를 고치는 React 관용구) — effect에서 닫으면
   *   `react-hooks/set-state-in-effect`에 걸리고, 닫는 대신 파생으로 가리기만 하면 자리 표시 목록이 다시
   *   끼는 순간(로그아웃 직후 등) 판정이 풀려 다이얼로그가 되살아난다.
   * ⚠ 재확인이 진행 중이어도 `checking`을 함께 내린다 — 늦게 끝난 재확인은 요청 번호가 달라 다음 요청의
   *   대기를 건드리지 않는다(`request`가 번호를 올린다).
   */
  const [invalidated, setInvalidated] = useState<{ seq: number; reason: "gone" | "notMine" } | null>(null);
  if (pendingInvalid) {
    setPendingId(null);
    setChecking(false);
    setInvalidated((prev) => ({ seq: (prev?.seq ?? 0) + 1, reason: pendingInvalid }));
  }
  const afterInvalidated = useEffectEvent((reason: "gone" | "notMine") => {
    if (reason === "gone") toast("이미 삭제된 댓글이에요.");
    focusFallback();
  });
  useEffect(() => {
    if (invalidated) afterInvalidated(invalidated.reason);
  }, [invalidated]);

  const request = (commentId: number) => {
    if (guard.isBusy(commentId)) return;
    setPendingId(commentId);
    const seq = ++checkSeqRef.current;
    const release = () => {
      if (checkSeqRef.current === seq) setChecking(false);
    };
    setChecking(true);
    const timer = setTimeout(release, CHECK_TIMEOUT_MS);
    refetch().finally(() => {
      clearTimeout(timer);
      release();
    });
  };

  const confirm = () => {
    if (pendingId === null || checking || pendingInvalid) return;
    const commentId = pendingId;
    setConfirmedIds((prev) => new Set(prev).add(commentId));
    setPendingId(null);
    focusFallback();
    guard.run(commentId, () =>
      deleteComment
        .mutateAsync(commentId)
        .then(() => {
          setRemovedIds((prev) => new Set(prev).add(commentId));
          toast("댓글을 삭제했어요");
        })
        .catch((error: unknown) => {
          // 지우지 못했다 — "내가 지운 댓글"에서 뺀다(나중에 남이 지우면 그때는 안내해야 한다)
          setConfirmedIds((prev) => {
            const next = new Set(prev);
            next.delete(commentId);
            return next;
          });
          throw error;
        }),
    );
  };

  // ⚠ 반환값을 묶음으로 둔다(`code-quality.md` "여섯 개를 넘지 않는다")
  return {
    /** 화면에 그릴 댓글 목록(지운 댓글을 뺀 것) */
    visibleList,
    /** 삭제 확인 다이얼로그 — 뷰가 프레임 자리에 펼친다 */
    dialog: {
      open: pendingId !== null,
      /** 답글 수를 다시 세는 중 — 확인 버튼을 막는다 */
      checking,
      /** 확인을 기다리는 댓글의 답글 수 — **최신 목록**에서 센다 */
      replyCount:
        pendingId === null
          ? 0
          : (visibleList?.comments.filter((c) => c.parentId === pendingId).length ?? 0),
      confirm,
      cancel,
    },
    /** 댓글마다 붙는 `삭제` 버튼 */
    item: {
      /** 확인부터 받는다(이미 지우는 중인 댓글은 무시한다) */
      request,
      /** 그 댓글을 지우는 중인가 — 라벨(`삭제 중…`)과 `disabled`(렌더 중에 부른다) */
      isDeleting: guard.isBusy,
    },
    /** 내가 삭제를 확정한 댓글 — 답글 칸이 "남이 지웠다" 안내를 가를 때 쓴다 */
    confirmedIds,
  };
}
