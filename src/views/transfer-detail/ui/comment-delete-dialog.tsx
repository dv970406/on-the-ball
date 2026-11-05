"use client";

import { formatCount } from "@/shared/lib";
import { Dialog } from "@/shared/ui";

interface CommentDeleteDialogProps {
  dialog: {
    open: boolean;
    cancel: () => void;
    confirm: () => void;
    checking: boolean;
    replyCount: number;
  };
}

/**
 * 댓글 삭제 확인 — 늘 묻는다(`use-comment-deletion` 주석). 답글이 달린 루트는 **남의 답글까지** 함께 사라진다는 것을 알린다 —
 * cascade는 RLS가 막지 못하는 경로라 화면이 계약으로 갚는다.
 */
export function CommentDeleteDialog({ dialog }: CommentDeleteDialogProps) {
  return (
    <Dialog
      open={dialog.open}
      onCancel={dialog.cancel}
      onConfirm={dialog.confirm}
      title="이 댓글을 삭제할까요?"
      description={
        dialog.checking
          ? "달린 답글을 확인하고 있어요."
          : dialog.replyCount > 0
            ? `답글 ${formatCount(dialog.replyCount)}개도 함께 삭제돼요. 되돌릴 수 없어요.`
            : "삭제한 댓글은 되돌릴 수 없어요."
      }
      confirmDisabled={dialog.checking}
      cancelLabel="취소"
      confirmLabel="삭제"
      confirmTone="danger"
    />
  );
}
