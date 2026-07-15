import { cn } from "@/shared/lib";

/** 지원 국기 코드 — 프로토타입 인라인 SVG 18개국 이식 */
export type FlagCode =
  | "KR"
  | "EN"
  | "GB"
  | "BR"
  | "AR"
  | "FR"
  | "ES"
  | "DE"
  | "NL"
  | "PT"
  | "BE"
  | "IT"
  | "HR"
  | "NO"
  | "UY"
  | "SN"
  | "EG"
  | "PL";

type FlagProps = {
  code: FlagCode | string;
  width?: number;
  height?: number;
  className?: string;
};

function flagShapes(code: string) {
  switch (code) {
    case "KR":
      return (
        <>
          <rect width="30" height="20" fill="#fff" />
          <circle cx="15" cy="10" r="4.5" fill="#cd2e3a" />
          <path
            d="M10.5 10 A 4.5 4.5 0 0 1 19.5 10 A 2.25 2.25 0 0 1 15 10 A 2.25 2.25 0 0 0 10.5 10 Z"
            fill="#0047a0"
          />
        </>
      );
    case "EN":
      return (
        <>
          <rect width="30" height="20" fill="#fff" />
          <rect x="13" width="4" height="20" fill="#ce1124" />
          <rect y="8" width="30" height="4" fill="#ce1124" />
        </>
      );
    case "GB":
      return (
        <>
          <rect width="30" height="20" fill="#012169" />
          <path d="M0 0 L30 20 M30 0 L0 20" stroke="#fff" strokeWidth="3" />
          <path d="M0 0 L30 20 M30 0 L0 20" stroke="#c8102e" strokeWidth="1.5" />
          <path d="M15 0 V20 M0 10 H30" stroke="#fff" strokeWidth="5" />
          <path d="M15 0 V20 M0 10 H30" stroke="#c8102e" strokeWidth="3" />
        </>
      );
    case "BR":
      return (
        <>
          <rect width="30" height="20" fill="#009b3a" />
          <path d="M15 2.5 L27 10 L15 17.5 L3 10 Z" fill="#fedf00" />
          <circle cx="15" cy="10" r="3.2" fill="#002776" />
        </>
      );
    case "AR":
      return (
        <>
          <rect width="30" height="20" fill="#74acdf" />
          <rect y="6.67" width="30" height="6.67" fill="#fff" />
          <circle cx="15" cy="10" r="1.6" fill="#fcbf49" />
        </>
      );
    case "FR":
      return (
        <>
          <rect width="10" height="20" fill="#0055a4" />
          <rect x="10" width="10" height="20" fill="#fff" />
          <rect x="20" width="10" height="20" fill="#ef4135" />
        </>
      );
    case "ES":
      return (
        <>
          <rect width="30" height="20" fill="#aa151b" />
          <rect y="5" width="30" height="10" fill="#f1bf00" />
        </>
      );
    case "DE":
      return (
        <>
          <rect width="30" height="6.67" fill="#000" />
          <rect y="6.67" width="30" height="6.67" fill="#dd0000" />
          <rect y="13.33" width="30" height="6.67" fill="#ffce00" />
        </>
      );
    case "NL":
      return (
        <>
          <rect width="30" height="6.67" fill="#ae1c28" />
          <rect y="6.67" width="30" height="6.67" fill="#fff" />
          <rect y="13.33" width="30" height="6.67" fill="#21468b" />
        </>
      );
    case "PT":
      return (
        <>
          <rect width="12" height="20" fill="#006600" />
          <rect x="12" width="18" height="20" fill="#ff0000" />
          <circle cx="12" cy="10" r="2.8" fill="#fcd116" stroke="#fff" strokeWidth="0.4" />
        </>
      );
    case "BE":
      return (
        <>
          <rect width="10" height="20" fill="#000" />
          <rect x="10" width="10" height="20" fill="#fdda24" />
          <rect x="20" width="10" height="20" fill="#ef3340" />
        </>
      );
    case "IT":
      return (
        <>
          <rect width="10" height="20" fill="#009246" />
          <rect x="10" width="10" height="20" fill="#fff" />
          <rect x="20" width="10" height="20" fill="#ce2b37" />
        </>
      );
    case "HR":
      return (
        <>
          <rect width="30" height="6.67" fill="#ff0000" />
          <rect y="6.67" width="30" height="6.67" fill="#fff" />
          <rect y="13.33" width="30" height="6.67" fill="#171796" />
          <rect x="12" y="4" width="6" height="8" fill="#fff" stroke="#171796" strokeWidth="0.4" />
        </>
      );
    case "NO":
      return (
        <>
          <rect width="30" height="20" fill="#ef2b2d" />
          <rect x="10" width="4" height="20" fill="#fff" />
          <rect y="8" width="30" height="4" fill="#fff" />
          <rect x="11" width="2" height="20" fill="#002868" />
          <rect y="9" width="30" height="2" fill="#002868" />
        </>
      );
    case "UY":
      return (
        <>
          <rect width="30" height="20" fill="#fff" />
          <rect y="2.22" width="30" height="2.22" fill="#0038a8" />
          <rect y="6.66" width="30" height="2.22" fill="#0038a8" />
          <rect y="11.11" width="30" height="2.22" fill="#0038a8" />
          <rect y="15.55" width="30" height="2.22" fill="#0038a8" />
          <rect width="12" height="11" fill="#fff" />
          <circle cx="6" cy="5.5" r="1.8" fill="#fcd116" />
        </>
      );
    case "SN":
      return (
        <>
          <rect width="10" height="20" fill="#00853f" />
          <rect x="10" width="10" height="20" fill="#fdef42" />
          <rect x="20" width="10" height="20" fill="#e31b23" />
          <polygon
            points="15,8 15.8,10.5 18.5,10.5 16.4,12 17.2,14.5 15,13 12.8,14.5 13.6,12 11.5,10.5 14.2,10.5"
            fill="#00853f"
          />
        </>
      );
    case "EG":
      return (
        <>
          <rect width="30" height="6.67" fill="#ce1126" />
          <rect y="6.67" width="30" height="6.67" fill="#fff" />
          <rect y="13.33" width="30" height="6.67" fill="#000" />
        </>
      );
    case "PL":
      return (
        <>
          <rect width="30" height="10" fill="#fff" />
          <rect y="10" width="30" height="10" fill="#dc143c" />
        </>
      );
    default:
      // 미지원 코드는 회색 placeholder
      return <rect width="30" height="20" fill="#dfdfdf" />;
  }
}

/** 인라인 SVG 국기 — 실서비스에서는 flag 라이브러리/스프라이트 교체 예정 */
export function Flag({ code, width = 20, height = 14, className }: FlagProps) {
  return (
    <span
      className={cn(
        "inline-block overflow-hidden rounded-[2px] border border-black/[0.18] leading-none",
        className,
      )}
      style={{ width, height }}
    >
      <svg viewBox="0 0 30 20" width={width} height={height} aria-hidden>
        {flagShapes(code)}
      </svg>
    </span>
  );
}
