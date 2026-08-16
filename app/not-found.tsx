import type { Metadata } from "next";
import Link from "next/link";
import { Compass } from "lucide-react";
import { EmptyState, buttonClassName } from "@/shared/ui";
import { ROUTES } from "@/shared/config";

export const metadata: Metadata = { title: "페이지를 찾을 수 없어요" };

/**
 * 404 — 존재하지 않는 경로이거나 notFound()가 호출된 세그먼트.
 *
 * ⚠ main·h1을 직접 둔다. EmptyState의 title은 <p>라(공용 컴포넌트라 그게 맞다)
 *   이 화면만 두면 문서에 heading도 랜드마크도 0개가 된다.
 *   시각적으로는 EmptyState가 이미 제목을 그리므로 h1은 sr-only로 둔다.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-0 flex-1 items-center justify-center bg-canvas">
      <h1 className="sr-only">페이지를 찾을 수 없어요</h1>
      <EmptyState
        icon={Compass}
        title="페이지를 찾을 수 없어요"
        description="주소가 바뀌었거나 삭제된 화면이에요."
        action={
          <Link href={ROUTES.home} className={buttonClassName({ size: "sm" })}>
            홈으로
          </Link>
        }
      />
    </main>
  );
}
