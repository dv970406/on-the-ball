import { cn } from "@/shared/lib";
import { COLOR } from "@/shared/config";
import type { ActivityBadge } from "../model/use-my-activity";

/** 뱃지 3열 그리드 — 미획득은 opacity 0.55 + '?' */
export function BadgeGrid({ badges }: { badges: ActivityBadge[] }) {
  return (
    <ul className="grid grid-cols-3 gap-2.5 px-5">
      {badges.map((badge) => (
        <li
          key={badge.id}
          className={cn(
            "rounded-lg border border-hairline p-3 text-center",
            badge.earned ? "bg-canvas" : "bg-canvas-soft opacity-55",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "mx-auto mb-2 flex size-9 items-center justify-center rounded-[9px] text-sm font-bold",
              badge.earned ? "text-white" : "text-ink-mute",
            )}
            style={{ background: badge.earned ? badge.color : COLOR.hairlineStrong }}
          >
            {badge.earned ? "✓" : "?"}
          </span>
          <p className="text-[11px] font-medium leading-tight text-ink">{badge.label}</p>
          {badge.description ? (
            <p className="mt-0.5 text-[10px] text-ink-mute">{badge.description}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
