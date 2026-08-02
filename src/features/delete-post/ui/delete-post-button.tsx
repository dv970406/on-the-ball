"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ROUTES } from "@/shared/config";
import { Button, Icon } from "@/shared/ui";
import { useDeletePost } from "../model/use-delete-post";

/** 삭제 버튼 — 되돌릴 수 없으므로 인라인 확인 단계를 한 번 거친다 */
export function DeletePostButton({ postId }: { postId: number }) {
  const router = useRouter();
  const deletePost = useDeletePost(postId);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="flex items-center gap-1 text-[13px] text-ink-mute"
      >
        <Icon as={Trash2} size={14} />
        삭제
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[13px] text-ink-mute">삭제할까요?</span>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => setConfirming(false)}
        disabled={deletePost.isPending}
      >
        취소
      </Button>
      <Button
        size="sm"
        variant="dark"
        disabled={deletePost.isPending}
        onClick={() =>
          deletePost.mutate(undefined, {
            onSuccess: () => router.replace(ROUTES.postList),
          })
        }
      >
        {deletePost.isPending ? "삭제 중…" : "삭제"}
      </Button>
      {deletePost.error && (
        <p role="alert" className="text-[12px] text-crimson">
          {deletePost.error.message}
        </p>
      )}
    </div>
  );
}
