import type { ReactNode } from "react";
import { avatarUrl } from "@/shared/config";
// ⚠ 순수 함수는 배럴이 아니라 직접 경로다 — `"use client"`가 없는 렌더러라 서버 렌더 여지를 남긴다(status-badge와 같다).
import { cn } from "@/shared/lib/cn";
import { formatRelativeTime } from "@/shared/lib/format";
import { Avatar, Pill } from "@/shared/ui";
import type { Comment } from "../model/types";

interface CommentItemProps {
  comment: Comment;
  /** 답글이면 아바타 24px · 위아래 여백이 줄고 구분선이 없다 */
  reply?: boolean;
  /** 내가 쓴 댓글 — `나` 뱃지 */
  isMine?: boolean;
  /**
   * 기준 시각 — `serverNowMs ?? useNowMs()`는 뷰가 한다(순서를 뒤집지 않는다 — `data-and-state.md`).
   * `null`이면 절대시각을 그린다.
   */
  nowMs: number | null;
  /** 좋아요·싫어요·답글·삭제 줄 — 쓰기 동작은 features가 갖고 뷰가 조립해 넘긴다 */
  actions?: ReactNode;
  /** 답글 목록과 답글 입력칸 — 본문 칸 **안쪽**에 붙는다 */
  children?: ReactNode;
}

/**
 * 댓글 한 개 — 독립 콘텐츠라 `article`이고 `header`·`footer`를 동반한다.
 * 답글은 루트의 `article` **안에** 중첩된다(HTML 명세가 드는 중첩 article의 예가 댓글이다).
 *
 * ⚠ `"use client"`를 붙이지 않는다 — 상호작용은 `actions`로 받은 컨트롤이 갖고 이 컴포넌트는
 *   그리기만 한다(`architecture.md` "상호작용이 없는 렌더러").
 * ⚠ 구분선은 목록(`li`)이 긋는다 — 정렬 바로 아래 첫 항목에는 선이 없다.
 */
export function CommentItem({ comment, reply, isMine, nowMs, actions, children }: CommentItemProps) {
  return (
    <article
      className={cn(
        "grid gap-2.5",
        reply ? "grid-cols-[24px_minmax(0,1fr)] pb-1 pt-3" : "grid-cols-[28px_minmax(0,1fr)] py-3.5",
      )}
    >
      <Avatar
        label={comment.authorNickname}
        src={avatarUrl(comment.authorAvatarPath)}
        size={reply ? 24 : 28}
        className={reply ? "text-[11px]" : "text-xs"}
      />
      <div className="min-w-0">
        <header className="flex items-center gap-1.5 text-[13px]">
          <span className="truncate font-medium text-ink">{comment.authorNickname}</span>
          {isMine && (
            // 16px 알약 — 상태 표시라 CTA 셈에 들어가지 않는다(styling.md 에메랄드 표). 글자가 뜻을 진다
            <Pill variant="green" className="h-4 shrink-0 px-[5px] py-0 text-[10px]">
              나
            </Pill>
          )}
          <time
            dateTime={comment.createdAt}
            className="shrink-0 whitespace-nowrap font-mono text-[11px] tabular-nums text-ink-mute-2"
          >
            {formatRelativeTime(comment.createdAt, nowMs)}
          </time>
        </header>

        {/*
          평문이다(마크다운이 아니다). ⚠ `keep-all` + `anywhere` — 한국어는 어절 단위로 끊고,
          띄어쓰기 없는 긴 URL·영문은 칸을 넘지 않게 아무 데서나 끊는다.
          ⚠ 화면 한도(300그래핌)는 클라이언트만 강제하므로 우회 삽입된 긴 값도 이 규칙이 칸 안에 가둔다.
        */}
        <p className="mt-1 whitespace-pre-line break-keep text-[14px] leading-[1.55] text-ink-secondary wrap-anywhere">
          {comment.content}
        </p>

        {actions && <footer className="-ml-2 mt-1.5 flex items-center gap-1">{actions}</footer>}
        {children}
      </div>
    </article>
  );
}
