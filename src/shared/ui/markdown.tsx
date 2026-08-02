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
 * XSS: react-markdown은 기본적으로 raw HTML을 렌더하지 않는다(rehype-raw 미사용).
 *      본문이 사용자 입력이므로 이 기본값을 절대 풀지 않는다.
 */
const MARKDOWN_COMPONENTS: Components = {
  h1: (props) => (
    <h2
      className="mb-2 mt-7 text-[20px] font-bold leading-[1.4] tracking-[-0.4px] text-ink first:mt-0"
      {...props}
    />
  ),
  h2: (props) => (
    <h3
      className="mb-2 mt-6 text-[17px] font-bold leading-[1.4] tracking-[-0.3px] text-ink first:mt-0"
      {...props}
    />
  ),
  h3: (props) => (
    <h4 className="mb-1.5 mt-5 text-[15px] font-semibold text-ink first:mt-0" {...props} />
  ),
  p: (props) => <p className="my-3 text-[15px] leading-[1.75] text-ink-secondary" {...props} />,
  a: (props) => (
    // 링크를 에메랄드로 칠하지 않는다 — 본문에 링크가 많으면 "뷰포트당 컬러 이벤트 1개"가 깨진다.
    // 밑줄만으로 충분히 구분되고, 인증 화면의 링크 스타일과도 같아진다.
    <a
      className="font-medium text-ink underline underline-offset-2"
      target="_blank"
      rel="noreferrer noopener"
      {...props}
    />
  ),
  ul: (props) => (
    <ul className="my-3 list-disc pl-5 text-[15px] leading-[1.75] text-ink-secondary" {...props} />
  ),
  ol: (props) => (
    <ol
      className="my-3 list-decimal pl-5 text-[15px] leading-[1.75] text-ink-secondary"
      {...props}
    />
  ),
  li: (props) => <li className="my-1" {...props} />,
  blockquote: (props) => (
    <blockquote
      className="my-3 border-l-2 border-hairline-strong pl-3 text-[15px] leading-[1.7] text-ink-mute"
      {...props}
    />
  ),
  code: (props) => (
    <code
      className="rounded-xs bg-canvas-soft px-1 py-0.5 font-mono text-[13px] text-ink"
      {...props}
    />
  ),
  pre: (props) => (
    // 긴 코드가 화면 밖으로 넘치지 않도록 이 블록 안에서만 가로 스크롤
    <pre
      className="no-scrollbar my-3 overflow-x-auto rounded-sm border border-hairline bg-canvas-soft p-3 text-[13px] leading-[1.6] [&_code]:bg-transparent [&_code]:p-0"
      {...props}
    />
  ),
  hr: (props) => <hr className="my-6 border-hairline" {...props} />,
  // remark-gfm
  table: (props) => (
    <div className="no-scrollbar my-3 overflow-x-auto">
      <table className="w-full border-collapse text-[14px]" {...props} />
    </div>
  ),
  th: (props) => (
    <th
      className="border border-hairline bg-canvas-soft px-2.5 py-1.5 text-left font-semibold text-ink"
      {...props}
    />
  ),
  td: (props) => (
    <td className="border border-hairline px-2.5 py-1.5 text-ink-secondary" {...props} />
  ),
  del: (props) => <del className="text-ink-mute-2" {...props} />,
  input: (props) => (
    // GFM 체크박스 — 읽기 전용으로만 노출 (에메랄드 대신 잉크)
    <input className="mr-1.5 align-middle accent-ink" disabled {...props} />
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
