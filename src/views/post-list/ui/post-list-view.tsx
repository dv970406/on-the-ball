"use client";

import { useState } from "react";
import { PenLine } from "lucide-react";
import Link from "next/link";
import {
	POST_CATEGORIES,
	POST_CATEGORY_SLUG,
	POST_LIST_LIMIT,
	POST_SORT_LABEL,
	POST_SORTS,
	PostCard,
	type PostCategory,
	type PostListPage,
	type PostSort,
	usePostListQuery,
} from "@/entities/post";
import { useSessionStore } from "@/entities/session";
import { ROUTES } from "@/shared/config";
import { cn, formatCount } from "@/shared/lib";
import { EmptyState, Icon, SignInDialog, StaleBanner, chipClassName } from "@/shared/ui";
import { AppBar } from "@/widgets/app-bar";
import { AuthStatus } from "@/widgets/auth-status";
import { BottomTabBar } from "@/widgets/bottom-tab-bar";
import { TabScrollArea } from "@/widgets/tab-scroll-area";
import { PostListSkeleton } from "./post-list-skeleton";

interface PostListViewProps {
	/** null = 전체. **URL이 소유한다** — 로컬 state가 아니다 */
	category: PostCategory | null;
	sort: PostSort;
	/** 서버 프리페치 결과. 실패하면 undefined가 오고 클라이언트가 조회한다 */
	initialData?: PostListPage;
	/** 서버가 렌더한 시점의 시각 — HOT 배지·상대시각이 첫 프레임부터 그려지게 한다 */
	serverNowMs?: number;
}

/**
 * 말머리·정렬을 **URL이 소유한다**(로컬 state였다).
 *
 * ⚠ 이유는 SEO다 — 칩이 `<button>`이면 크롤러가 따라갈 링크가 없어 **말머리별 페이지가
 *   존재하지 않는 것과 같다**(구글 *Faceted navigation*: 필터 URL은 앵커로 링크돼야 한다).
 * ⚠ 생 `<a>`가 아니라 `next/link`의 `<Link>`다 — 렌더 결과물이 `<a href>`라 크롤 요건을
 *   충족하면서 프리페치·클라이언트 내비게이션을 함께 얻는다. 생 `<a>`면 매번 전체 리로드다.
 * ⚠ 선택 표시는 `aria-pressed`가 아니라 **`aria-current="page"`** 다 — 토글 버튼의 상태가
 *   아니라 "지금 이 링크의 페이지에 있다"이기 때문이다.
 */
export function PostListView({ category, sort, initialData, serverNowMs }: PostListViewProps) {
	const { data, isPending, isPlaceholderData, error, refetch } = usePostListQuery(
		{ category, sort },
		initialData,
	);

	const posts = data?.items;

	/**
	 * 비로그인이 글쓰기를 눌렀을 때의 안내.
	 *
	 * ⚠ **앵커는 그대로 둔다.** 크롤러가 `/posts/new`를 발견하는 유일한 경로가 이 링크이고
	 *   (`robots.txt`가 아무것도 막지 않는 근거다 — nextjs.md), 크롤러는 목적지 화면의
	 *   `robots: { index: false }`를 읽고 색인하지 않는다. 여기서는 이동을 **가로채기만** 한다.
	 * ⚠ `loading`에는 가로채지 않는다 — 복원 중인 로그인 사용자가 안내를 보면 안 된다.
	 *   그대로 보내도 목적지의 `AuthRequired`가 옳게 판정한다(상세 화면들과 같은 3분기).
	 *   ⚠ proxy에는 라우트 가드가 없다 — 인증 판정은 화면 가드와 RLS가 갖는다(`nextjs.md`).
	 */
	const sessionStatus = useSessionStore((s) => s.status);
	const [askSignIn, setAskSignIn] = useState(false);

	/** 기본 정렬에는 파라미터를 붙이지 않는다 — `?sort=latest`라는 중복 URL을 만들지 않는다 */
	const hrefFor = (target: PostCategory | null, targetSort: PostSort) => {
		const path = target === null ? ROUTES.postList : ROUTES.postCategory(POST_CATEGORY_SLUG[target]);
		return targetSort === "latest" ? path : `${path}?sort=${targetSort}`;
	};

	return (
		<>
			<TabScrollArea>
				{/* 세션 표시는 프로토타입에 없지만, 없으면 비로그인 로그인 진입점이 사라진다 — AppBar 주석 참고 */}
				<AppBar leading={<AuthStatus />} />

				{/*
          ⚠ 화면 제목은 **sr-only**다. 첫 화면의 가장 값진 세로 공간(약 90px)을 큰 제목이
            쓰고 있었는데 새 정보가 아니다 — 현재 탭은 하단 탭바가 이미 알린다.
          ⚠ 다만 **말머리별 페이지에서는 이 제목이 그 페이지의 주제**라 SEO상 의미가 있다.
        */}
				<h1 className="sr-only">{category === null ? "커뮤니티" : `${category} 글`}</h1>

				{/*
          말머리 레일 — 가로 스크롤, 스크롤바 숨김.
          ⚠ 그룹 경계와 접근 가능한 이름이 필요하다. 없으면 스크린리더에 문맥 없는
            링크 6개가 흩어져 들린다.
          ⚠ 상하 패딩이 비대칭이다(위 18px · 아래 12px). 12px 대칭으로 두면 스티키 앱바의
            헤어라인에 칩이 붙어 두 영역이 한 덩어리로 읽힌다.
        */}
				<nav
					aria-label="말머리"
					className="no-scrollbar flex gap-1.5 overflow-x-auto px-5 pb-3 pt-4.5"
				>
					<Link
						href={hrefFor(null, sort)}
						aria-current={category === null ? "page" : undefined}
						className={chipClassName(category === null)}
					>
						전체
					</Link>
					{POST_CATEGORIES.map((item) => (
						<Link
							key={item}
							href={hrefFor(item, sort)}
							aria-current={category === item ? "page" : undefined}
							className={chipClassName(category === item)}
						>
							{item}
						</Link>
					))}
				</nav>

				{/* 정렬 행 (그룹 경계·이름은 말머리 레일과 같은 이유) */}
				<nav
					aria-label="정렬"
					className="flex items-center gap-3.5 border-b border-hairline-cool px-5 pb-2.5 pt-0.5"
				>
					{POST_SORTS.map((item) => (
						<Link
							key={item}
							href={hrefFor(category, item)}
							aria-current={sort === item ? "page" : undefined}
							className={cn(
								"py-1.5 text-[12px] transition-colors duration-150 ease-otb",
								sort === item ? "font-medium text-ink" : "text-ink-mute-2",
							)}
						>
							{POST_SORT_LABEL[item]}
						</Link>
					))}
				</nav>

				{isPending && <PostListSkeleton />}

				{/*
          ⚠ 에러 화면은 **보여줄 데이터가 없을 때만** 띄운다.
            TanStack Query는 성공 후 리페치가 실패해도 data를 유지하므로, 조건을 나누지 않으면
            "글을 불러오지 못했어요" 박스와 정상 목록이 한 화면에 공존한다(모순된 화면).
        */}
				{error && !posts && (
					<EmptyState
						title="글을 불러오지 못했어요"
						description={error.message}
						onRetry={() => refetch()}
					/>
				)}

				{/* 캐시된 목록은 그대로 두고 최신화 실패만 알린다 (상세·수정·댓글과 같은 규약) */}
				{error && posts && (
					<StaleBanner noun="글" onRetry={() => refetch()} />
				)}

				{posts && posts.length === 0 && (
					<EmptyState
						icon={PenLine}
						title="아직 글이 없어요"
						description={
							category === null ? "첫 글을 남겨보세요." : `'${category}' 말머리의 글이 아직 없어요.`
						}
					/>
				)}

				{posts && posts.length > 0 && (
					// 필터를 바꾸는 동안(placeholderData) 이전 목록이 남아 있다는 걸 은은하게 알린다.
					// ⚠ 서버 프리페치가 있으면 isPlaceholderData는 false다 — 이 분기는 클라이언트
					//   전환(리페치)에서만 돈다.
					<ul
						className={cn(
							"transition-opacity duration-150 ease-otb",
							isPlaceholderData && "opacity-50",
						)}
					>
						{posts.map((post) => (
							<PostCard key={post.id} post={post} serverNowMs={serverNowMs} />
						))}
					</ul>
				)}

				{/*
          잘림 안내 — 댓글 목록과 같은 규칙이다. 없으면 31번째 글부터는 화면에서 사라진 채
          사용자에게 아무 단서도 남지 않는다.
          ⚠ 판정은 **응답 길이만으로** 한다. 서버 카운트와 비교하면 리페치 시점이 달라
            잘못된 안내가 뜬다.
        */}
				{posts && posts.length >= POST_LIST_LIMIT && (
					<p className="px-5 pt-3 text-center text-[12px] text-ink-mute-2">
						{/* ⚠ "최근"은 최신순일 때만 참이다 — 인기·댓글순은 시간이 아니라 그 수치로 잘린다 */}
						{sort === "latest" ? "최근 " : ""}
						{formatCount(POST_LIST_LIMIT)}개만 표시하고 있어요.
					</p>
				)}
			</TabScrollArea>

			{/*
        플로팅 글쓰기 버튼 — **잉크 블랙**이다. 목록 화면의 "눌러야 할 곳"에는 에메랄드를
        쓰지 않는다(이 화면의 에메랄드는 워드마크의 볼과 카드의 좋아요 하트뿐이고, 어디에
        둘 수 있는지는 `styling.md`의 에메랄드 자리 표가 정한다).
        알약 형태는 "버튼 6px 라운드" 규칙의 명시적 예외 중 하나.
        Link 안에 Button을 넣지 않는다(<a> 안의 <button>) — 클래스만 재현한다.
      */}
			<Link
				href={ROUTES.postNew}
				// ⚠ 수식어 클릭은 가로채지 않는다 — Next의 Link는 사용자 onClick을 **먼저** 부르고
				//   `defaultPrevented`면 빠져나가므로, 무조건 막으면 ⌘/Ctrl+클릭의 "새 탭"까지 함께
				//   죽는다(가운데 클릭은 auxclick이라 원래 안 걸린다 — 좌클릭만 다르게 굴면 어긋난다).
				onClick={(e) => {
					if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
					if (sessionStatus !== "guest") return;
					e.preventDefault();
					setAskSignIn(true);
				}}
				// 이동하지 않고 안내가 뜬다는 것을 활성화 **전에** 알린다(role은 link 그대로다)
				aria-haspopup={sessionStatus === "guest" ? "dialog" : undefined}
				className="absolute bottom-[100px] right-4 z-[66] inline-flex h-11 items-center gap-1.5 rounded-full bg-ink pl-[13px] pr-4 text-sm font-medium text-white shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
			>
				<Icon as={PenLine} size={16} />
				글쓰기
			</Link>

			{/*
        ⚠ `TabScrollArea` **밖**이라야 한다 — `Dialog`의 `absolute`가 스크롤 영역을 기준으로
          잡으면 스크롤한 만큼 화면 밖에 뜬다(FAB이 같은 이유로 여기 있다).
        ⚠ 목적지를 `/posts/new`로 준다 — 지금 화면으로 되돌리면 로그인하고 와서 글쓰기를
          다시 눌러야 한다.
      */}
			<SignInDialog
				open={askSignIn}
				onClose={() => setAskSignIn(false)}
				action="글을 쓰려면"
				next={ROUTES.postNew}
			/>

			<BottomTabBar />
		</>
	);
}
