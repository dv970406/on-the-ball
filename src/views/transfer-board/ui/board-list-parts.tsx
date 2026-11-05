import Link from "next/link";
import { ROUTES } from "@/shared/config";
import { EmptyState, textLinkClassName } from "@/shared/ui";

/**
 * 필터 결과가 없을 때 — 관심 필터가 켜져 있고 담은 딜이 하나도 없으면 "조건에 안 맞는다"가 아니라 "아직 담지 않았다"다.
 * 어디서 담는지를 함께 말한다. 담는 버튼은 딜 상세에도, 넓은 화면의 오른쪽 판에도 있어 "딜을 열고"로 쓴다(폭과 무관하게 맞는 문구).
 */
export function BoardEmpty({ watch, watchedCount, isGuest }: { watch: boolean; watchedCount: number; isGuest: boolean }) {
  if (watch && watchedCount === 0) {
    return (
      <EmptyState
        title="관심 목록이 비어 있어요"
        description={
          isGuest
            ? "로그인하고 딜을 열어 관심 목록에 담으면 여기에 모여요."
            : "딜을 열고 ‘관심 목록에 담기’를 누르면 여기에 모여요."
        }
      />
    );
  }
  return <EmptyState title="조건에 맞는 딜이 없어요" />;
}

/**
 * 둘러보기 — 구단별·날짜별 화면으로 가는 길. 그 화면들은 검색 착지점이라 크롤러가 보드에서 찾아 들어갈 앵커가 있어야 한다(사이트맵만으로 두지 않는다).
 * 프리페치를 끈다 — 동적 라우트라 뷰포트 프리페치가 받아 오는 것이 없다(`DealRow`와 같은 판단).
 */
export function BoardBrowseLinks() {
  return (
    <nav aria-label="이적시장 둘러보기" className="flex flex-wrap gap-x-5 px-5 pt-6">
      <Link href={ROUTES.transferClubs} prefetch={false} className={textLinkClassName()}>
        구단별 이적시장
      </Link>
      <Link href={ROUTES.transferDays} prefetch={false} className={textLinkClassName()}>
        날짜별 소식
      </Link>
    </nav>
  );
}
