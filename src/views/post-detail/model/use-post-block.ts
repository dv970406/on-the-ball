"use client";

import { useRouter } from "next/navigation";
import { ROUTES } from "@/shared/config";
import { clearScrollRestore, useDuplicateGuard, useToast } from "@/shared/lib";
import { useBlockUser } from "@/features/block-user";

/**
 * 작성자 차단 — 확인 다이얼로그의 `onConfirm`이 그대로 부른다.
 *
 * ⚠ **성공하면 목록으로 떠나야 한다.** 차단이 성사되는 순간 `post_select_visible` 정책이
 *   이 글을 감추므로, 상세에 머무르면 다음 리페치에서 "글을 찾을 수 없어요"가 뜬다.
 *   새로고침해도 404다(서버 조회도 같은 정책을 지난다) — 이동이 곧 정상 동작이다.
 *
 * ⚠ **스크롤 저장분을 함께 버린다.** 방금 감춘 글이 있던 자리로 복원하면 목록이 어긋난 위치에서
 *   시작한다(글 삭제와 같은 처리).
 *
 * ⚠ **가드가 `useBlockUser`가 아니라 여기 있는 이유**: 성공의 부수효과(저장분 폐기 → 이동 →
 *   토스트 문구)가 **이 화면의 결정**이라 features로 내리면 하위 레이어가 "차단 후 어디로
 *   가는가"를 알게 된다. 뮤테이션을 조립하는 쪽이 방어도 갖는다는 규약 그대로이고,
 *   그 자리가 뷰의 model일 뿐이다(`usePostDeletion`과 같은 형태).
 */
export function usePostBlock(authorId: string, nickname: string) {
  const router = useRouter();
  const toast = useToast();
  const blockUser = useBlockUser();
  const guard = useDuplicateGuard(blockUser);

  const block = () => {
    if (guard.isLocked()) return;
    guard.lock();
    blockUser.mutate(authorId, {
      onSuccess: () => {
        clearScrollRestore(ROUTES.postList);
        router.replace(ROUTES.postList);
        toast(`${nickname}님을 차단했어요`);
      },
    });
  };

  return { block, error: blockUser.error };
}
