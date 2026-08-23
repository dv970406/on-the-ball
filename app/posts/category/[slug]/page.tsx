import type { Metadata } from "next";
import { notFound } from "next/navigation";
// ⚠ 배럴이 아니라 직접 경로 — model/types는 "use client"가 없어 서버에서 쓸 수 있다.
import { categoryFromSlug } from "@/entities/post/model/types";
import { listMetadata, renderPostList } from "../../list-page";

/** 없는 말머리 — `Page`가 `notFound()`를 부르므로 **404 화면과 같은 제목**이어야 한다 */
const NOT_FOUND_METADATA: Metadata = { title: "페이지를 찾을 수 없어요" };

/**
 * 말머리별 목록 — **독립적인 랜딩 페이지**다.
 *
 * ⚠ `/posts/[말머리]`로 둘 수 없다. 그 자리는 `/posts/[id]`(상세)가 이미 쓴다 —
 *   `category` 정적 세그먼트가 충돌을 없앤다(Next가 정적 세그먼트를 먼저 맞춘다).
 * ⚠ 슬러그 해석은 `categoryFromSlug`가 단독으로 소유한다 — 링크를 만드는 곳과 URL을
 *   해석하는 곳이 갈리면 멀쩡한 페이지가 조용히 404가 된다.
 */
export async function generateMetadata(
  props: PageProps<"/posts/category/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const category = categoryFromSlug(slug);
  return category === null ? NOT_FOUND_METADATA : listMetadata(category);
}

export default async function Page(props: PageProps<"/posts/category/[slug]">) {
  const { slug } = await props.params;
  const category = categoryFromSlug(slug);
  // ⚠ notFound()는 반드시 여기(세그먼트 렌더)에서 부른다 —
  //   generateMetadata에서 부르면 메타데이터 생성만 중단되고 응답은 200으로 나간다.
  if (category === null) notFound();

  const { sort } = await props.searchParams;
  return renderPostList(category, typeof sort === "string" ? sort : undefined);
}
