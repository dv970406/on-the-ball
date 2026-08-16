"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { BarChart2, Hash, Image as ImageIcon, Link2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useDuplicateGuard } from "@/shared/lib";
import { Chip, Dialog, Icon, buttonClassName } from "@/shared/ui";
import { POST_CATEGORIES } from "@/entities/post";
import { CONTENT_MAX, type PostInput } from "../model/post-schema";
import { usePostDraft } from "../model/use-post-draft";
import { useAutoGrowTextarea } from "./use-auto-grow-textarea";

interface PostFormProps {
  /** 수정 모드면 헤더 문구와 이탈 방어 동작이 달라진다 */
  mode: "create" | "edit";
  initial?: PostInput;
  /**
   * 헤더 바로 아래에 붙는 알림(수정 화면의 "최신 내용을 불러오지 못했어요" 배너).
   * ⚠ 슬롯으로 받는 이유: 호출부가 absolute로 얹으면 sticky 헤더를 덮어
   *   `취소`·`수정 완료`가 눌리지 않는다(실측). 폼 내부 일반 흐름에 둔다.
   */
  notice?: ReactNode;
  isPending: boolean;
  /** 훅이 한국어로 바꿔 던진 서버 에러 */
  error?: Error | null;
  /** 취소 — 생성 모드에서 입력이 있으면 이탈 확인을 거친 뒤 호출된다 */
  onCancel: () => void;
  /**
   * ⚠ **반드시 `isPending`을 토글하는 뮤테이션을 시작해야 한다.**
   *   중복 제출 가드가 자기가 잠근 자물쇠를 `isPending`이 false로 돌아올 때 푼다.
   *   mutate하지 않고 반환하면 버튼은 활성인데 클릭이 무시되는 무증상 잠금이 된다.
   */
  onSubmit: (input: PostInput) => void;
}

/** 하단 툴바의 첨부 아이콘 — 핸드오프 7장이 "아직 구현하지 않은 것"으로 못박은 기능들 */
const TOOLS: { icon: LucideIcon; label: string }[] = [
  { icon: ImageIcon, label: "사진 첨부" },
  { icon: BarChart2, label: "투표 첨부" },
  { icon: Link2, label: "링크 첨부" },
  { icon: Hash, label: "해시태그" },
];

/**
 * 작성·수정 공용 에디터 화면 (프로토타입 `screen-community-editor`).
 * 두 화면이 같은 필드·같은 검증·같은 헤더를 쓰므로 한 곳에 둔다.
 *
 * 본문은 **마크다운 원문**을 그대로 담는다(상세에서 Markdown 컴포넌트가 렌더한다).
 * 프로토타입에 미리보기 탭이 없으므로 MarkdownEditor(작성/미리보기 토글)는 쓰지 않는다.
 */
export function PostForm({
  mode,
  initial,
  notice,
  isPending,
  error,
  onCancel,
  onSubmit,
}: PostFormProps) {
  const editing = mode === "edit";
  const { draft, errors, change, validate, status } = usePostDraft(initial);
  const [askLeave, setAskLeave] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useAutoGrowTextarea(bodyRef, draft.content);

  // ⚠ 프로토타입에는 "임시저장됨 · 방금" 캡션이 있었지만 **저장 기능이 없어서 걷어냈다.**
  //   저장 로직·임시저장함 화면·복원 경로가 전부 없는데 캡션만 띄우면, 사용자가 그 말을 믿고
  //   이탈해 작성물을 잃는다. 초안 저장을 실제로 붙일 때 캡션도 함께 되살린다.

  /**
   * 중복 제출 동기 가드.
   *
   * ⚠ **가드가 훅이 아니라 이 폼에 있는 이유**: `PostForm`은 `onSubmit` prop만 받고 그것이
   *   뮤테이션인지 모른다(작성·수정 두 훅이 들어온다). 뮤테이션을 소유한 쪽이 방어한다는
   *   규약의 예외이며, 그래서 `isPending`도 prop으로 받아 잠금 해제 시점을 맞춘다.
   */
  const guard = useDuplicateGuard(isPending);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (guard.isLocked()) return;

    // ⚠ 검증 실패는 잠그지 않는다 — 고쳐서 다시 누를 수 있어야 한다.
    const input = validate();
    if (!input) return;

    guard.lock();
    onSubmit(input);
  };

  /** 이탈 방어는 **생성 모드에서만** — 수정은 원본이 남아 있으므로 바로 돌아간다 */
  const handleCancel = () => {
    if (!editing && status.dirty) setAskLeave(true);
    else onCancel();
  };

  return (
    <>
      <main className="h-full overflow-y-auto pb-[calc(140px+env(safe-area-inset-bottom))]">
        <h1 className="sr-only">{editing ? "글 수정" : "글쓰기"}</h1>

        <form onSubmit={handleSubmit}>
          <header className="sticky top-0 z-20 flex items-center border-b border-hairline-cool bg-canvas px-2 pb-2.5 pt-[max(16px,env(safe-area-inset-top))]">
            {/*
              ⚠ 저장 중에는 취소도 막는다. 뮤테이션을 중단할 방법이 없어서, 저장 왕복 중에
                나가면 **화면만 돌아가고 INSERT/UPDATE는 그대로 커밋된다**(사용자는 취소했다고
                믿는다). 작성 모드는 언마운트로 호출부 콜백까지 죽어 토스트도 안 뜬다.
            */}
            <button
              type="button"
              onClick={handleCancel}
              disabled={isPending}
              className="px-2.5 py-2 text-sm font-medium text-ink-mute disabled:opacity-40"
            >
              취소
            </button>
            {/*
              중앙 제목은 절대 위치 + pointer-events-none — 좌우 버튼의 히트 영역을 덮지 않는다.
              시각 요소일 뿐이므로 스크린리더에는 위의 sr-only h1이 이미 같은 정보를 준다.
            */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 text-center text-[15px] font-semibold tracking-[-0.3px] text-ink"
            >
              {editing ? "글 수정" : "글쓰기"}
            </span>
            <div className="z-1 ml-auto">
              {/* 이 화면의 유일한 컬러 이벤트 */}
              <button
                type="submit"
                disabled={!status.ready || isPending}
                className={buttonClassName({ size: "sm", disabled: !status.ready || isPending })}
              >
                {editing ? "수정 완료" : "등록"}
              </button>
            </div>
          </header>

          {/* 헤더 아래 일반 흐름 — absolute로 얹으면 sticky 헤더의 버튼을 덮는다 */}
          {notice}

          <div className="px-5 pt-4">
            {/* 말머리 — 필수. "전체"는 필터 전용이라 여기엔 없다 */}
            {/* fieldset+legend가 그룹 경계와 이름을 준다 — Chip은 aria-pressed 토글이므로
                role="radiogroup"을 붙이지 않는다(자식 role과 어긋난다) */}
            <fieldset>
              <legend className="sr-only">말머리</legend>
              <div className="flex flex-wrap gap-1.5">
                {POST_CATEGORIES.map((item) => (
                  <Chip
                    key={item}
                    selected={draft.category === item}
                    onClick={() => change("category", item)}
                  >
                    {item}
                  </Chip>
                ))}
              </div>
            </fieldset>
            {/*
              말머리 미선택 안내. 별도의 zod 에러 표시는 두지 않는다 —
              `status.ready`가 미선택 상태의 제출을 막으므로 errors.category가 채워질 경로가 없다
              (전에 있던 분기는 도달 불가였다).
            */}
            {!draft.category && (
              <p className="mt-2.5 text-[11px] text-ink-faint">말머리를 하나 골라 주세요</p>
            )}

            {/*
              ⚠ maxLength를 걸지 않는다. 브라우저의 maxLength는 UTF-16 코드유닛을 세므로
                이모지 제목이 한도의 절반에서 **아무 안내 없이 잘렸다.**
                한도 검사는 DB와 같은 단위(코드포인트)를 쓰는 validatePost가 맡는다.
            */}
            <div className="mt-[22px]">
              <label htmlFor="post-title" className="sr-only">
                제목
              </label>
              <input
                id="post-title"
                name="title"
                placeholder="제목을 입력하세요"
                value={draft.title}
                aria-invalid={errors.title ? true : undefined}
                onChange={(e) => change("title", e.target.value)}
                className="w-full border-0 bg-transparent p-0 text-2xl font-medium leading-[1.3] tracking-[-0.7px] text-ink outline-none placeholder:text-ink-faint"
              />
            </div>
            {errors.title && (
              <p className="mt-2 text-[12px] text-crimson">{errors.title}</p>
            )}

            <hr className="my-4 border-0 border-t border-hairline-cool" />

            <label htmlFor="post-content" className="sr-only">
              내용
            </label>
            <textarea
              id="post-content"
              ref={bodyRef}
              name="content"
              rows={1}
              placeholder={"무슨 얘기를 나눌까요?\n소문이면 출처를 같이 적어주면 좋아요."}
              value={draft.content}
              aria-invalid={errors.content ? true : undefined}
              onChange={(e) => change("content", e.target.value)}
              className="min-h-[180px] w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-[15px] leading-[1.65] text-ink-secondary outline-none placeholder:text-ink-faint"
            />
            {errors.content && (
              <p className="mt-2 text-[12px] text-crimson">{errors.content}</p>
            )}

            {error && (
              <p className="mt-4 text-[13px] leading-[1.5] text-crimson">
                {error.message}
              </p>
            )}
          </div>
        </form>
      </main>

      {/* 하단 고정 툴바 — 첨부 4종은 자리만, 우측은 글자 수 카운터 */}
      <footer
        className="absolute inset-x-0 bottom-0 z-[60] flex items-center gap-1 border-t border-hairline-cool bg-canvas px-3.5 pb-[max(12px,env(safe-area-inset-bottom))] pt-2.5"
      >
        {TOOLS.map((tool) => (
          // ⚠ aria-disabled + pointer-events-none이 아니라 disabled — 전자는 키보드 포커스를
          //   막지 못해 툴바에서 무반응 요소를 연속 4번 지나게 된다(app-bar와 같은 판단)
          <button
            key={tool.label}
            type="button"
            aria-label={tool.label}
            disabled
            className="flex size-11 items-center justify-center rounded-sm text-ink-secondary disabled:opacity-40"
          >
            <Icon as={tool.icon} size={20} />
          </button>
        ))}
        {/* ⚠ 코드포인트로 센다 — .length(UTF-16)로 세면 이모지가 2로 잡혀 DB 한도와 어긋난다.
            위에서 이미 센 값을 재사용한다(렌더당 1회). */}
        <span className="ml-auto font-mono text-[11px] tabular-nums text-ink-faint">
          {status.contentLength.toLocaleString("ko-KR")} / {CONTENT_MAX.toLocaleString("ko-KR")}
        </span>
      </footer>

      <Dialog
        open={askLeave}
        onCancel={() => setAskLeave(false)}
        onConfirm={onCancel}
        title="작성을 그만둘까요?"
        description="지금 나가면 작성 중인 내용이 사라져요."
        cancelLabel="계속 쓰기"
        confirmLabel="나가기"
      />
    </>
  );
}
