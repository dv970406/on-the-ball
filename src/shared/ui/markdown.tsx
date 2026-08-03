import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/shared/lib";

/**
 * 마크다운 렌더러.
 *
 * ⚠ "use client"를 붙이지 않는다 — button-class ↔ button 분리와 같은 사고로,
 *   서버 컴포넌트에서도 쓸 여지를 남긴다. 부모가 클라이언트면 자동으로 클라 번들에 들어간다.
 *
 * ⚠ Tailwind Typography(prose)를 도입하지 않는다. 새 의존성인 데다 자체 색·간격 스케일이
 *   Tifo 토큰과 충돌한다. 대신 태그별 클래스를 아래 맵에 명시한다.
 *
 * ⚠ **모든 오버라이드는 `node`를 구조분해로 걷어낸다.** react-markdown v9+는 커스텀
 *   컴포넌트에 hast 노드를 항상 넘기는데, 그대로 스프레드하면 React 19가 알 수 없는 속성을
 *   경고 없이 렌더해 **모든 요소에 `node="[object Object]"` 가 붙는다**(실측). 무효 HTML인 데다
 *   요소 개수만큼 HTML·하이드레이션 페이로드가 불어난다.
 *
 * ⚠ **클래스는 `{...props}` 뒤에 둔다.** 앞에 두면 react-markdown이 넘기는 className
 *   (펜스 코드블록의 `language-js` 등)이 커스텀 클래스를 통째로 덮어썼다(실측).
 *
 * XSS: react-markdown은 기본적으로 raw HTML을 렌더하지 않는다(rehype-raw 미사용).
 *      본문이 사용자 입력이므로 이 기본값을 절대 풀지 않는다.
 *      차단된 프로토콜(javascript: 등)은 빈 문자열로 들어오므로 링크·이미지에서 별도 처리한다.
 */

/**
 * 렌더 가능한 URL만 통과시킨다.
 * 스킴이 차단된 링크·이미지는 빈 문자열로 들어오는데, 그대로 렌더하면
 * "현재 페이지를 다시 받는" 요청이 된다(React가 빈 src에 대해 경고하는 그 형태다).
 * ⚠ img의 src 타입은 `string | Blob`이라 문자열임을 함께 좁힌다.
 */
function usableUrl(url: string | Blob | undefined): string | null {
  return typeof url === "string" && url.trim() !== "" ? url : null;
}

const MARKDOWN_COMPONENTS: Components = {
  h1: ({ node, ...props }) => (
    <h2
      {...props}
      className="mb-2 mt-7 text-[20px] font-bold leading-[1.4] tracking-[-0.4px] text-ink first:mt-0"
    />
  ),
  h2: ({ node, ...props }) => (
    <h3
      {...props}
      className="mb-2 mt-6 text-[17px] font-bold leading-[1.4] tracking-[-0.3px] text-ink first:mt-0"
    />
  ),
  h3: ({ node, ...props }) => (
    <h4 {...props} className="mb-1.5 mt-5 text-[15px] font-semibold text-ink first:mt-0" />
  ),
  p: ({ node, ...props }) => (
    <p {...props} className="my-3 text-[15px] leading-[1.75] text-ink-secondary" />
  ),
  a: ({ node, href, ...props }) => {
    // 스킴이 차단된 링크(`javascript:` 등)는 href=""로 들어온다 —
    // 그대로 두면 클릭 시 현재 페이지가 리로드되어 스크롤·입력 상태가 날아간다.
    const safeHref = usableUrl(href);
    if (!safeHref) return <span {...props} />;

    // 앱 내부 경로까지 새 탭으로 열지 않는다(그것도 SPA 전이가 아닌 풀 로드였다).
    const isInternal = safeHref.startsWith("/") || safeHref.startsWith("#");
    return (
      // 링크를 에메랄드로 칠하지 않는다 — 본문에 링크가 많으면 "뷰포트당 컬러 이벤트 1개"가 깨진다.
      // 밑줄만으로 충분히 구분되고, 인증 화면의 링크 스타일과도 같아진다.
      <a
        {...props}
        href={safeHref}
        target={isInternal ? undefined : "_blank"}
        rel={isInternal ? undefined : "noreferrer noopener"}
        className="font-medium text-ink underline underline-offset-2"
      />
    );
  },
  ul: ({ node, className, ...props }) => (
    // GFM 체크리스트는 className="contains-task-list"로 온다 — 덮으면 불릿 제거 훅이 사라진다
    <ul
      {...props}
      className={cn(
        "my-3 pl-5 text-[15px] leading-[1.75] text-ink-secondary",
        // 체크박스 목록은 마커를 없애고 들여쓰기도 줄인다(체크박스가 마커 역할을 한다)
        className?.includes("contains-task-list") ? "list-none pl-0" : "list-disc",
        className,
      )}
    />
  ),
  ol: ({ node, ...props }) => (
    <ol
      {...props}
      className="my-3 list-decimal pl-5 text-[15px] leading-[1.75] text-ink-secondary"
    />
  ),
  li: ({ node, className, ...props }) => (
    <li {...props} className={cn("my-1", className)} />
  ),
  blockquote: ({ node, ...props }) => (
    <blockquote
      {...props}
      className="my-3 border-l-2 border-hairline-strong pl-3 text-[15px] leading-[1.7] text-ink-mute"
    />
  ),
  code: ({ node, className, ...props }) => (
    // 펜스 코드블록은 className("language-js")이 함께 오므로 덮지 않고 합친다
    <code
      {...props}
      className={cn("rounded-xs bg-canvas-soft px-1 py-0.5 font-mono text-[13px] text-ink", className)}
    />
  ),
  pre: ({ node, ...props }) => (
    // 긴 코드가 화면 밖으로 넘치지 않도록 이 블록 안에서만 가로 스크롤
    <pre
      {...props}
      className="no-scrollbar my-3 overflow-x-auto rounded-sm border border-hairline bg-canvas-soft p-3 text-[13px] leading-[1.6] [&_code]:bg-transparent [&_code]:p-0"
    />
  ),
  hr: ({ node, ...props }) => <hr {...props} className="my-6 border-hairline" />,
  img: ({ node, src, alt, ...props }) => {
    // 차단된 스킴은 src=""로 들어온다 — 글 하나로 모든 독자에게 페이지 재요청을 유발할 수 있어
    // 렌더하지 않고 대체 텍스트만 남긴다.
    const safeSrc = usableUrl(src);
    if (!safeSrc) return alt ? <span className="text-ink-mute-2">{alt}</span> : null;

    return (
      // loading="lazy"는 **뷰포트 밖 이미지를 미리 받지 않게** 한다.
      //   서버 렌더에서는 이게 없으면 React 19가 <link rel="preload" as="image">를 head로
      //   끌어올려, 글쓴이가 지정한 임의의 서드파티 호스트로 독자의 브라우저가 즉시 요청을
      //   보낸다(react-dom-server의 lazy 분기로 확인). 지금은 본문이 전부 클라이언트 렌더라
      //   그 호이스팅 경로 자체가 없지만, 서버 프리페치를 붙이면 바로 되살아난다.
      //   decoding="async"와 함께 두면 렌더 블로킹도 피한다.
      // eslint-disable-next-line @next/next/no-img-element -- 외부 임의 호스트라 next/image 최적화 대상이 아니다
      <img
        {...props}
        src={safeSrc}
        alt={alt ?? ""}
        loading="lazy"
        decoding="async"
        className="my-3 h-auto max-w-full rounded-sm"
      />
    );
  },
  // remark-gfm
  table: ({ node, ...props }) => (
    <div className="no-scrollbar my-3 overflow-x-auto">
      <table {...props} className="w-full border-collapse text-[14px]" />
    </div>
  ),
  th: ({ node, ...props }) => (
    <th
      {...props}
      className="border border-hairline bg-canvas-soft px-2.5 py-1.5 text-left font-semibold text-ink"
    />
  ),
  td: ({ node, ...props }) => (
    <td {...props} className="border border-hairline px-2.5 py-1.5 text-ink-secondary" />
  ),
  del: ({ node, ...props }) => <del {...props} className="text-ink-mute-2" />,
  input: ({ node, ...props }) => (
    // GFM 체크박스 — 읽기 전용으로만 노출 (에메랄드 대신 잉크)
    <input {...props} disabled className="mr-1.5 align-middle accent-ink" />
  ),
};

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("break-words", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
