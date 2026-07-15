import type { LucideIcon, LucideProps } from "lucide-react";

type IconProps = Omit<LucideProps, "size"> & {
  /** lucide-react 아이콘 컴포넌트 */
  as: LucideIcon;
  size?: number;
};

/** Lucide 아이콘 래퍼 — 디자인 규칙(1.5px 스트로크)을 기본값으로 고정 */
export function Icon({ as: LucideComponent, size = 16, ...props }: IconProps) {
  return <LucideComponent size={size} strokeWidth={1.5} {...props} />;
}
