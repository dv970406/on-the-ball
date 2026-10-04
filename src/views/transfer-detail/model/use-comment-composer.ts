"use client";

import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { hasVisibleChar, useDuplicateGuard, useToast } from "@/shared/lib";
import type { Comment } from "@/entities/comment";
import { isReplyTargetMissing, useWriteComment, validateComment } from "@/features/write-comment";

/** 답글 대상 — 입력칸의 자리와 placeholder(`{닉네임}님에게 답글`)를 정한다 */
export interface ReplyTarget {
  commentId: number;
  nickname: string;
}

export interface UseCommentComposerOptions {
  /** 성공 후(목록 리페치까지 끝난 뒤) — 루트 입력칸은 정렬을 최신순으로 바꾼다 */
  onPosted?: () => void;
  /**
   * 칸을 연 `답글` 버튼이 사라졌을 때(그 댓글이 지워졌다) 포커스를 받을 자리 — 없으면 `<body>`로 떨어진다.
   */
  fallbackFocusRef?: RefObject<HTMLElement | null>;
  /**
   * 답글 칸의 대상이 아직 목록에 있는지 볼 재료 — 답글 칸 인스턴스만 넘긴다. 대상이 사라지면(누가 그
   * 댓글을 지웠다) 칸을 닫고, 쓰던 글이 버려졌을 때만 알린다(아래 대상 소실 effect).
   */
  watch?: {
    /** 화면에 그리는 댓글 목록 */
    comments: Comment[] | undefined;
    /** 목록이 자리 표시(다른 사용자로 그린 SSR 목록)인가 — 그동안은 판정하지 않는다(뒤에 달린 댓글이 빠져 있다) */
    isPlaceholder: boolean;
    /** 내가 삭제를 확정한 댓글 — 내가 지운 것이면 알리지 않는다 */
    confirmedIds: ReadonlySet<number>;
    /**
     * 로그인 상태인가 — 아니면 칸만 닫고 알리지 않는다. 다른 탭의 로그아웃으로 입력칸이 이미 사라진 뒤에
     * 비로그인 목록이 도착해 "삭제됐어요"가 뜨면 사용자는 무엇이 버려졌는지 알 수 없다(QA 실측).
     */
    signedIn: boolean;
  };
}

/**
 * 답글 칸을 열 때 가려지지 않게 남겨 둘 아래쪽 여백 — 하단 고정 바(관심 토글 · safe-area 포함)가
 * 스크롤 영역의 아래를 덮는다. 바의 실제 높이(약 90px)에 숨 쉴 틈을 더했다.
 */
const REVEAL_BOTTOM_CLEARANCE = 112;
const REVEAL_TOP_CLEARANCE = 16;

/**
 * 답글 칸이 스크롤 영역(`<main>`) 밖에 열렸으면 **그 영역만** 필요한 만큼 굴린다.
 *
 * ⚠ `scrollIntoView`를 쓰지 않는다 — 조상 스크롤 컨테이너를 전부 굴리는데, 루트 프레임이
 *   `overflow-hidden`이라 한 번 밀리면 사용자가 되돌릴 수 없다(`useFocusTrap`의 `preventScroll`과 같은 사고).
 * ⚠ 이걸 안 하면 답글이 몇 개만 달려도 칸이 화면 아래에서 열려 아무 일도 없어 보이고, 첫 글자를 치는
 *   순간 브라우저가 캐럿을 보이려고 영역을 크게 튕긴다(QA 실측 292px).
 */
function revealInScroller(el: HTMLElement) {
  const scroller = el.closest("main");
  if (!scroller) return;
  const box = el.getBoundingClientRect();
  const view = scroller.getBoundingClientRect();
  const behavior: ScrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
  const overflowBottom = box.bottom - (view.bottom - REVEAL_BOTTOM_CLEARANCE);
  const overflowTop = view.top + REVEAL_TOP_CLEARANCE - box.top;
  if (overflowBottom > 0) scroller.scrollBy({ top: overflowBottom, behavior });
  else if (overflowTop > 0) scroller.scrollBy({ top: -overflowTop, behavior });
}

/**
 * 댓글·답글 입력 조립 — 입력값, 답글 대상, 검증, 제출 즉시 초기화와 실패 롤백, 포커스.
 *
 * 화면에 인스턴스가 둘이다 — 탭 맨 위의 루트 입력칸과, 댓글마다 열리는 답글 입력칸(한 번에 한 곳만).
 * 답글 쪽은 **댓글 섹션이 한 벌** 들고 있다 — 입력칸 컴포넌트가 제각각 가드를 들면 칸을 닫는 순간
 * 옵저버가 사라져 실패 롤백이 오지 않는다.
 *
 * ⚠ **가드가 `useWriteComment`가 아니라 여기 있는 이유**: 실패 롤백이 입력창 값·답글 대상 같은
 *   **화면의 상태**를 되돌린다. features로 내리면 하위 레이어가 상위의 UI를 알게 된다.
 * ⚠ **`isPending`을 prop으로 받는 입력칸은 가드를 들 수 없다**(`data-and-state.md`) — 그래서 입력칸은
 *   이 훅이 돌려준 값만 펼치고, 이 훅이 뮤테이션 `status`를 직접 읽는다.
 * ⚠ **포커스는 사용자가 연 순간에만 옮긴다.** 실패 롤백이 칸을 되살릴 때 포커스까지 옮기면, 그 사이
 *   다른 입력칸에 치던 글자가 답글 칸으로 흘러 들어간다(QA 실측 — 모른 채 답글로 등록된다).
 * ⚠ 칸이 닫히면(취소·Esc·등록) 포커스를 **칸을 연 `답글` 버튼**으로 돌려준다 — 안 그러면 `<body>`로
 *   떨어져 키보드·스크린리더 사용자가 자리를 잃는다.
 */
export function useCommentComposer(
  dealId: number,
  { onPosted, fallbackFocusRef, watch }: UseCommentComposerOptions = {},
) {
  const writeComment = useWriteComment(dealId);
  const toast = useToast();
  const [content, setContent] = useState("");
  const [error, setError] = useState<string>();
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  /** 칸을 연 `답글` 버튼 — 칸이 닫히면 포커스를 돌려받는다 */
  const triggerRef = useRef<HTMLElement | null>(null);
  /** 이번 `replyTo` 변화가 사용자가 연 것인가(롤백 재오픈이 아닌가) — 포커스·스크롤은 그때만 */
  const revealRef = useRef(false);

  /**
   * 최신 입력값·답글 대상 — 전송 실패 콜백이 "그 사이 사용자가 새로 입력했는지·다른 답글 칸을
   * 열었는지"를 판정하는 데 쓴다. 콜백은 렌더 밖(뮤테이션 완료 시점)에서 도므로 클로저로는 알 수 없다.
   */
  const contentRef = useRef(content);
  const replyToRef = useRef(replyTo);
  useEffect(() => {
    contentRef.current = content;
    replyToRef.current = replyTo;
  }, [content, replyTo]);

  const guard = useDuplicateGuard(writeComment);

  // 사용자가 연 답글 칸 — 바로 쓸 수 있게 포커스를 옮기고, 화면 밖이면 스크롤 영역만 굴린다.
  // ⚠ `preventScroll` — 브라우저가 스크롤을 맞추면 `overflow-hidden` 프레임째 밀릴 수 있다.
  useEffect(() => {
    if (!replyTo || !revealRef.current) return;
    revealRef.current = false;
    const input = inputRef.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    revealInScroller(input.form ?? input);
  }, [replyTo]);

  /** 입력 흔적을 지운다 — 뮤테이션 에러는 **진행 중이 아닐 때만** 초기화한다(아래 ⚠) */
  const clearDraft = () => {
    setContent("");
    setError(undefined);
    // ⚠ 진행 중에 `reset()`하면 옵저버가 그 뮤테이션에서 떨어져 `status`가 idle로 돌아가고,
    //   가드가 풀려 **같은 댓글을 한 번 더 보낼 수 있게** 된다. 에러 문구만 걷을 때 부른다.
    if (writeComment.error) writeComment.reset();
  };

  /**
   * 칸을 연 버튼으로 포커스를 돌려준다 — 그 사이 목록에서 사라졌으면(삭제) 대신 받을 자리로.
   * ⚠ 대신 받을 자리로는 **포커스가 갈 곳을 잃었을 때만**(`<body>`) 옮긴다 — 사용자가 이미 다른
   *   입력칸에서 치고 있는데 옮기면 입력이 끊긴다(대상 소실은 목록이 다시 받아지는 비동기 순간에 온다).
   */
  const returnFocus = () => {
    const trigger = triggerRef.current;
    if (trigger?.isConnected) {
      trigger.focus({ preventScroll: true });
      return;
    }
    const active = document.activeElement;
    if (!active || active === document.body) fallbackFocusRef?.current?.focus({ preventScroll: true });
  };

  const closeReply = () => {
    clearDraft();
    setReplyTo(null);
    returnFocus();
  };

  /**
   * `답글` 버튼 — 같은 댓글이면 닫고(다시 탭하면 닫힘), 다른 댓글이면 그리로 옮긴다.
   * `trigger`는 누른 버튼이다(닫힐 때 포커스를 돌려받는다).
   */
  const openReply = (target: ReplyTarget, trigger: HTMLElement | null) => {
    if (replyTo?.commentId === target.commentId) {
      closeReply();
      return;
    }
    clearDraft();
    triggerRef.current = trigger;
    revealRef.current = true;
    setReplyTo(target);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setContent(e.target.value);
    setError(undefined);
    // ⚠ 뮤테이션 에러는 다음 mutate까지 남는다 — 다시 입력하는 순간 지워야
    //   이미 해소된 실패 문구가 계속 떠 있지 않다.
    if (writeComment.error) writeComment.reset();
  };

  /**
   * ⚠ **한글 조합 중의 Enter는 제출이 아니다.** 조합을 끝내려고 누른 Enter가
   *   폼의 암묵적 제출을 일으키면 마지막 글자가 빠진 채 등록된다. 사파리는 조합을 끝낸 뒤의
   *   keydown에 `isComposing: false` + `keyCode 229`를 싣는다 — 둘 다 본다.
   */
  const handleInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && (e.nativeEvent.isComposing || e.keyCode === 229)) e.preventDefault();
  };

  /** Esc는 **폼 전체**에서 받는다 — `취소`·`등록`에 포커스가 있어도 닫혀야 한다 */
  const handleFormKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== "Escape" || !replyTo || e.nativeEvent.isComposing) return;
    e.preventDefault();
    closeReply();
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (guard.isLocked()) return;

    const trimmed = content.trim();

    /**
     * 빈 값·길이 판정은 전부 features의 `validateComment`가 소유한다.
     * ⚠ 빈 값은 여기까지 오지 않는다 — 빈 값이면 `등록`이 꺼지고, 꺼진 제출 버튼은 Enter의 암묵적
     *   제출도 막는다. 빈 값 분기는 버튼을 거치지 않는 제출(`requestSubmit` 등)의 최후 방어선이다.
     * ⚠ 길이 초과는 조용히 return하지 않는다 — 눌리기는 하는데 아무 일도 안 일어나면 고장으로 읽힌다.
     * ⚠ **검증 실패에서는 잠그지 않는다** — 잠그면 mutate가 없어 `isPending`이 돌지 않고
     *   자물쇠가 영영 풀리지 않는다(use-duplicate-guard 주석).
     */
    const invalid = validateComment(trimmed);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(undefined);

    guard.lock();
    const target = replyTo;

    /**
     * ⚠ 입력창은 **제출 즉시** 비운다. `mutate(..., { onSuccess })`의 콜백은 훅의 onSuccess(무효화
     *   Promise)를 await한 **뒤에** 실행된다 — 거기서 비우면 느린 회선에서 리페치가 끝나는 순간,
     *   그 사이 사용자가 타이핑해 둔 다음 댓글이 통째로 지워진다.
     *   답글 칸도 함께 닫고(포커스는 `답글` 버튼으로), 실패하면 **둘 다** 되돌린다.
     * ⚠⚠ **답글 대상 복원을 빠뜨리면 안 된다.** 입력값만 되돌리면 재전송이 루트 댓글로 등록된다.
     * ⚠ ref도 **동기로** 비운다 — 뮤테이션이 즉시 실패하면(env 미설정 등) onError가 위 setState의
     *   커밋보다 먼저 돌아, 동기화 effect가 아직 안 뛴 ref로 "사용자가 새로 입력했다"고 오판한다.
     */
    setContent("");
    contentRef.current = "";
    if (target) {
      setReplyTo(null);
      replyToRef.current = null;
      returnFocus();
    }
    writeComment.mutate(
      { content: trimmed, parentId: target?.commentId ?? null },
      {
        onSuccess: () => onPosted?.(),
        onError: () => {
          // 그 사이 사용자가 새로 입력했거나 다른 답글 칸을 열었다면 덮지 않는다 — 둘을 같은 기준으로.
          // ⚠ 판정을 setState 업데이터 안에서 하지 않는다 — 업데이터는 순수해야 하고 StrictMode에서
          //   두 번 불릴 수 있다 → ref로 읽는다.
          if (contentRef.current !== "" || replyToRef.current !== null) {
            // ⚠ 실패 문구를 지금 열린 칸에 남기지 않는다 — 다른 댓글의 칸 아래에 붙으면 그 칸이 실패한
            //   것처럼 읽힌다. 실패는 훅의 토스트가 이미 알렸다.
            writeComment.reset();
            return;
          }
          setContent(trimmed);
          // 칸만 되살린다 — 포커스·스크롤은 옮기지 않는다(위 ⚠ 포커스 절)
          if (target) setReplyTo(target);
        },
      },
    );
  };

  const shownError = error ?? writeComment.error?.message;

  /**
   * 대상 소실 — 답글 칸의 대상이 목록에서 사라지면(누가 그 댓글을 지웠다 — 답글 실패 뒤 다시 받은 목록에서도
   * 드러난다) 칸을 닫는다. 대상이 없는 칸을 들고 있으면 다음 `답글`이 "같은 칸 닫기"로 오판되고, 포커스를
   * 돌려줄 버튼도 사라진다.
   *
   * 알리는 것은 **남이 지워서 쓰던 답글이 버려질 때뿐**이다. 알리지 않는 경우:
   * - 쓰던 글이 없다 — 버려진 것이 없고, 방금 나간 다른 토스트("등록했어요")를 덮을 뿐이다.
   * - 내가 그 댓글의 삭제를 확정했다 — "댓글을 삭제했어요"를 엉뚱한 문구가 덮는다(QA 실측).
   * - 답글 전송 실패가 **바로 그 사유**를 이미 말했다(트리거의 "답글을 달 댓글을 찾을 수 없어요…" —
   *   `isReplyTargetMissing`). 다른 실패 문구(길이 초과·네트워크)가 떠 있으면 알린다 — 그 문구는 대상이
   *   지워졌다고 말하지 않으므로, 막으면 쓰던 답글이 설명 없이 사라진다(QA 실측).
   * - 로그인 상태가 아니다(`watch.signedIn`).
   */
  const targetGone =
    replyTo !== null &&
    watch !== undefined &&
    watch.comments !== undefined &&
    !watch.isPlaceholder &&
    !watch.comments.some((c) => c.id === replyTo.commentId);
  /**
   * 대상 소실로 닫힌 횟수와 그때 버려진 글이 있었는가 — 포커스·토스트는 커밋 뒤에 한다.
   * ⚠ 칸은 **렌더 중에** 닫는다(이전 값에 맞춰 state를 고치는 React 관용구). effect에서 닫으면 대상 없는
   *   칸이 한 프레임 그려지고 `react-hooks/set-state-in-effect`에도 걸린다. 조건이 곧바로 거짓이 되므로
   *   반복되지 않는다.
   */
  const [lostTarget, setLostTarget] = useState<{ seq: number; lostDraft: boolean } | null>(null);
  if (targetGone && replyTo && watch) {
    const lostDraft =
      hasVisibleChar(content) &&
      !isReplyTargetMissing(writeComment.error) &&
      watch.signedIn &&
      !watch.confirmedIds.has(replyTo.commentId);
    setReplyTo(null);
    setContent("");
    setError(undefined);
    setLostTarget((prev) => ({ seq: (prev?.seq ?? 0) + 1, lostDraft }));
  }
  const afterTargetLost = useEffectEvent((lostDraft: boolean) => {
    // 진행 중이 아닐 때만 에러를 걷는다(`clearDraft`와 같은 이유)
    if (writeComment.error) writeComment.reset();
    returnFocus();
    if (lostDraft) toast("답글을 달던 댓글이 삭제됐어요");
  });
  useEffect(() => {
    if (lostTarget) afterTargetLost(lostTarget.lostDraft);
  }, [lostTarget]);

  // ⚠ 반환값을 두 묶음으로 둔다(`code-quality.md` "여섯 개를 넘지 않는다")
  return {
    /** 답글 대상과 여닫기 — 루트 입력칸은 쓰지 않는다 */
    reply: { target: replyTo, open: openReply, close: closeReply },
    /** 입력칸에 그대로 펼치는 값들(`CommentForm`) */
    field: {
      formProps: { onSubmit: handleSubmit, onKeyDown: handleFormKeyDown },
      inputProps: {
        ref: inputRef,
        value: content,
        onChange: handleChange,
        onKeyDown: handleInputKeyDown,
        // ⚠ 로컬 검증 실패에만 붙인다 — 서버 에러는 아래 문구와 토스트가 알린다
        "aria-invalid": error ? true : undefined,
        // ⚠ 문구를 필드에 묶는다 — `aria-invalid`만으로는 "왜" 잘못됐는지 말하지 못한다
        "aria-describedby": shownError ? errorId : undefined,
      },
      /** 입력칸 아래 문구 — 로컬 검증 문구 ?? 서버 에러 문구. `id`는 위 `aria-describedby`가 가리킨다 */
      message: shownError ? { id: errorId, text: shownError } : null,
      /**
       * 빈 값이면 `등록`이 꺼진다. isPending은 무효화 리페치가 끝날 때까지 유지된다.
       * ⚠ 여기서 보는 것은 **버튼을 켤지**뿐이다 — 제출 가능 여부의 판정은 `validateComment`가 갖는다.
       */
      canSubmit: !writeComment.isPending && hasVisibleChar(content),
    },
  };
}
