import Link from "next/link";
import { Compass } from "lucide-react";
import { EmptyState, buttonClassName } from "@/shared/ui";
import { ROUTES } from "@/shared/config";

/** 404 — 존재하지 않는 경로이거나 notFound()가 호출된 세그먼트 */
export default function NotFound() {
  return (
    <div className="flex h-full items-center justify-center bg-canvas">
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
    </div>
  );
}
