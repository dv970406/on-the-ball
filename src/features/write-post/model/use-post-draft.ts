"use client";

import { useState } from "react";
import { codePointLength, hasVisibleChar, lengthOverflow } from "@/shared/lib";
import type { PostCategory } from "@/entities/post";
import {
  CONTENT_MAX,
  TITLE_LIMIT,
  validatePost,
  type PostFieldErrors,
  type PostInput,
} from "./post-schema";

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
 * ⚠ 중복 제출 가드는 **여기 없다.** `PostForm`은 `onSubmit` prop만 받고 그것이 뮤테이션인지
 *   모르므로 폼 자신이 `isPending`을 prop으로 받아 방어한다(`use-duplicate-guard` 주석).
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
   * 등록 버튼 활성 조건 — **저렴한 검사만** 한다.
   * 진짜 검증(zod)은 제출 시점의 validatePost가 하므로 여기서 또 돌릴 이유가 없다.
   * 두 판정이 갈리지 않도록 기준은 postSchema와 같은 것을 쓴다(hasVisibleChar·코드포인트 길이).
   *
   * ⚠ 길이는 **trim한 뒤** 잰다. zod가 `.trim()` 후 검사하므로 원본으로 재면 판정이 갈린다 —
   *   120자 제목 끝에 공백이 딸려오면(붙여넣기에서 흔하다) zod는 통과시키는데 버튼만 죽었다.
   * ⚠ 제목 한도는 lengthOverflow가 두 단위를 함께 본다(postSchema와 같은 판정기).
   *   그래핌 계산은 제목 길이(120자)에서 0.011ms라 렌더 중에 불러도 무해하다 —
   *   본문에 쓰지 않는 이유가 여기 있다(20,000자면 1.5ms로 14배가 된다).
   */
  const ready =
    draft.category !== "" &&
    hasVisibleChar(draft.title) &&
    !lengthOverflow(draft.title.trim(), TITLE_LIMIT) &&
    hasVisibleChar(draft.content) &&
    codePointLength(draft.content.trim()) <= CONTENT_MAX;

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
