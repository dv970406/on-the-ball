import { cache } from "react";
import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";
// ⚠ **새 파서를 만들지 않는다.** 하는 일이 "URL의 [id] → 엄격한 십진수 id"라 게시글 전용이
//   아니고, 이름은 첫 호출자를 기록할 뿐이다(`normalizeNickname`과 같은 사정).
//   전에 `\d+`와 `Number()`로 판정이 갈려 가드가 뚫린 적이 있어 규약이 "파서는 하나"다.
import { parsePostId } from "@/shared/lib/post-id";
import { NOT_FOUND_TITLE, OG_IMAGE, ROUTES } from "@/shared/config";
import { createSupabaseServerClient } from "@/shared/api/supabase-server";
// ⚠ 배럴(@/shared/lib)이 아니라 직접 경로 — 배럴은 "use client" 훅을 포함한다.
import { clamp } from "@/shared/lib/text";
// ⚠ 배럴이 아니라 직접 경로 — 매퍼는 "use client"가 없어 서버에서 쓸 수 있다.
//   select 문자열·빌더를 클라이언트 훅과 **공유해야** 프리페치가 같은 모양을 만든다.
import { SURVEY_SELECT, buildSurvey, buildSurveyResult } from "@/entities/survey/api/mappers";
import type { Survey, SurveyResult } from "@/entities/survey/model/types";
import { SurveyDetailView } from "@/views/survey-detail";

const FALLBACK_METADATA: Metadata = { title: "입축구" };
/** 없는 입축구 — `Page`가 `notFound()`를 부르므로 **404 화면과 같은 제목**이어야 한다. */
const NOT_FOUND_METADATA: Metadata = { title: NOT_FOUND_TITLE };
const META_TITLE_MAX = 60;

type SurveyHead =
  | {
      state: "found";
      survey: Survey;
      /** ⚠ 쿼리 키가 userId로 스코프된다 — 그 값도 함께 내려야 캐시에 닿는다 */
      userId: string | undefined;
      /**
       * 집계. **참여했을 때만 채운다** — `undefined`면 클라이언트가 쿼리를 켜지 않고
       * `SurveyBlock`이 "아직 볼 수 없다"로 읽는다. `[]`는 "열렸는데 0표"라는 다른 뜻이다.
       */
      results: SurveyResult[] | undefined;
      /**
       * 이 데이터를 읽은 시각.
       * ⚠ **없으면 마감된 입축구가 참여 가능한 상태로 SSR된다** — `SurveyVote`의
       *   `useNowMs()`가 서버에서 `null`이라 마감 분기를 타지 못한다(실측). 하이드레이션
       *   직후 읽기 전용 UI로 통째로 갈아치워지고 크롤러에게는 참여 가능한 문항으로 나간다.
       * ⚠ 렌더 본문이 아니라 여기서 찍는다(`react-hooks/purity`가 서버 컴포넌트도 막는다).
       */
      nowMs: number;
    }
  | { state: "missing" }
  /** 조회 자체가 실패 — 일시 장애로 멀쩡한 입축구를 없다고 단정하면 안 되므로 구분한다 */
  | { state: "unknown" };

/**
 * ⚠ `cache()`로 감싼다 — `generateMetadata`와 `Page`가 같은 데이터를 쓰므로
 *   감싸지 않으면 조회가 **요청당 2번** 나간다(`app/posts/[id]/page.tsx`와 같은 규약).
 *
 * ⚠ **선택지까지 여기서 조회한다.** SEO가 중요한 화면인데 클라이언트 쿼리만으로 그리면
 *   크롤러가 받는 HTML이 스켈레톤뿐이다 — 제목과 선택지 라벨이 초기 HTML에 담겨야 한다.
 *
 * ⚠ **`userId`를 함께 돌려준다.** `surveyKeys.detail`이 userId로 스코프돼 있어서,
 *   서버가 로그인 사용자 기준으로 채운 데이터를 클라이언트가 `undefined` 키로 찾으면
 *   **캐시에 닿지 못하고 다시 조회한다**(그 순간 화면이 스켈레톤으로 되돌아간다).
 *   세션 복원 전까지 이 값을 키로 쓰면 서버·클라이언트가 같은 키를 본다.
 */
const fetchSurveyHead = cache(async (surveyId: number): Promise<SurveyHead> => {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { state: "unknown" };

    // ⚠ 쿠키 기반 클라이언트라 `auth.uid()`가 잡힌다 → `survey_vote` 임베딩("내 행만")이
    //   그 사용자 기준으로 채워져 `myOptionId`가 서버·클라에서 갈리지 않는다.
    // ⚠ 셋은 서로의 결과를 쓰지 않는다(RLS가 쿠키 세션으로 걸린다) → **병렬로** 보낸다.
    //   직렬로 두면 왕복 세 번이 그대로 쌓여 TTFB에 더해진다.
    // ⚠ **집계(`survey_results`)도 여기서 함께 쏜다.** 전에는 입축구 응답을 받은 뒤
    //   `myOptionId`를 보고 직렬로 매달았는데, 게이팅이 UI가 아니라 definer 함수 안에 있어
    //   (미참여자는 0행) 무조건 쏴도 뜻이 달라지지 않는다. 목록에서 바로 투표하고 들어오는
    //   화면이라 **참여자 비율이 높아** 그 한 왕복이 그대로 체감되던 자리다.
    const [{ data: auth }, { data, error }, { data: resultRows }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("survey").select(SURVEY_SELECT).eq("id", surveyId).maybeSingle(),
      supabase.rpc("survey_results", { p_survey_id: surveyId }),
    ]);

    if (error) return { state: "unknown" };
    if (!data) return { state: "missing" };

    const survey = buildSurvey(data);

    // ⚠ **참여했을 때만 넘긴다.** `undefined`(조회 안 함)와 `[]`(열렸는데 0표)는 **다른 뜻**이라,
    //   미참여자에게 오는 0행을 `[]`로 접으면 결과 패널이 열려 버린다.
    //   ⚠ 이걸 서버가 그리지 않으면 참여자의 막대가 스켈레톤에서 늘어나며 시프트한다.
    const results =
      survey.myOptionId !== null ? (resultRows ?? []).map(buildSurveyResult) : undefined;

    return { state: "found", survey, userId: auth.user?.id, results, nowMs: Date.now() };
  } catch (e) {
    // createSupabaseServerClient의 cookies()는 "이 라우트를 동적 렌더로 전환하라"는
    // Next 내부 에러를 throw해서 동작한다. 삼키면 페이지가 스켈레톤 상태로 정적
    // 프리렌더되어 조용히 망가지므로 반드시 되던진다.
    unstable_rethrow(e);
    console.error("[surveys/[id]] 입축구 조회 실패:", e);
    return { state: "unknown" };
  }
});

export async function generateMetadata(props: PageProps<"/surveys/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const surveyId = parsePostId(id);
  if (surveyId === null) return FALLBACK_METADATA;

  const head = await fetchSurveyHead(surveyId);
  if (head.state === "missing") return NOT_FOUND_METADATA;
  if (head.state !== "found") return FALLBACK_METADATA;

  // DB 한도(1,000 코드포인트)가 <title>보다 훨씬 넓어 클램프가 필요하다
  const title = clamp(head.survey.title, META_TITLE_MAX);

  return {
    title,
    // ⚠ 자기 참조 canonical — 추적 파라미터(`?utm_…`)가 붙은 URL이 별개 페이지로
    //   색인되는 것을 막는다(목록·말머리와 같은 처리).
    alternates: { canonical: ROUTES.survey(surveyId) },
    openGraph: { type: "article", title, siteName: "온더볼", images: OG_IMAGE },
    twitter: { card: "summary_large_image", title, images: OG_IMAGE },
  };
}

export default async function Page(props: PageProps<"/surveys/[id]">) {
  const { id } = await props.params;
  const surveyId = parsePostId(id);
  if (surveyId === null) notFound();

  // ⚠ notFound()는 반드시 여기(세그먼트 렌더)에서 불러야 404가 나간다.
  //   generateMetadata에서 부르면 메타데이터 생성만 중단되고 응답은 200으로 나간다.
  const head = await fetchSurveyHead(surveyId);
  if (head.state === "missing") notFound();

  // state가 "unknown"이면 404로 단정하지 않고 화면을 띄운다
  return (
    <SurveyDetailView
      surveyId={surveyId}
      initialSurvey={head.state === "found" ? head.survey : undefined}
      initialUserId={head.state === "found" ? head.userId : undefined}
      initialResults={head.state === "found" ? head.results : undefined}
      serverNowMs={head.state === "found" ? head.nowMs : undefined}
    />
  );
}
