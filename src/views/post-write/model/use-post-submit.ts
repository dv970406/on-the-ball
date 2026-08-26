"use client";

import { useRouter } from "next/navigation";
import { ROUTES } from "@/shared/config";
import { clearScrollRestore, useDuplicateGuard, useToast } from "@/shared/lib";
import { type PollInput, type PostInput, useCreatePost } from "@/features/write-post";

/**
 * 글 등록 — `PostForm`의 `onSubmit`이 그대로 부른다.
 *
 * ⚠ **가드가 `useCreatePost`가 아니라 여기 있는 이유**: 등록 성공의 부수효과(스크롤 저장분
 *   폐기 → 목록으로 replace → 토스트)가 **이 화면의 결정**이라 features로 내릴 수 없다.
 *   그러면 하위 레이어가 "등록 후 어디로 가는가"를 알게 된다. 뮤테이션을 **조립하는 쪽**이
 *   방어도 갖는다는 규약(`data-and-state.md`)을 지키되, 그 자리가 뷰의 model일 뿐이다.
 *   선례는 `views/post-detail/model/use-post-deletion.ts`다.
 *
 * ⚠ **가드를 `PostForm`에 둘 수 없다.** 폼은 `isPending`을 prop으로 받아 부모가 리렌더될
 *   때까지 낡은 값을 읽으므로, 거기서 잠그면 해제 신호가 오지 않아 첫 실패 이후 그 화면에서
 *   영영 제출할 수 없게 된다(실측: 등록 3연타 → 요청 1건). 폼은 검증까지만 한다.
 *
 * ⚠ `clearScrollRestore` → `router.replace` → `toast` **순서를 지킨다.** 첫 줄을 빠뜨리면
 *   새 글이 목록 맨 위에 붙는데 저장된 스크롤이 복원되어 화면 밖에 놓인다.
 *
 * ⚠ 맨 `mutate`를 함께 내보내지 않는다 — 가드를 이 훅이 가졌으므로 새어 나가면 방어가
 *   호출자의 기억력에 걸린다(`reuse.md`).
 */
export function usePostSubmit() {
  const router = useRouter();
  const toast = useToast();
  const createPost = useCreatePost();
  const guard = useDuplicateGuard(createPost);

  // ⚠ `PostForm`의 시그니처를 그대로 받는다 — 투표 없음은 `undefined`가 아니라 `null`이다.
  const submit = (input: PostInput, poll: PollInput | null) => {
    if (guard.isLocked()) return;
    guard.lock();
    createPost.mutate(
      { input, poll },
      {
        onSuccess: () => {
          // 새 글은 목록 맨 위에 붙는다 — 저장된 스크롤을 복원하면 화면 밖이라 안 보인다
          clearScrollRestore(ROUTES.postList);
          // 프로토타입은 등록 후 **목록**으로 돌아간다(상세가 아니다).
          // 작성 화면으로 뒤로가기 하지 않도록 replace.
          router.replace(ROUTES.postList);
          toast("작성을 완료했어요");
        },
      },
    );
  };

  /** 이탈(취소) — 성공 경로와 같은 목적지를 이 훅이 함께 소유한다 */
  const cancel = () => router.replace(ROUTES.postList);

  return { submit, cancel, isPending: createPost.isPending, error: createPost.error };
}
