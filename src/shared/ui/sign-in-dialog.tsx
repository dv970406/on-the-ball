"use client";

import { useRouter } from "next/navigation";
import { signInWithNext } from "@/shared/config";
import { Dialog } from "./dialog";

interface SignInDialogProps {
  open: boolean;
  /** 닫기 — 스크림 탭·Escape·"닫기"가 모두 이걸 부른다 */
  onClose: () => void;
  /**
   * 무엇을 하려다 막혔는지 — **`~하려면`으로 끝나는 구절**(`"좋아요를 누르려면"`).
   * 뒤 문장은 이 컴포넌트가 붙이므로 호출부는 마침표를 넣지 않는다.
   */
  action: string;
  /**
   * 로그인 후 돌아올 경로. 기본은 **지금 화면**이다.
   *
   * ⚠ 화면을 떠나는 동작(글쓰기·프로필)만 목적지를 따로 준다 — 기본값으로 두면
   *   로그인하고 돌아와서 그 동작을 처음부터 다시 눌러야 한다.
   */
  next?: string;
}

/**
 * "로그인이 필요해요" 안내 — **액션을 누른 비로그인 사용자를 화면 밖으로 던지지 않는다.**
 *
 * 전에는 좋아요·투표·차단·신고·글쓰기가 전부 `router.push(signInWithNext(...))`로 곧바로
 * 로그인 화면으로 갈아치웠다. 사용자가 무엇 때문에 화면을 잃었는지 모른 채 이동하므로
 * 한 단계 안내를 끼우고, **"닫기"로 하던 화면에 남을 길**을 남긴다.
 *
 * ⚠ **대놓고 "로그인"이라고 쓰인 컨트롤은 이 다이얼로그를 쓰지 않는다**
 *   (`AuthStatus`·`CommentBar`의 로그인 버튼) — 목적지가 라벨에 이미 적혀 있어
 *   한 단계 더 묻는 것이 방해가 된다.
 *
 * ⚠ **열림 상태는 호출부가 갖는다.** `Dialog`가 `absolute`라 가장 가까운 positioned 조상을
 *   기준으로 잡는데, 스크롤 영역(`TabScrollArea`·상세의 `<main>`) 안에 두면 스크롤한 만큼
 *   화면 밖에 뜨고 목록에서는 항목 수만큼 생긴다. 액션 컴포넌트는 콜백만 올리고
 *   **뷰가 프레임 직속 자리에 한 벌** 렌더한다.
 */
export function SignInDialog({ open, onClose, action, next }: SignInDialogProps) {
  const router = useRouter();

  return (
    <Dialog
      open={open}
      onCancel={onClose}
      // ⚠ 현재 경로는 **누른 시점에** 읽는다 — `usePathname()`으로 구독하면 콜백에서만 쓰는
      //   값 때문에 이 다이얼로그를 단 화면 전부가 라우트 변화마다 리렌더된다.
      onConfirm={() => router.push(signInWithNext(next ?? window.location.pathname))}
      title="로그인이 필요해요"
      description={`${action} 먼저 로그인해 주세요. ${
        next ? "로그인하면 이어서 진행할 수 있어요." : "로그인하면 이 화면으로 돌아와요."
      }`}
      cancelLabel="닫기"
      confirmLabel="로그인하기"
      confirmTone="primary"
      // ⚠ `alertdialog`가 아니다 — 사용자가 방금 누른 안내라 긴급하지도 파괴적이지도 않다
      role="dialog"
    />
  );
}
