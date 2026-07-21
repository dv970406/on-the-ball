interface TabHeaderProps {
  title: string;
  /** 타이틀 아래 서브카피 (없으면 생략) */
  subtitle?: string;
}

/** 탭 화면 상단 타이틀/서브카피 헤더 (밸런스·퀴즈·TMI 리스트 공용) */
export function TabHeader({ title, subtitle }: TabHeaderProps) {
  return (
    <header className="px-5 pb-3 pt-14">
      <h1 className="text-[28px] font-bold tracking-[-0.6px] text-ink">{title}</h1>
      {subtitle && <p className="mt-1.5 text-[13px] text-ink-mute">{subtitle}</p>}
    </header>
  );
}
