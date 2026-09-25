import { Crest } from "@/shared/ui";
import type { TransferClub } from "../model/types";

/**
 * 엠블럼 자산의 위치 — **파일명이 곧 구단 코드다**(`/crests/{code}.png`).
 * ⚠ 자산은 `scripts/fetch-team-crests.mjs`가 만든다 — 프리미어리그는 `--team <id> --code <code>`,
 *   해외 리그는 `--league <id>`(`api-and-db.md`).
 *   프리셋 밖 구단은 `slugify(정규 영문명)`이라 파일이 없다 → `Crest`의 404 폴백(모노그램).
 * ⚠ `code`는 DB CHECK(`^[a-z0-9-]{1,60}$`)가 슬러그로 강제해 인코딩이 필요 없다.
 */
const CREST_DIR = "/crests";

interface TransferCrestProps {
  /** `null`이면 방향을 못 읽은 자리다 — 라벨 `—`인 모노그램을 그린다 */
  club: TransferClub | null;
  /** px. 목록 행 16 · 미니 카드 28 · 상세 경로 카드 24 · 캐러셀 40 */
  size: number;
  className?: string;
}

/**
 * 이적 구단 엠블럼 — 메커니즘(이미지 + 하이드레이션 전 실패 감지 + 모노그램 폴백)은
 * `@/shared/ui`의 `Crest`가 갖고, 여기는 **코드로 경로를 조립하는 도메인 지식뿐**이다.
 */
export function TransferCrest({ club, size, className }: TransferCrestProps) {
  if (club === null) return <Crest src={null} label="—" size={size} className={className} />;
  return (
    <Crest
      src={`${CREST_DIR}/${club.code}.png`}
      label={club.shortName}
      size={size}
      className={className}
    />
  );
}
