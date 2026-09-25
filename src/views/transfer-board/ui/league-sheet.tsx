"use client";

import { Check } from "lucide-react";
import type { TransferLeague } from "@/entities/transfer";
import { Icon, Sheet, SheetItem } from "@/shared/ui";
import { LEAGUE_OPTIONS } from "../lib/league-options";

interface LeagueSheetProps {
  open: boolean;
  league: TransferLeague | null;
  onSelect: (league: TransferLeague | null) => void;
  onClose: () => void;
}

/**
 * 리그 선택 시트(handoff §6) — 프로젝트 `Sheet`/`SheetItem`(edge-to-edge, 그래버)이다.
 *
 * ⚠ 우측 `지출 €NM`은 생략했다(계획서 §0). 리그명 + 체크만.
 * ⚠ 선택 표시는 16px 체크 + `bg-canvas-soft`이고, 비선택은 같은 폭의 빈칸이라 라벨이 한 줄에
 *   선다. `SheetItem`의 `icon`은 20px 고정이라 쓰지 않고 children 앞에 직접 둔다.
 *   배경은 `SheetItem`이 투명이라 감싼 요소에 준다(컴포넌트에 prop을 새로 열지 않는다).
 * ⚠ 체크 아이콘은 `aria-hidden`이라 선택 항목에 sr-only "(선택됨)"을 함께 둔다.
 */
export function LeagueSheet({ open, league, onSelect, onClose }: LeagueSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} label="리그 선택">
      {LEAGUE_OPTIONS.map(({ value, label }) => {
        const selected = value === league;
        return (
          <div key={label} className={selected ? "bg-canvas-soft" : undefined}>
            <SheetItem onClick={() => onSelect(value)}>
              <span aria-hidden className="inline-flex w-4 shrink-0 justify-center">
                {selected && <Icon as={Check} size={16} />}
              </span>
              {label}
              {selected && <span className="sr-only">(선택됨)</span>}
            </SheetItem>
          </div>
        );
      })}
    </Sheet>
  );
}
