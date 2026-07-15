import { BottomNav } from "@/widgets/bottom-nav";
import { TabScrollArea } from "@/widgets/tab-scroll-area";

/** 탭 셸 — 스크롤 영역 + 하단 플로팅 탭바 */
export default function TabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TabScrollArea>{children}</TabScrollArea>
      <BottomNav />
    </>
  );
}
