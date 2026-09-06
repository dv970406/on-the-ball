"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { ROUTES } from "@/shared/config";
import { formatRelativeTime, useNowMs } from "@/shared/lib";
import { Button, Dialog, EmptyState, Markdown, Skeleton, StaleBanner, TextField } from "@/shared/ui";
import { useSessionStore } from "@/entities/session";
import { useAdminPostQuery } from "@/entities/post";
import { usePollQuery } from "@/entities/poll";
import { extractImageUrls } from "@/features/admin-post";
import { SubHeader } from "@/widgets/sub-header";
import { usePostModeration } from "../model/use-post-moderation";
import { PollLabelEditor } from "./poll-label-editor";

type Confirm = "mask" | "remove" | "stripAll" | { url: string } | null;

/**
 * 글 관리.
 *
 * ⚠ **본문을 자유 편집하지 않는다.** 본문은 읽기 전용으로 렌더하고, 아래 액션만 준다 —
 *   이미지 빼기 / 본문 가리기 / 삭제. 어드민이 남의 글을 고쳐 쓰면 작성자 모르게 내용과
 *   "수정됨" 표시가 함께 바뀐다.
 */
export function AdminPostManageView({ postId }: { postId: number }) {
  const nowMs = useNowMs();
  const userId = useSessionStore((s) => s.user?.id);
  const query = useAdminPostQuery(postId);
  const post = query.data;
  const poll = usePollQuery(postId, userId);
  const moderation = usePostModeration(postId);

  const [confirm, setConfirm] = useState<Confirm>(null);
  const [reason, setReason] = useState("");

  const shell = (body: ReactNode) => (
    <>
      <SubHeader title="글 관리" fallbackHref={ROUTES.adminPostList} />
      <main className="no-scrollbar relative min-h-0 flex-1 overflow-y-auto pb-10">
        <h1 className="sr-only">글 관리</h1>
        {body}
      </main>
    </>
  );

  if (query.isPending) {
    return shell(
      <div className="flex flex-col gap-3 px-5 pt-5">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-40 w-full" />
      </div>,
    );
  }
  if (query.error && !post) {
    return shell(
      <EmptyState
        title="글을 불러오지 못했어요"
        description={query.error.message}
        onRetry={() => query.refetch()}
      />,
    );
  }
  if (!post) return shell(<EmptyState title="글을 찾을 수 없어요" />);

  const images = extractImageUrls(post.content);

  return shell(
    <>
      {query.error && <StaleBanner noun="글" onRetry={() => query.refetch()} />}

      <section className="border-b border-hairline-cool px-5 py-4">
        <p className="font-mono text-[11px] tabular-nums text-ink-mute-2">
          #{post.id} · {post.category} · {post.authorNickname} ·{" "}
          {formatRelativeTime(post.createdAt, nowMs)}
        </p>
        <h2 className="mt-1.5 text-[17px] font-semibold leading-[1.4] tracking-[-0.3px] text-ink">
          {post.title}
        </h2>
        {post.deletedAt !== null && (
          <p className="mt-2 text-[12px] text-crimson">
            삭제된 글이에요. 사용자에게는 보이지 않습니다.
          </p>
        )}
      </section>

      <section aria-labelledby="post-body-heading" className="border-b border-hairline-cool px-5 py-4">
        <h3 id="post-body-heading" className="pb-2 text-[13px] font-medium text-ink">
          본문 (읽기 전용)
        </h3>
        <Markdown>{post.content}</Markdown>
      </section>

      <section aria-labelledby="post-images-heading" className="border-b border-hairline-cool px-5 py-4">
        <h3 id="post-images-heading" className="text-[13px] font-medium text-ink">
          본문 이미지 {images.length > 0 && `(${images.length})`}
        </h3>
        {images.length === 0 ? (
          <p className="mt-2 text-[12px] text-ink-mute">본문에 이미지가 없어요.</p>
        ) : (
          <>
            <ul className="mt-3 flex flex-col gap-2">
              {images.map((url) => (
                <li key={url} className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt=""
                    className="h-14 w-20 shrink-0 rounded-sm border border-hairline object-cover"
                  />
                  <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-mute-2">
                    {url}
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={moderation.isPending}
                    onClick={() => setConfirm({ url })}
                  >
                    빼기
                  </Button>
                </li>
              ))}
            </ul>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              disabled={moderation.isPending}
              onClick={() => setConfirm("stripAll")}
            >
              전부 빼기
            </Button>
          </>
        )}
      </section>

      {poll.data && (
        <PollLabelEditor
          poll={poll.data}
          isPending={moderation.isPending}
          onSubmit={moderation.actions.editPoll}
        />
      )}

      <section aria-labelledby="post-actions-heading" className="px-5 py-4">
        <h3 id="post-actions-heading" className="pb-3 text-[13px] font-medium text-ink">
          조치
        </h3>

        {/*
          ⚠ 사유 입력창은 **다이얼로그 밖·상시**여야 한다. 한때 `confirm === "mask"`일 때만
            렌더했는데, `Dialog`가 `absolute inset-0`인 스크림(누르면 닫힌다)과 `aria-modal` +
            포커스 가둠을 갖고 있어 **그 필드가 스크림 아래에 깔렸다** — 클릭하면 다이얼로그가
            닫히고, 키보드·스크린리더로는 아예 닿지 못했다. 결과적으로 사유가 언제나 빈 값이었다.
        */}
        <div className="pb-3">
          <TextField
            label="가리는 사유 (선택)"
            value={reason}
            hint="본문에 '사유: …'로 함께 표시돼요"
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Button variant="secondary" block disabled={moderation.isPending} onClick={() => setConfirm("mask")}>
            본문 가리기
          </Button>
          <Button
            variant="secondary"
            block
            disabled={moderation.isPending}
            onClick={moderation.actions.unmask}
          >
            가린 본문 되돌리기
          </Button>
          {post.deletedAt === null ? (
            <Button variant="dark" block disabled={moderation.isPending} onClick={() => setConfirm("remove")}>
              글 삭제
            </Button>
          ) : (
            <Button
              variant="dark"
              block
              disabled={moderation.isPending}
              onClick={moderation.actions.restore}
            >
              글 되돌리기
            </Button>
          )}
        </div>
        {moderation.error && (
          <p className="mt-3 text-[13px] leading-[1.5] text-crimson">{moderation.error.message}</p>
        )}
      </section>

      <Dialog
        open={confirm !== null}
        onCancel={() => setConfirm(null)}
        title={confirmTitle(confirm)}
        description={confirmDescription(confirm)}
        cancelLabel="그만두기"
        confirmLabel={confirm === "remove" ? "삭제하기" : "진행하기"}
        confirmTone="danger"
        onConfirm={() => {
          const target = confirm;
          setConfirm(null);
          if (target === "mask") moderation.actions.mask(reason);
          else if (target === "remove") moderation.actions.remove();
          else if (target === "stripAll") moderation.actions.stripImages(null);
          else if (target && typeof target === "object") moderation.actions.stripImages([target.url]);
        }}
      />
    </>,
  );
}

function confirmTitle(confirm: Confirm): string {
  if (confirm === "mask") return "본문을 가릴까요?";
  if (confirm === "remove") return "글을 삭제할까요?";
  if (confirm === "stripAll") return "이미지를 전부 뺄까요?";
  return "이 이미지를 뺄까요?";
}

function confirmDescription(confirm: Confirm): string {
  if (confirm === "mask") {
    return "본문이 운영 안내 문구로 바뀌어요. 원본은 보관되니 되돌릴 수 있어요.";
  }
  if (confirm === "remove") {
    return "목록·상세에서 사라져요. 소프트 삭제라 어드민에서 되돌릴 수 있어요.";
  }
  return "본문에서 빼고 올라간 파일도 지워요. 이건 되돌릴 수 없어요.";
}
