"use client";

type SectionHeadProps = {
  title: string;
  /** 우측 보조 액션 라벨 (예: "전체 보기") */
  more?: string;
  onMore?: () => void;
};

/** 홈/리스트 섹션 헤더 */
export function SectionHead({ title, more, onMore }: SectionHeadProps) {
  return (
    <div className="mb-3 flex items-baseline gap-2 px-5">
      <h2 className="text-[19px] font-semibold tracking-[-0.4px] text-ink">{title}</h2>
      {more ? (
        <button type="button" className="ml-auto text-xs text-ink-mute" onClick={onMore}>
          {more}
        </button>
      ) : null}
    </div>
  );
}
