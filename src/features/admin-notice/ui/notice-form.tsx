"use client";

import { useId, useState } from "react";
import type { FormEvent } from "react";
import { codePointLength, useNowMs } from "@/shared/lib";
import { NOTICE_TYPES } from "@/entities/notice";
import { Button, Chip, Markdown, TextField } from "@/shared/ui";
import {
  NOTICE_BODY_MAX,
  type NoticeDraft,
  type NoticeFieldErrors,
  type NoticeInput,
  validateNotice,
} from "../lib/notice-schema";

interface NoticeFormProps {
  mode: "create" | "edit";
  initial: NoticeDraft;
  /** `datetime-local` 값 → ISO. KST 고정 변환기를 뷰가 주입한다 */
  toIso: (value: string) => string | null;
  isPending: boolean;
  error?: Error | null;
  onSubmit: (input: NoticeInput) => void;
}

/**
 * 공지 등록·수정 폼.
 *
 * ⚠ **에디터를 새로 들이지 않는다.** 본문은 마크다운 원문이고 미리보기는 기존 `Markdown`
 *   컴포넌트를 그대로 쓴다 — raw HTML을 렌더하지 않는 안전 계약이 그 컴포넌트에 있고,
 *   WYSIWYG를 붙이면 저장 포맷(HTML)이 그 계약 밖으로 나간다.
 * ⚠ 중복 실행 가드는 여기 두지 않는다 — 뮤테이션을 조립하는 뷰가 갖는다.
 */
export function NoticeForm({ mode, initial, toIso, isPending, error, onSubmit }: NoticeFormProps) {
  const [draft, setDraft] = useState<NoticeDraft>(initial);
  const [errors, setErrors] = useState<NoticeFieldErrors>({});
  const [preview, setPreview] = useState(false);
  const bodyId = useId();
  /*
   * ⚠ 렌더 중에 시계를 읽지 않는다 — 검증이 "시작을 비우면 지금부터"를 판정하는 데 쓴다.
   *   `useNowMs()`는 세션당 한 번 고정되지만 노출 기간 검증에는 분 단위 정밀도가 필요 없다.
   */
  const nowMs = useNowMs();

  const patch = (next: Partial<NoticeDraft>) => {
    setDraft((prev) => ({ ...prev, ...next }));
    setErrors({});
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // 시각 기준이 아직 없으면(첫 프레임) 제출을 받지 않는다 — 마운트 직후 곧 채워진다
    if (nowMs === null) return;
    const result = validateNotice(draft, toIso, nowMs);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    onSubmit(result.value);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 pb-10 pt-5">
      <fieldset>
        <legend className="pb-2 text-[13px] font-medium text-ink">타입</legend>
        <div className="flex gap-1.5">
          {NOTICE_TYPES.map((type) => (
            <Chip key={type} selected={draft.type === type} onClick={() => patch({ type })}>
              {type}
            </Chip>
          ))}
        </div>
      </fieldset>

      <TextField
        label="제목"
        value={draft.title}
        error={errors.title}
        onChange={(e) => patch({ title: e.target.value })}
      />

      <div className="grid grid-cols-2 gap-2">
        <TextField
          label="노출 시작"
          type="datetime-local"
          value={draft.opensAt}
          error={errors.opensAt}
          hint="비우면 지금부터"
          onChange={(e) => patch({ opensAt: e.target.value })}
        />
        <TextField
          label="노출 종료"
          type="datetime-local"
          value={draft.closesAt}
          error={errors.closesAt}
          hint="비우면 무기한"
          onChange={(e) => patch({ closesAt: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-ink">내용 (마크다운)</span>
          <Button
            variant="secondary"
            size="sm"
            className="ml-auto"
            onClick={() => setPreview((prev) => !prev)}
          >
            {preview ? "고치기" : "미리보기"}
          </Button>
        </div>

        {preview ? (
          <div className="min-h-[220px] rounded-sm border border-hairline-cool bg-canvas px-3.5 py-3">
            {/* 실제 화면과 같은 렌더러를 쓴다 — 미리보기가 실물과 어긋날 수 없다 */}
            <Markdown>{draft.body}</Markdown>
          </div>
        ) : (
          <textarea
            id={bodyId}
            aria-label="내용 (마크다운)"
            aria-invalid={errors.body ? true : undefined}
            aria-describedby={errors.body ? `${bodyId}-error` : undefined}
            value={draft.body}
            onChange={(e) => patch({ body: e.target.value })}
            className="min-h-[220px] w-full resize-y rounded-sm border border-hairline-strong bg-canvas px-3.5 py-3 text-[15px] leading-[1.7] text-ink focus:border-ink focus:outline-none"
          />
        )}
        {/* 에러를 필드에 묶는다 — ARIA를 쓰는 두 경우 중 하나다(`code-quality.md`) */}
        {errors.body && (
          <p id={`${bodyId}-error`} className="text-[12px] text-crimson">
            {errors.body}
          </p>
        )}
        {/*
          ⚠ `.length`(UTF-16 코드유닛)로 세지 않는다 — 판정은 `codePointLength`가 하므로
            이모지 본문에서 표시와 판정이 어긋난다(`reuse.md`).
        */}
        <p className="text-right font-mono text-[11px] text-ink-faint">
          {codePointLength(draft.body)} / {NOTICE_BODY_MAX}
        </p>
      </div>

      {errors.form && <p className="text-[13px] text-crimson">{errors.form}</p>}
      {error && <p className="text-[13px] leading-[1.5] text-crimson">{error.message}</p>}

      <Button type="submit" block disabled={isPending}>
        {isPending ? "저장 중…" : mode === "create" ? "등록하기" : "저장하기"}
      </Button>
    </form>
  );
}
