"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { BarChart2, Hash, Image as ImageIcon, Link2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { codePointLength, hasVisibleChar, lengthOverflow } from "@/shared/lib";
import { Chip, Dialog, Icon, buttonClassName } from "@/shared/ui";
import { POST_CATEGORIES, type PostCategory } from "@/entities/post";
import {
  CONTENT_MAX,
  TITLE_LIMIT,
  validatePost,
  type PostFieldErrors,
  type PostInput,
} from "../model/post-schema";

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
  const [category, setCategory] = useState<PostCategory | "">(initial?.category ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [fieldErrors, setFieldErrors] = useState<PostFieldErrors>({});
  const [askLeave, setAskLeave] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  /**
   * ⚠ 렌더마다 도는 계산은 **최소한으로** 둔다.
   *   전에는 `dirty`의 .trim() ×2 + `ready`의 validatePost(내부 codePointLength = [...content]
   *   스프레드 ×2) + 하단 카운터의 codePointLength ×1이 **키 입력 한 프레임마다** 돌았다.
   *   본문 상한이 20,000자라 최대 2만 원소 배열을 프레임당 3번 할당하는 셈이고,
   *   같은 프레임에 textarea 자동높이의 scrollHeight 강제 리플로가 겹친다.
   *   → 길이는 여기서 **한 번만** 세고 아래 카운터와 공유한다.
   */
  const contentLength = codePointLength(content);

  // 길이 0 판정에는 .trim()이 필요 없다(공백만 있는 입력도 "쓰다 만 것"이므로 dirty가 맞다)
  const dirty = title.length > 0 || content.length > 0 || category !== "";

  /**
   * 등록 버튼 활성 조건 — **저렴한 검사만** 한다.
   * 진짜 검증(zod)은 제출 시점의 validatePost가 하므로 여기서 또 돌릴 이유가 없다.
   * 두 판정이 갈리지 않도록 기준은 postSchema와 같은 것을 쓴다(hasVisibleChar·코드포인트 길이).
   */
  // ⚠ 길이는 **trim한 뒤** 잰다. zod가 `.trim()` 후 검사하므로 원본으로 재면 판정이 갈린다 —
  //   120자 제목 끝에 공백이 딸려오면(붙여넣기에서 흔하다) zod는 통과시키는데 버튼만 죽었다.
  // ⚠ 제목 한도는 lengthOverflow가 두 단위를 함께 본다(postSchema와 같은 판정기).
  //   그래핌 계산은 제목 길이(120자)에서 0.011ms라 렌더 중에 불러도 무해하다 —
  //   본문에 쓰지 않는 이유가 여기 있다(20,000자면 1.5ms로 14배가 된다).
  const ready =
    category !== "" &&
    hasVisibleChar(title) &&
    !lengthOverflow(title.trim(), TITLE_LIMIT) &&
    hasVisibleChar(content) &&
    codePointLength(content.trim()) <= CONTENT_MAX;

  /** 본문 textarea 자동 높이 확장 — scrollHeight를 그대로 반영한다 */
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [content]);

  // ⚠ 프로토타입에는 "임시저장됨 · 방금" 캡션이 있었지만 **저장 기능이 없어서 걷어냈다.**
  //   저장 로직·임시저장함 화면·복원 경로가 전부 없는데 캡션만 띄우면, 사용자가 그 말을 믿고
  //   이탈해 작성물을 잃는다. 초안 저장을 실제로 붙일 때 캡션도 함께 되살린다.

  /**
   * 중복 제출 동기 가드.
   *
   * ⚠ `disabled={isPending}`만으로는 못 막는다. isPending은 **렌더 이후에야** DOM에
   *   반영되는데, TanStack Query의 상태 변경은 마이크로태스크로 배치되므로
   *   첫 클릭과 거의 동시에 들어온 두 번째 클릭은 아직 enabled인 버튼을 누른다.
   *   실측에서 3연타 → 같은 글 3개가 실제로 생성됐다.
   *   ref는 렌더를 기다리지 않으므로 같은 tick의 연타도 막는다.
   */
  const submittingRef = useRef(false);

  // 제출이 끝나면(성공·실패 무관) 다시 열어준다
  useEffect(() => {
    if (!isPending) submittingRef.current = false;
  }, [isPending]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submittingRef.current) return;

    const result = validatePost({ category, title, content });
    if (!result.ok) {
      setFieldErrors(result.errors);
      return;
    }
    setFieldErrors({});
    submittingRef.current = true;
    onSubmit(result.value);
  };

  /** 이탈 방어는 **생성 모드에서만** — 수정은 원본이 남아 있으므로 바로 돌아간다 */
  const handleCancel = () => {
    if (!editing && dirty) setAskLeave(true);
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
                disabled={!ready || isPending}
                className={buttonClassName({ size: "sm", disabled: !ready || isPending })}
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
                    selected={category === item}
                    onClick={() => {
                      setCategory(item);
                      setFieldErrors((prev) => ({ ...prev, category: undefined }));
                    }}
                  >
                    {item}
                  </Chip>
                ))}
              </div>
            </fieldset>
            {/*
              말머리 미선택 안내. 별도의 zod 에러 표시는 두지 않는다 —
              `ready`가 미선택 상태의 제출을 막으므로 fieldErrors.category가 채워질 경로가 없다
              (전에 있던 분기는 도달 불가였다).
            */}
            {!category && (
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
                value={title}
                aria-invalid={fieldErrors.title ? true : undefined}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, title: undefined }));
                }}
                className="w-full border-0 bg-transparent p-0 text-2xl font-medium leading-[1.3] tracking-[-0.7px] text-ink outline-none placeholder:text-ink-faint"
              />
            </div>
            {fieldErrors.title && (
              <p className="mt-2 text-[12px] text-crimson">
                {fieldErrors.title}
              </p>
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
              value={content}
              aria-invalid={fieldErrors.content ? true : undefined}
              onChange={(e) => {
                setContent(e.target.value);
                setFieldErrors((prev) => ({ ...prev, content: undefined }));
              }}
              className="min-h-[180px] w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-[15px] leading-[1.65] text-ink-secondary outline-none placeholder:text-ink-faint"
            />
            {fieldErrors.content && (
              <p className="mt-2 text-[12px] text-crimson">
                {fieldErrors.content}
              </p>
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
          {contentLength.toLocaleString("ko-KR")} / {CONTENT_MAX.toLocaleString("ko-KR")}
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
