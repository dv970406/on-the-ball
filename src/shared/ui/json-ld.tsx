/**
 * 구조화 데이터(schema.org JSON-LD) 한 덩어리.
 *
 * `"use client"`를 붙이지 않는다 — 데이터를 조립하는 곳이 서버 page(`generateMetadata`와 같은
 * 조회를 공유한다)라 서버에서 그대로 렌더한다. 클라이언트 번들에 실릴 이유가 없다.
 *
 * ⚠ **`next/script`가 아니라 생 `<script>`다.** 실행할 코드가 아니라 데이터라 Next 문서가
 *   그렇게 권한다(`docs/01-app/02-guides/json-ld.md`).
 * ⚠ **`<`를 이스케이프한다.** `JSON.stringify`는 HTML을 모른다 — 본문에 `</script>`가 들어
 *   있으면(사용자 입력이다) 그 자리에서 스크립트 블록이 닫혀 뒤가 마크업으로 풀린다.
 *   `<`는 JSON 안에서는 그대로 `<`라 파서에는 같은 값이다.
 */

/** 속성 값의 형태는 schema.org 타입마다 다르다 — 조립하는 쪽이 모양을 갖고 여기서는 직렬화만 한다 */
export type JsonLdObject = Record<string, unknown>;

interface JsonLdProps {
  data: JsonLdObject;
}

export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
