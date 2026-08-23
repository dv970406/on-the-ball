import { cache } from "react";
import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";
// proxy(서버 가드)·수정 페이지와 같은 파서를 공유한다 — post-id 주석 참고
import { parsePostId } from "@/shared/lib/post-id";
// ⚠ 배럴(@/shared/lib)이 아니라 직접 경로 — 배럴은 "use client" 훅을 포함한다.
import { clamp } from "@/shared/lib/text";
import { NOT_FOUND_TITLE, OG_IMAGE, ROUTES } from "@/shared/config";
import { createSupabaseServerClient } from "@/shared/api/supabase-server";
// ⚠ 배럴(@/entities/post)이 아니라 직접 경로 — 배럴은 "use client" 모듈을 포함한다.
//   목록 카드의 발췌와 **같은 변환기**를 쓴다(둘이 갈리면 화면과 공유 프리뷰의 요약이 달라진다).
import { toPlainSummary } from "@/entities/post/lib/plain-summary";
// ⚠ 배럴이 아니라 직접 경로 — 매퍼는 "use client"가 없어 서버에서 쓸 수 있다.
//   select 문자열·빌더를 클라이언트 훅과 **공유해야** 프리페치가 같은 모양을 만든다.
import { POST_DETAIL_SELECT, buildPostDetail } from "@/entities/post/api/mappers";
import { buildComment } from "@/entities/comment/api/mappers";
import { buildCommentListQuery } from "@/entities/comment/api/list-query";
import { POLL_SELECT, buildPoll, buildPollResult } from "@/entities/poll/api/mappers";
import type { PostDetail } from "@/entities/post/model/types";
import type { Comment } from "@/entities/comment/model/types";
import type { Poll, PollResult } from "@/entities/poll/model/types";
import { PostDetailView } from "@/views/post-detail";

/** 조회 실패("unknown")로 화면은 띄우되 제목을 알 수 없을 때 */
const FALLBACK_METADATA: Metadata = { title: "게시글" };
/**
 * 없는 글 — `Page`가 `notFound()`를 부르므로 **404 화면과 같은 제목**이어야 한다.
 * ⚠ 이걸 `FALLBACK_METADATA`로 뭉뚱그리면 서버 HTML은 "페이지를 찾을 수 없어요"인데
 *   하이드레이션 후 탭 제목만 "게시글"로 바뀐다(실측). 문구의 단일 소스는 `NOT_FOUND_TITLE`이다.
 */
const NOT_FOUND_METADATA: Metadata = { title: NOT_FOUND_TITLE };

/** <title>·og:title에 실을 최대 길이 — 원문을 그대로 넣으면 120자 제목이 통째로 들어간다 */
const META_TITLE_MAX = 60;
/** 공유 프리뷰 설명 길이 — 대부분의 플랫폼이 이 언저리에서 자른다 */
const META_DESCRIPTION_MAX = 120;

/** 글이 존재하는지 + 화면을 그릴 데이터까지 확인한 결과 */
type PostHead =
  | {
      state: "found";
      post: PostDetail;
      comments: Comment[];
      /** ⚠ `null`은 "투표가 없는 글"이다 — "조회하지 않음"(undefined)과 뜻이 다르다 */
      poll: Poll | null;
      /**
       * 투표 집계. **참여했을 때만 채운다** — `undefined`면 클라이언트가 쿼리를 켜지 않고,
       * `PollBlock`은 그걸 "아직 볼 수 없다"로 읽는다.
       * ⚠ `[]`로 넘기면 "열렸는데 0표"라는 **다른 뜻**이 되어 미참여자에게 결과 패널이 열린다.
       */
      pollResults: PollResult[] | undefined;
      /** ⚠ 투표 쿼리 키가 userId로 스코프된다 — 그 값도 함께 내려야 캐시에 닿는다 */
      userId: string | undefined;
      /**
       * 이 데이터를 읽은 시각.
       *
       * ⚠ **상대시각("2시간 전")을 첫 렌더부터 그리기 위한 기준이다.** 없으면 절대시각으로
       *   나왔다가 마운트 직후 바뀌어 눈에 띄는 시프트가 된다.
       * ⚠ 렌더 본문이 아니라 **여기서** 찍는다 — `react-hooks/purity`가 렌더 중 `Date.now()`를
       *   막고(서버 컴포넌트도 예외가 아니다), 데이터를 읽은 순간과 같은 시각이라 뜻도 맞다.
       */
      nowMs: number;
    }
  | { state: "missing" }
  /** 조회 자체가 실패 — 일시 장애로 멀쩡한 글을 없다고 단정하면 안 되므로 구분한다 */
  | { state: "unknown" };

/**
 * generateMetadata와 Page가 같은 요청에서 함께 쓴다.
 * React cache로 감싸 요청당 1회만 실제 조회하게 한다(안 감싸면 매 요청 쿼리가 2번 나간다).
 *
 * ⚠ **본문·댓글까지 여기서 조회한다.** 이 화면은 SEO가 중요한데 클라이언트 쿼리만으로
 *   그리면 크롤러가 받는 HTML이 스켈레톤뿐이다 — 조회 결과를 view에 `initialData`로 내려
 *   서버가 이미 완성된 본문을 렌더하게 한다.
 * ⚠ **프리페치는 최적화일 뿐이다.** 실패하면 `undefined`를 넘겨 클라이언트 조회 경로로
 *   폴백해야 한다(nextjs.md) — 그래서 "unknown"과 "missing"을 구분한다.
 *
 * ⚠ 서버 실행이라 "use client"를 포함한 배럴(@/entities/post)을 import하면 안 된다 →
 *   supabase-server와 매퍼를 직접 경로로 쓴다.
 * ⚠ **쿠키 기반 클라이언트라 `auth.uid()`가 잡힌다** — `isLiked`·차단 숨김이 그 사용자
 *   기준으로 계산되어 서버·클라 판정이 갈리지 않는다. 대가로 응답이 사용자별이 되지만
 *   이 라우트는 이미 동적(`ƒ`)이다.
 */
const fetchPostHead = cache(async (postId: number): Promise<PostHead> => {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { state: "unknown" };

    // 삭제된 글은 RLS(post_select_visible)가 걸러내므로 여기서도 자동으로 "없음"이 된다.
    // ⚠ **차단한 작성자의 글도 같은 정책이 감춘다** — 쿠키 기반 서버 클라이언트라
    //   auth.uid()가 잡혀 서버·클라 판정이 갈리지 않는다(차단한 글은 그 사용자에게 404다).
    // ⚠ 쿠키 기반 클라이언트라 `auth.uid()`가 잡힌다 → `post_like`·`poll_vote` 임베딩
    //   ("내 행만")이 그 사용자 기준으로 채워져 `isLiked`·`myOptionId`가 갈리지 않는다.
    // ⚠ **넷은 서로의 결과를 쓰지 않는다** → 병렬로 보낸다. 직렬로 두면 왕복 네 번이
    //   그대로 쌓여 TTFB가 된다(색인 대상 화면이라 특히 비싸다).
    // ⚠ 댓글 조회가 실패해도 **글은 그대로 내보낸다.** 프리페치는 최적화라, 여기서
    //   "unknown"으로 떨어뜨리면 멀쩡한 본문까지 클라이언트 조회로 미루게 된다.
    // ⚠ 정렬·상한은 `useCommentListQuery`와 **같아야 한다** — 조립을
    //   `buildCommentListQuery`가 단독으로 소유해 어긋날 자리를 없앤다.
    // ⚠ 투표 질문·선택지도 **그 글의 콘텐츠**라 초기 HTML에 담긴다. 투표가 없는 글이
    //   대부분이라 0행으로 끝나는 경우가 많은데, 그건 정상값(`null`)이다.
    const [{ data: auth }, { data, error }, { data: rows }, { data: pollRow }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("post").select(POST_DETAIL_SELECT).eq("id", postId).maybeSingle(),
      buildCommentListQuery(supabase, postId),
      supabase.from("poll").select(POLL_SELECT).eq("post_id", postId).maybeSingle(),
    ]);

    if (error) return { state: "unknown" };
    if (!data) return { state: "missing" };

    const poll = pollRow ? buildPoll(pollRow) : null;

    // ⚠ **참여했을 때만 부른다.** definer 함수라 서버도 게이팅을 그대로 받지만(쿠키 세션),
    //   미참여자에게 오는 0행을 `[]`로 넘기면 "열렸는데 0표"가 되어 결과 패널이 열린다.
    //   ⚠ 이걸 서버가 그리지 않으면 참여한 사용자의 막대가 스켈레톤에서 늘어나며 시프트한다.
    const pollResults =
      poll && poll.myOptionId !== null
        ? ((await supabase.rpc("poll_results", { p_post_id: postId })).data ?? []).map(
            buildPollResult,
          )
        : undefined;

    return {
      state: "found",
      post: buildPostDetail(data),
      poll,
      pollResults,
      userId: auth.user?.id,
      nowMs: Date.now(),
      // 화면에는 오래된 순으로 보이지만 최신 것부터 잘라 온다(훅과 같은 이유·같은 순서)
      comments: (rows ?? []).map(buildComment).reverse(),
    };
  } catch (e) {
    // createSupabaseServerClient의 cookies()는 "이 라우트를 동적 렌더로 전환하라"는
    // Next 내부 에러를 throw해서 동작한다. 삼키면 페이지가 스켈레톤 상태로 정적
    // 프리렌더되어 조용히 망가지므로 반드시 되던진다.
    unstable_rethrow(e);
    console.error("[posts/[id]] 글 조회 실패:", e);
    return { state: "unknown" };
  }
});

/**
 * 공유 링크에 글 제목·요약이 보이도록 메타데이터를 서버에서 채운다 (실패해도 화면은 그대로 뜬다).
 *
 * ⚠ title만 채우면 **카카오톡·슬랙 등 링크 프리뷰는 달라지지 않는다** — 그쪽은
 *   og:title/og:description을 먼저 읽으므로, 모든 글이 루트 layout의 사이트 설명 하나로
 *   똑같이 미리보기됐다. 공유 버튼(SubHeader)이 있는 화면이라 실사용 경로다.
 */
export async function generateMetadata(props: PageProps<"/posts/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const postId = parsePostId(id);
  if (postId === null) return FALLBACK_METADATA;

  const head = await fetchPostHead(postId);
  if (head.state === "missing") return NOT_FOUND_METADATA;
  if (head.state !== "found") return FALLBACK_METADATA;

  const title = clamp(head.post.title, META_TITLE_MAX);
  const description = toPlainSummary(head.post.content, META_DESCRIPTION_MAX);

  return {
    title,
    // ⚠ 자기 참조 canonical — 추적 파라미터(`?utm_…`)가 붙은 URL이 별개 페이지로
    //   색인되는 것을 막는다(목록·말머리와 같은 처리).
    alternates: { canonical: ROUTES.post(postId) },
    description,
    openGraph: {
      type: "article",
      title,
      description,
      siteName: "온더볼",
      // ⚠ images를 여기서 **명시해야 한다.** 세그먼트가 openGraph를 직접 채우면
      //   루트 opengraph-image.png의 자동 주입이 통째로 대체되어 사라진다(실측 확인) —
      //   생략했더니 글 상세만 이미지 없는 카드로 나갔다.
      //   metadataBase가 절대 URL로 만들어 준다.
      images: OG_IMAGE,
    },
    twitter: { card: "summary_large_image", title, description, images: OG_IMAGE },
  };
}

export default async function Page(props: PageProps<"/posts/[id]">) {
  const { id } = await props.params;
  const postId = parsePostId(id);
  if (postId === null) notFound();

  // ⚠ notFound()는 반드시 여기(세그먼트 렌더)에서 불러야 404가 나간다.
  //   generateMetadata에서 부르면 메타데이터 생성만 중단되고 응답은 200으로 나간다.
  const head = await fetchPostHead(postId);
  if (head.state === "missing") notFound();

  // state가 "unknown"이면 404로 단정하지 않고 화면을 띄운다 —
  // 클라이언트 쿼리가 다시 시도해 성공하거나 에러 상태를 보여준다.
  return (
    <PostDetailView
      postId={postId}
      initialPost={head.state === "found" ? head.post : undefined}
      initialComments={head.state === "found" ? head.comments : undefined}
      initialPoll={head.state === "found" ? head.poll : undefined}
      initialPollResults={head.state === "found" ? head.pollResults : undefined}
      initialUserId={head.state === "found" ? head.userId : undefined}
      serverNowMs={head.state === "found" ? head.nowMs : undefined}
    />
  );
}
