/** 디테일 셸 — 탭바 없이 풀스크린으로 덮는 화면들의 공용 스크롤 컨테이너 */
export default function DetailLayout({ children }: { children: React.ReactNode }) {
  return <main className="no-scrollbar h-full overflow-y-auto overflow-x-hidden">{children}</main>;
}
