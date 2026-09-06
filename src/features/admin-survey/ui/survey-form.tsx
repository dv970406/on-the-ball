"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Plus, X } from "lucide-react";
import { surveyImageUrl } from "@/shared/config";
import { Button, Icon, TextField } from "@/shared/ui";
import {
  HEX_COLOR_RE,
  SURVEY_OPTION_MAX,
  SURVEY_OPTION_MIN,
  type SurveyDraft,
  type SurveyFieldErrors,
  type SurveyInput,
  type SurveyOptionDraft,
  emptyOptionDraft,
  validateSurvey,
} from "../lib/survey-schema";
import type { useSurveyImageUpload } from "../model/use-survey-image-upload";

interface SurveyFormProps {
  mode: "create" | "edit";
  initial: SurveyDraft;
  /**
   * 표가 있으면 **개수**를 바꿀 수 없다.
   * ⚠ 이건 안내일 뿐이고 실제 차단은 `admin_set_survey_options`의 P0001이다.
   */
  optionsLocked: boolean;
  /** 등록 화면에는 없다 — 경로가 `{survey_id}/…`라 문항을 먼저 만들어야 올릴 수 있다 */
  imageUpload?: ReturnType<typeof useSurveyImageUpload>;
  isPending: boolean;
  error?: Error | null;
  onSubmit: (value: SurveyInput, closesAt: string | null) => void;
}

/**
 * 입축구 등록·수정 폼.
 *
 * ⚠ 가변 배열 필드는 `poll-composer`의 패턴을 그대로 따른다 — `key={index}`(내용으로 키를
 *   잡으면 타이핑마다 리마운트되어 포커스가 날아간다), Enter 제출 방어, 파선 추가 버튼.
 * ⚠ 중복 실행 가드는 여기 두지 않는다(`isPending`을 prop으로 받는 컴포넌트는 낡은 값을 읽어
 *   영구 잠금이 된다) — 뮤테이션을 조립하는 뷰가 갖는다.
 */
export function SurveyForm({
  mode,
  initial,
  optionsLocked,
  imageUpload,
  isPending,
  error,
  onSubmit,
}: SurveyFormProps) {
  const [draft, setDraft] = useState<SurveyDraft>(initial);
  const [errors, setErrors] = useState<SurveyFieldErrors>({});

  const patch = (next: Partial<SurveyDraft>) => {
    setDraft((prev) => ({ ...prev, ...next }));
    setErrors({});
  };

  const patchOption = (index: number, next: Partial<SurveyOptionDraft>) => {
    setDraft((prev) => ({
      ...prev,
      options: prev.options.map((option, i) => (i === index ? { ...option, ...next } : option)),
    }));
    setErrors({});
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const result = validateSurvey(draft);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    onSubmit(result.value, draft.closesAt === "" ? null : draft.closesAt);
  };

  const canAdd = !optionsLocked && draft.options.length < SURVEY_OPTION_MAX;
  const canRemove = !optionsLocked && draft.options.length > SURVEY_OPTION_MIN;

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 pb-10 pt-5">
        <TextField
          label="제목"
          value={draft.title}
          error={errors.title}
          onChange={(e) => patch({ title: e.target.value })}
        />
        <TextField
          label="마감 (한국 시각)"
          type="datetime-local"
          value={draft.closesAt}
          error={errors.closesAt}
          hint={mode === "create" ? "비우면 등록 시점 + 7일" : "비우면 기존 마감을 유지해요"}
          onChange={(e) => patch({ closesAt: e.target.value })}
        />

        <section
          aria-labelledby="survey-options-heading"
          className="mt-2 flex flex-col gap-3 rounded-[14px] border border-hairline-cool bg-canvas-soft px-4 py-4"
        >
          <h2 id="survey-options-heading" className="text-[13px] font-medium text-ink">
            선택지
          </h2>
          {optionsLocked && (
            <p className="text-[12px] leading-[1.6] text-ink-mute">
              이미 참여한 사람이 있어 <b className="font-medium text-ink">개수는 바꿀 수 없어요</b>.
              문구·색·이미지는 고칠 수 있어요.
            </p>
          )}

          {draft.options.map((option, index) => (
            <div
              key={index}
              className="flex flex-col gap-2 rounded-sm border border-hairline-cool bg-canvas p-3"
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <TextField
                    label={`선택지 ${index + 1}`}
                    value={option.label}
                    error={errors.options?.[index]?.label}
                    onKeyDown={preventEnterSubmit}
                    onChange={(e) => patchOption(index, { label: e.target.value })}
                  />
                </div>
                <button
                  type="button"
                  aria-label={`선택지 ${index + 1} 빼기`}
                  disabled={!canRemove}
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      options: prev.options.filter((_, i) => i !== index),
                    }))
                  }
                  className="mt-7 flex size-11 shrink-0 items-center justify-center rounded-sm border border-hairline text-ink-mute disabled:opacity-40"
                >
                  <Icon as={X} size={16} />
                </button>
              </div>

              <TextField
                label="부제"
                value={option.subtitle}
                error={errors.options?.[index]?.subtitle}
                hint="분할 카드에서 이름 아래에 작게 붙어요"
                onKeyDown={preventEnterSubmit}
                onChange={(e) => patchOption(index, { subtitle: e.target.value })}
              />

              <div className="grid grid-cols-2 gap-2">
                <ColorField
                  label="배경색"
                  value={option.bgColor}
                  onChange={(value) => patchOption(index, { bgColor: value })}
                />
                <ColorField
                  label="글자색"
                  value={option.textColor}
                  onChange={(value) => patchOption(index, { textColor: value })}
                />
              </div>
              {errors.options?.[index]?.color && (
                <p className="text-[12px] text-crimson">{errors.options[index].color}</p>
              )}

              {imageUpload ? (
                <div className="flex items-center gap-3">
                  {option.imagePath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={surveyImageUrl(option.imagePath) ?? ""}
                      alt=""
                      className="h-14 w-20 rounded-sm border border-hairline object-cover"
                    />
                  ) : (
                    /* ⚠ 파선을 쓰지 않는다 — 누르면 항목이 생기는 **컨트롤**이 아니라
                       비어 있는 표시 자리다(`styling.md`). 파선은 아래 "선택지 추가"에만 쓴다. */
                    <span className="flex h-14 w-20 items-center justify-center rounded-sm border border-hairline-cool bg-canvas-soft text-[11px] text-ink-faint">
                      없음
                    </span>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={imageUpload.isPending}
                    onClick={() =>
                      imageUpload.openFor(option.imagePath || null, (path) =>
                        patchOption(index, { imagePath: path }),
                      )
                    }
                  >
                    {imageUpload.isPending ? "올리는 중…" : "배경 사진"}
                  </Button>
                  {option.imagePath && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => patchOption(index, { imagePath: "" })}
                    >
                      빼기
                    </Button>
                  )}
                </div>
              ) : (
                <p className="text-[12px] leading-[1.6] text-ink-faint">
                  배경 사진은 저장한 뒤에 올릴 수 있어요(경로가 문항 번호로 시작해요).
                </p>
              )}
            </div>
          ))}

          {/*
            파선 테두리는 "아직 없는 것을 더하는 자리"에만 쓴다 — 누르면 항목이 하나 생기는
            컨트롤이라 이 규칙에 맞는다(`poll-composer`가 선례다).
          */}
          <button
            type="button"
            disabled={!canAdd}
            onClick={() =>
              setDraft((prev) => ({ ...prev, options: [...prev.options, emptyOptionDraft()] }))
            }
            className="flex h-11 w-full items-center justify-center gap-1.5 rounded-sm border border-dashed border-hairline-strong text-[13px] text-ink-mute disabled:opacity-40"
          >
            <Icon as={Plus} size={14} />
            선택지 추가
          </button>
        </section>

        {errors.form && <p className="text-[13px] leading-[1.5] text-crimson">{errors.form}</p>}
        {error && <p className="text-[13px] leading-[1.5] text-crimson">{error.message}</p>}
        {imageUpload?.error && (
          <p className="text-[13px] leading-[1.5] text-crimson">{imageUpload.error.message}</p>
        )}

        <Button type="submit" block disabled={isPending}>
          {isPending ? "저장 중…" : mode === "create" ? "등록하기" : "저장하기"}
        </Button>
      </form>

      {/* ⚠ form 밖에 둔다 — 안에 있으면 파일 입력이 제출 페이로드에 끼어든다 */}
      {imageUpload && <input {...imageUpload.inputProps} className="sr-only" />}
    </>
  );
}

/**
 * ⚠ `<input type="color">`만 두면 "색 없음"을 표현할 수 없다(항상 값이 있다) —
 *   DB는 색이 **쌍이거나 전무**여야 하므로 텍스트 입력을 함께 둬 비울 수 있게 한다.
 */
function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-ink">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} 고르기`}
          value={HEX_COLOR_RE.test(value) ? value : "#111111"}
          onChange={(e) => onChange(e.target.value)}
          className="size-10 shrink-0 rounded-sm border border-hairline bg-canvas"
        />
        <input
          value={value}
          placeholder="#112233"
          aria-label={label}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 min-w-0 flex-1 rounded-sm border border-hairline-strong bg-canvas px-2.5 font-mono text-[13px] text-ink"
        />
      </div>
    </div>
  );
}

/** ⚠ IME 조합 중 Enter는 건드리지 않는다 — 한글 조합 확정도 Enter를 보낸다 */
function preventEnterSubmit(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.key === "Enter" && !e.nativeEvent.isComposing) e.preventDefault();
}
