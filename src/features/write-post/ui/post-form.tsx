"use client";

import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { BarChart2, Image as ImageIcon, Link2 } from "lucide-react";
import { cn } from "@/shared/lib";
import { Chip, Dialog, Icon, buttonClassName } from "@/shared/ui";
import { POST_CATEGORIES } from "@/entities/post";
import { imageInsertion, linkInsertion } from "../lib/markdown-snippet";
import type { PollInput } from "../model/poll-schema";
import { CONTENT_MAX, type PostInput } from "../model/post-schema";
import { useImagePicker } from "../model/use-image-picker";
import { usePollDraft } from "../model/use-poll-draft";
import { usePostDraft } from "../model/use-post-draft";
import { LinkInsertDialog } from "./link-insert-dialog";
import { PollComposer } from "./poll-composer";
import { useAutoGrowTextarea } from "./use-auto-grow-textarea";
import { useCursorInsert } from "./use-cursor-insert";

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
   * 검증을 통과한 입력만 올라온다 — 폼은 값이 유효한지까지만 책임진다.
   *
   * ⚠ **중복 제출 방어는 호출부가 갖는다.** 이 폼은 `isPending`을 prop으로 받는데,
   *   부모가 리렌더되기 전까지는 낡은 값을 다시 읽을 뿐이라 여기서 가드를 들면
   *   **해제 신호가 오지 않아 영구 잠금**이 된다(실측: 실패 후 등록 3연타 → 요청 1건).
   *   가드는 뮤테이션을 조립하는 쪽에 둔다 — `use-duplicate-guard.ts` 참고.
   *
   * ⚠ `poll`을 `PostInput`에 섞지 않는다 — 그러면 `useUpdatePost`가 평생 무시해야 할 필드를
   *   들고 다니게 된다. 투표는 **작성 시에만** 붙고 수정 화면에서는 항상 `null`이다.
   */
  onSubmit: (input: PostInput, poll: PollInput | null) => void;
}

/**
 * 하단 툴바 버튼의 공통 외형.
 *
 * ⚠ 배열 + map으로 만들지 않는다. 버튼마다 핸들러·비활성 조건·진행 상태가 달라서
 *   데이터로 접으면 그 차이가 전부 조건식으로 되돌아온다.
 */
const TOOL_BUTTON =
  "flex size-11 items-center justify-center rounded-sm text-ink-secondary disabled:opacity-40";

/**
 * 작성·수정 공용 에디터 화면 (프로토타입 `screen-community-editor`).
 * 두 화면이 같은 필드·같은 검증·같은 헤더를 쓰므로 한 곳에 둔다.
 *
 * 본문은 **마크다운 원문**을 그대로 담는다(상세에서 Markdown 컴포넌트가 렌더한다).
 * 프로토타입에 미리보기 탭이 없으므로 일반 textarea를 쓴다 — 미리보기를 붙이면 마크다운
 * 렌더 의존(react-markdown 54KB gz)을 작성 화면까지 끌고 오게 되므로 그때 다시 판단한다.
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
  /**
   * 링크 다이얼로그의 열림 상태 겸 초기 라벨.
   * ⚠ `null`이 닫힘이다. 선택 텍스트를 **여는 순간 뽑아 여기 담는다** — 렌더 중에
   *   `cursor.selectedText()` 같은 것을 부르면 ref·DOM을 렌더 중에 읽게 된다.
   */
  const [linkLabel, setLinkLabel] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  /**
   * 에러 문구를 필드에 묶을 id. `aria-invalid`만으로는 "잘못됐다"만 알리고
   * **왜 잘못됐는지는 말하지 못한다** — `TextField`가 이미 두 속성을 짝으로 갖는다.
   */
  const titleErrorId = useId();
  const contentErrorId = useId();

  useAutoGrowTextarea(bodyRef, draft.content);
  // ⚠ 자동 높이 **뒤에** 둔다 — 두 effect가 같은 deps로 도는데, 높이가 확정된 뒤에
  //   캐럿을 잡아야 한다(사유는 use-cursor-insert 주석).
  const cursor = useCursorInsert(bodyRef, draft.content, (next) => change("content", next));
  const pollDraft = usePollDraft();
  const image = useImagePicker((url) =>
    // alt는 비워 둔다 — 파일명("IMG_4821.HEIC")은 설명이 아니라 소음이고,
    // 스크린리더에 그대로 읽히면 없느니만 못하다.
    cursor.insert(imageInsertion("", url, cursor.textBefore())),
  );

  // ⚠ 프로토타입에는 "임시저장됨 · 방금" 캡션이 있었지만 **저장 기능이 없어서 걷어냈다.**
  //   저장 로직·임시저장함 화면·복원 경로가 전부 없는데 캡션만 띄우면, 사용자가 그 말을 믿고
  //   이탈해 작성물을 잃는다. 초안 저장을 실제로 붙일 때 캡션도 함께 되살린다.

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // 검증에 실패하면 호출부까지 가지 않는다 → 그쪽 가드도 잠기지 않아 고쳐서 다시 누를 수 있다
    const input = validate();
    // ⚠ 두 검증을 **모두** 돌린 뒤 판정한다. `if (!input) return`으로 먼저 빠져나가면
    //   제목과 투표가 함께 잘못됐을 때 투표 쪽 문구가 뜨지 않아, 고치고 다시 눌러야
    //   그제서야 나타난다(안내가 두 번에 나뉘어 온다).
    const poll = pollDraft.validate();
    if (!input || poll === undefined) return;
    onSubmit(input, poll);
  };

  /** 이탈 방어는 **생성 모드에서만** — 수정은 원본이 남아 있으므로 바로 돌아간다 */
  const handleCancel = () => {
    if (!editing && status.dirty) setAskLeave(true);
    else leave();
  };

  /** 실제로 화면을 떠난다 — 이 화면에서 올린 사진은 쓰이지 않았으므로 함께 정리한다 */
  const leave = () => {
    image.discardUploads();
    onCancel();
  };

  return (
    <>
      {/* 프레임이 flex 컬럼이라 `h-full`이 아니라 `min-h-0 flex-1`. `relative`는 sr-only 누출 방지 */}
      <main className="relative min-h-0 flex-1 overflow-y-auto pb-[calc(140px+env(safe-area-inset-bottom))]">
        <h1 className="sr-only">{editing ? "글 수정" : "글쓰기"}</h1>

        <form onSubmit={handleSubmit}>
          <header className="sticky top-0 z-20 flex items-center border-b border-hairline-cool bg-canvas px-2 pb-2.5 pt-[max(16px,env(safe-area-inset-top))]">
            {/*
              ⚠ 저장 중에는 취소도 막는다. 뮤테이션을 중단할 방법이 없어서, 저장 왕복 중에
                나가면 **화면만 돌아가고 INSERT/UPDATE는 그대로 커밋된다**(사용자는 취소했다고
                믿는다). 작성 모드는 언마운트로 호출부 콜백까지 죽어 토스트도 안 뜬다.
            */}
            {/* ⚠ 업로드 중에도 막는다. 그 사이 나가면 `discardUploads`가 **빈 목록**을 보고
                지나간 뒤 업로드가 성공해, 정리할 수 있었던 파일이 반드시 고아로 남는다. */}
            <button
              type="button"
              onClick={handleCancel}
              disabled={isPending || image.isPending}
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
                aria-describedby={errors.title ? titleErrorId : undefined}
                onChange={(e) => change("title", e.target.value)}
                className="w-full border-0 bg-transparent p-0 text-2xl font-medium leading-[1.3] tracking-[-0.7px] text-ink outline-none placeholder:text-ink-faint"
              />
            </div>
            {errors.title && (
              <p id={titleErrorId} className="mt-2 text-[12px] text-crimson">
                {errors.title}
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
              value={draft.content}
              aria-invalid={errors.content ? true : undefined}
              aria-describedby={errors.content ? contentErrorId : undefined}
              onChange={(e) => change("content", e.target.value)}
              className="min-h-[180px] w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-[15px] leading-[1.65] text-ink-secondary outline-none placeholder:text-ink-faint"
            />
            {errors.content && (
              <p id={contentErrorId} className="mt-2 text-[12px] text-crimson">
                {errors.content}
              </p>
            )}

            {pollDraft.enabled && (
              <PollComposer
                draft={pollDraft.draft}
                errors={pollDraft.errors}
                onChangeQuestion={pollDraft.change.changeQuestion}
                onChangeOption={pollDraft.change.changeOption}
                onAddOption={pollDraft.change.addOption}
                onRemoveOption={pollDraft.change.removeOption}
                onRemove={pollDraft.toggle}
              />
            )}

            {/* 사진 업로드 실패 — 토스트는 1.8초 뒤 사라지므로 지속 표시를 함께 남긴다 */}
            {image.error && (
              <p className="mt-4 text-[13px] leading-[1.5] text-crimson">
                {image.error.message}
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

      {/* 하단 고정 툴바 — 첨부 버튼과 글자 수 카운터 */}
      <footer
        className="absolute inset-x-0 bottom-0 z-[60] flex items-center gap-1 border-t border-hairline-cool bg-canvas px-3.5 pb-[max(12px,env(safe-area-inset-bottom))] pt-2.5"
      >
        {/* ⚠ aria-disabled + pointer-events-none이 아니라 disabled — 전자는 키보드 포커스를
            막지 못해 툴바에서 무반응 요소를 연속으로 지나게 된다 */}
        {/* ⚠ 파일 대화상자도 오버레이라 textarea가 blur된다 — 누르는 순간 선택 영역을 떠 둔다 */}
        <button
          type="button"
          aria-label="사진 첨부"
          disabled={image.isPending}
          onClick={() => {
            cursor.capture();
            image.open();
          }}
          className={TOOL_BUTTON}
        >
          <Icon as={ImageIcon} size={20} />
        </button>
        {/* ⚠ form 바깥이다 — 안에 두면 제출에 파일이 딸려간다 */}
        <input type="file" {...image.inputProps} className="sr-only" />
        {/* ⚠ 수정 화면에서는 막는다 — 투표는 생성 시 고정이고, 정책에도 UPDATE가 없다 */}
        <button
          type="button"
          aria-label="투표 첨부"
          aria-pressed={editing ? undefined : pollDraft.enabled}
          disabled={editing}
          onClick={pollDraft.toggle}
          className={cn(TOOL_BUTTON, pollDraft.enabled && "bg-canvas-soft text-ink")}
        >
          <Icon as={BarChart2} size={20} />
        </button>
        {/* ⚠ 오버레이가 열리면 textarea가 blur되므로 **누르는 순간** 선택 영역을 떠 둔다 */}
        <button
          type="button"
          aria-label="링크 첨부"
          onClick={() => setLinkLabel(cursor.capture())}
          className={TOOL_BUTTON}
        >
          <Icon as={Link2} size={20} />
        </button>
        {/* ⚠ 코드포인트로 센다 — .length(UTF-16)로 세면 이모지가 2로 잡혀 DB 한도와 어긋난다.
            위에서 이미 센 값을 재사용한다(렌더당 1회). */}
        {/* 업로드 진행 표시 — 스피너를 만들지 않는다(선례가 없고 이징·시간 규칙과 충돌한다) */}
        {image.isPending && (
          <span className="ml-auto text-[11px] text-ink-faint">사진 올리는 중…</span>
        )}
        <span
          className={cn(
            "font-mono text-[11px] tabular-nums text-ink-faint",
            image.isPending ? "ml-2" : "ml-auto",
          )}
        >
          {status.contentLength.toLocaleString("ko-KR")} / {CONTENT_MAX.toLocaleString("ko-KR")}
        </span>
      </footer>

      {/* 열릴 때만 마운트한다 — 언마운트가 곧 입력값 초기화다(사유는 컴포넌트 주석) */}
      {linkLabel !== null && (
        <LinkInsertDialog
          initialLabel={linkLabel}
          onCancel={() => setLinkLabel(null)}
          onConfirm={(label, href) => {
            setLinkLabel(null);
            cursor.insert(linkInsertion(label, href));
          }}
        />
      )}

      <Dialog
        open={askLeave}
        onCancel={() => setAskLeave(false)}
        onConfirm={leave}
        title="작성을 그만둘까요?"
        description="지금 나가면 작성 중인 내용이 사라져요."
        cancelLabel="계속 쓰기"
        confirmLabel="나가기"
      />
    </>
  );
}
