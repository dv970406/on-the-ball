"use client"; // 에러 바운더리는 클라이언트 컴포넌트여야 한다 (Next 규약)

import { useEffect } from "react";
import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { Button, EmptyState, buttonClassName } from "@/shared/ui";
import { ROUTES } from "@/shared/config";

/**
 * 루트 세그먼트 에러 바운더리 — 모든 화면(게시판·인증)의 렌더 오류를 받는다.
 * 이 바운더리가 뜨면 화면 셸까지 대체되므로 탈출 경로로 "홈으로"를 함께 둔다.
 * (루트 layout 자체의 오류는 이 파일이 아니라 global-error.tsx가 담당)
 */
export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // 프로덕션에서는 error.message가 가려지므로 digest로 서버 로그와 대조한다
    console.error("[app] 화면 렌더 중 오류:", error);
  }, [error]);

  return (
    // main·h1을 직접 둔다 — 이 바운더리가 뜨면 화면 셸까지 대체되어
    // 문서에 랜드마크도 heading도 남지 않는다(EmptyState의 title은 <p>다).
    <main className="flex min-h-0 flex-1 items-center justify-center bg-canvas">
      <h1 className="sr-only">화면을 표시하지 못했어요</h1>
      <EmptyState
        icon={CircleAlert}
        title="화면을 표시하지 못했어요"
        description="일시적인 문제일 수 있어요. 다시 시도해 주세요."
        action={
          <div className="flex items-center gap-2">
            <Button variant="dark" size="sm" onClick={() => unstable_retry()}>
              다시 시도
            </Button>
            <Link
              href={ROUTES.home}
              className={buttonClassName({ variant: "secondary", size: "sm" })}
            >
              홈으로
            </Link>
          </div>
        }
      />
    </main>
  );
}
