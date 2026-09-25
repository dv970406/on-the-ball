"use client";

import { Crest } from "@/shared/ui";
import type { Team } from "../model/types";

/**
 * 엠블럼 자산의 위치 — **파일명이 곧 팀 코드다.**
 *
 * ⚠ `team.code`를 그대로 URL에 싣는다. DB CHECK가 `^[a-z][a-z0-9-]*$`(40자 이하)로 강제하는
 *   슬러그라 경로를 벗어나는 문자가 들어올 수 없다 — 그래서 인코딩이 필요 없다.
 * ⚠ 파일은 `scripts/fetch-team-crests.mjs`가 만들어 **저장소에 커밋한다.** 런타임에 늘어나지
 *   않는다는 뜻이라, 승격팀은 파일이 없어 404 → 모노그램으로 떨어진다(`Crest`의 폴백).
 *   `scripts/team-names-ko.json`이 한국어 표기를 다루는 방식과 같은 모양이다.
 */
const CREST_DIR = "/crests";

interface TeamCrestProps {
  team: Team;
  /** px. 목록 카드는 24, 상세 스코어보드는 44 */
  size: number;
  className?: string;
}

/**
 * 구단 엠블럼 — 목록·상세에서 팀을 알아보는 시각 앵커.
 *
 * ⚠ **메커니즘은 `@/shared/ui`의 `Crest`로 승격했다**(이미지 + 하이드레이션 전 실패 감지 +
 *   모노그램 폴백 — 사유는 그 파일 주석). 여기 남은 것은 `team.code`로 엠블럼 경로를
 *   조립하는 **도메인 지식뿐**이다 — 호출부·렌더 결과는 승격 전과 같다.
 *
 * ⚠ **제공자 CDN을 직접 걸지 않고 우리가 줄인 사본을 서빙한다.** 원본이 여기서 그리는 크기
 *   (24·44px)에 비해 한참 과하고, 리사이즈 파라미터를 지원하지 않아(`?width=` 등이 전부
 *   원본을 준다 — 실측) 줄이려면 사본을 두는 수밖에 없다.
 *   128px 팔레트 PNG로 **20팀 1,068KB → 약 85KB(92% 감소)** 가 된다(API-Football 기준 실측).
 *   ⚠ 128px인 이유는 상세(44px)의 DPR 3 필요치(132px)를 덮기 때문이다. 96px이면 28KB 더
 *     줄지만 고배율 화면에서 상세 엠블럼이 흐려진다 — 그 화면의 주인공이라 안 된다.
 *   ⚠ 포맷·크기·품질의 근거는 `scripts/fetch-team-crests.mjs`가 갖는다(WebP가 이 그림에서
 *     오히려 크고, AVIF는 조금 작지만 디코드 실패가 조용한 모노그램이 된다).
 */
export function TeamCrest({ team, size, className }: TeamCrestProps) {
  const src = team.code === "" ? null : `${CREST_DIR}/${team.code}.png`;
  return <Crest src={src} label={team.shortName} size={size} className={className} />;
}
