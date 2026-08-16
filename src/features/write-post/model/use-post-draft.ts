"use client";

import { useState } from "react";
import { codePointLength } from "@/shared/lib";
import type { PostCategory } from "@/entities/post";
import { validatePost, type PostFieldErrors, type PostInput } from "./post-schema";

/**
 * 폼이 들고 있는 **검증 전** 값.
 * ⚠ `PostDraft`(`post-schema.ts`)와 달리 말머리를 `PostCategory | ""`로 좁힌다 —
 *   화면의 말머리 칩이 그 목록에서만 고를 수 있기 때문이다. 검증에 넘길 때는
 *   `PostDraft`(category: string)로 자연히 넓어진다.
 */
export interface PostDraftFields {
  category: PostCategory | "";
  title: string;
  content: string;
}

/**
 * 글 작성·수정 폼의 초안 상태 — 값·에러·파생 판정.
 *
 * 반환을 **역할별 네 묶음**으로 둔다(값 / 에러 / 변경 / 판정). 평면으로 펴면 열 개를 넘는데,
 * 그건 개수 문제가 아니라 "이 훅이 관심사를 몇 개 들고 있는가"의 신호다 — 여기서는 하나다
 * (한 폼의 초안). 그래서 쪼개지 않고 묶는다.
 *
 * ⚠ 중복 제출 가드는 **여기도, 폼에도 없다.** 뮤테이션을 조립하는 뷰가 갖는다
 *   (`PostWriteView`·`PostEditView` — 사유는 `use-duplicate-guard.ts`).
 */
export function usePostDraft(initial: PostInput | undefined) {
  const [draft, setDraft] = useState<PostDraftFields>({
    category: initial?.category ?? "",
    title: initial?.title ?? "",
    content: initial?.content ?? "",
  });
  const [errors, setErrors] = useState<PostFieldErrors>({});

  /** 필드 하나를 바꾸고 그 필드의 에러만 지운다 */
  const change = <K extends keyof PostDraftFields>(field: K, value: PostDraftFields[K]) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  /**
   * ⚠ 렌더마다 도는 계산은 **최소한으로** 둔다.
   *   전에는 `dirty`의 .trim() ×2 + `ready`의 validatePost(내부 codePointLength = [...content]
   *   스프레드 ×2) + 하단 카운터의 codePointLength ×1이 **키 입력 한 프레임마다** 돌았다.
   *   본문 상한이 20,000자라 최대 2만 원소 배열을 프레임당 3번 할당하는 셈이고,
   *   같은 프레임에 textarea 자동높이의 scrollHeight 강제 리플로가 겹친다.
   *   → 길이는 여기서 **한 번만** 세고 카운터와 공유한다.
   */
  const contentLength = codePointLength(draft.content);

  // 길이 0 판정에는 .trim()이 필요 없다(공백만 있는 입력도 "쓰다 만 것"이므로 dirty가 맞다)
  const dirty = draft.title.length > 0 || draft.content.length > 0 || draft.category !== "";

  /**
   * 등록 버튼 활성 조건 — **"아직 안 쓴 칸이 있는가"만** 본다.
   *
   * ⚠ **여기서 길이·형식까지 검사하면 안 된다.** 전에는 `lengthOverflow`·`hasVisibleChar`를
   *   함께 봤는데, 그러면 제목이 한도를 넘거나 보이지 않는 문자만 든 순간 **버튼이 죽어
   *   제출 자체가 막히고**, 제출해야 도는 `validate()`가 사유를 말할 기회를 잃는다 →
   *   사용자는 "왜 등록이 안 되는지 알 수 없는" 상태가 된다(실측: 이모지 121자·제로폭 입력에서
   *   안내 문구 0건). 댓글·닉네임은 문구가 뜨는데 여기만 침묵해 **형태도 갈렸다.**
   *
   * → 버튼은 **비어 있을 때만** 막고, 나머지 판정은 전부 제출 시점의 `validatePost`가
   *   문구와 함께 돌려준다. 덤으로 렌더마다 돌던 그래핌 계산이 사라진다.
   */
  const ready =
    draft.category !== "" && draft.title.length > 0 && draft.content.length > 0;

  /** 제출 시점 검증 — 통과하면 `PostInput`, 실패하면 `null`(에러 상태를 채운다) */
  const validate = (): PostInput | null => {
    const result = validatePost(draft);
    if (!result.ok) {
      setErrors(result.errors);
      return null;
    }
    setErrors({});
    return result.value;
  };

  return { draft, errors, change, validate, status: { contentLength, ready, dirty } };
}
