/** 디테일 진입 시마다 리마운트되어 fade-up 등장 애니메이션을 재생하는 템플릿 */
export default function DetailTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-fade-up min-h-full">{children}</div>;
}
