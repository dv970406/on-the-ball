import { ROUTES } from "@/shared/config";
// ⚠ 배럴(@/shared/lib)이 아니라 직접 경로 — 배럴은 "use client" 훅을 포함하고, 이 파일은 서버 page들이 쓴다.
import { clamp } from "@/shared/lib/text";
import { headlineReports } from "../api/mappers";
import type { TransferDeal, TransferReport } from "../model/types";
import { dealNoun, loanNote } from "./deal-form";
import { playerName } from "./player-name";
import { destinationClubs, routeLabels } from "./route-label";
import { STAGE_STATUS, STATUS_LABEL } from "./stage";

/**
 * 딜 하나를 공유 카드·검색 결과로 말하는 값 — 제목·설명·카드 이미지.
 *
 * 쓰는 자리가 둘이다 — 딜 상세(`app/transfers/[id]/page.tsx`)와, 보드에서 딜을 고른 주소(`/transfers?deal=<id>`)를 공유했을
 * 때의 보드(`app/transfers/page.tsx`). 같은 딜이 어느 주소로 공유되든 **같은 카드**로 보여야 해서 한 곳에 둔다.
 * 순수 함수라 서버 안전하다 — 서버 page는 배럴이 아니라 이 직접 경로로 가져간다.
 */

const META_TITLE_MAX = 60;
const META_DESCRIPTION_MAX = 120;

/** 딜 카드 이미지의 치수·대체 문구 — 그리는 쪽(`app/transfers/[id]/opengraph-image.tsx`)이 그대로 내보낸다 */
export const DEAL_CARD_SIZE = { width: 1200, height: 630 };
export const DEAL_CARD_ALT = "온더볼 — 이적 딜 카드(선수 · 이적 경로 · 이적료)";

/**
 * 검색 결과·공유 카드의 제목 — `선수 이적 · 출발 → 행선지 (상태)`. 임대 계열이면 "이적" 자리에 형태의 말이 온다
 * (`가르나초 임대 · 첼시 → 빌라 (오피셜)` — `dealNoun`). "선수 + 임대" 검색어와 맞고, 임대를 완전 이적으로 말하지 않는다.
 * 임대 구단(경로 밖)은 제목에 넣지 않는다 — 제목이 길면 상태까지 잘린다. 설명의 경로 폴백이 그것을 말한다.
 *
 * 사람들은 선수 이름과 구단 이름을 함께 검색한다("케인 바이에른") — 제목이 선수 이름뿐이면 그 검색어와 맞는 말이 없다.
 * 선수 이름을 맨 앞에 둔다(잘려도 남는다). 경로는 약칭이다(제목이 길면 검색 결과에서 잘린다).
 * ⚠ 행선지 자리에 구단이 여럿이면 가장 유력한 하나 + `등`이다 — 화면 문구(`리버풀 · 노팅엄 · 뉴캐슬 외 3`)를 그대로 실으면
 *   제목이 그 나열로 채워져 검색 결과에서 상태까지 잘린다(실측). 순서는 화면과 같은 `destinationClubs`다.
 * ⚠ 그 밖의 경로·상태 문구는 화면과 **같은 함수**다(`routeLabels`·`STATUS_LABEL`).
 * ⚠ 클램프한다 — `player`는 DB가 길이를 넓게 허용한다. 접미사(`| 온더볼`)는 루트의 `title.template`이 붙인다.
 */
export function dealMetaTitle(deal: TransferDeal): string {
  const labels = routeLabels(deal);
  const clubs = destinationClubs(deal);
  const to = clubs.length > 1 ? `${clubs[0].shortName} 등` : labels.to;
  const status = STAGE_STATUS[deal.stage];
  const suffix = status === null ? "" : ` (${STATUS_LABEL[status]})`;
  return clamp(`${playerName(deal)} ${dealNoun(deal.form)} · ${labels.from} → ${to}${suffix}`, META_TITLE_MAX);
}

/**
 * 공유 카드·검색 결과의 한 줄.
 *
 * 대표 보도의 요지를 쓴다 — 한국어 요약이 있는 가장 최근 보도, 그런 보도가 없으면 최신 보도의 영문 발췌(`headlineReports` —
 * 보드 오른쪽 판의 "최신 보도"와 같은 판정). 최신 보도를 그대로 쓰면 판정 전·이적과 무관한 영문 기사가 공유 카드 설명이 된다.
 * 없으면(보도를 읽지 못했을 때 포함) 화면이 그리는 값(경로 + 상태 뱃지)으로 만든다. 어느 쪽이든 120자에서 클램프한다.
 * ⚠ 발췌는 줄바꿈을 담고 있을 수 있다(텔레그램 원문) — 메타 태그에 실릴 문장이라 공백 하나로 접는다.
 */
export function dealMetaDescription(deal: TransferDeal, reports: TransferReport[] | undefined): string {
  const gist = headlineReports(reports ?? [], 1)[0]?.gist?.text.replace(/\s+/g, " ").trim();
  if (gist) return clamp(gist, META_DESCRIPTION_MAX);

  const status = STAGE_STATUS[deal.stage];
  // 화면(경로 카드·`ClubRoute`)과 **같은 문구**다 — 빈 칸의 말(`FA`·`미확인`·`미정`·`외 N`)까지 `routeLabels`가 정한다.
  const labels = routeLabels(deal, { full: true });
  // 임대 중인 선수는 출발(보유 구단) 뒤에 임대 상태를 괄호로 단다 — 경로 밖 한 줄(`loanNote`)을 한 문장으로 옮긴 것이다
  const note = loanNote(deal, { full: true });
  const route = `${labels.from}${note ? `(${note})` : ""} → ${labels.to}`;
  return clamp(status === null ? route : `${route} · ${STATUS_LABEL[status]}`, META_DESCRIPTION_MAX);
}

/**
 * 딜 카드 이미지 — 딜 상세 세그먼트의 `opengraph-image.tsx`가 그리는 그림을 **다른 세그먼트가** 가리킬 때 쓴다.
 *
 * ⚠ 딜 상세 자신은 이것을 쓰지 않는다 — 그 세그먼트의 메타데이터에 `images`를 적으면 같은 폴더의 파일 컨벤션을 이겨
 *   카드 대신 이 값이 나간다(`nextjs.md`). 파일 컨벤션이 붙이는 해시 쿼리(`?…`)는 캐시 무효화용이라 없어도 같은 그림이다.
 * ⚠ 주소가 그 파일의 위치에서 나온다 — 파일을 옮기거나 이름을 바꾸면 여기도 함께 바꾼다(빌드는 잡지 못하고 공유 카드만 깨진다).
 */
export function dealCardImage(dealId: number) {
  return {
    url: `${ROUTES.transfer(dealId)}/opengraph-image`,
    type: "image/png",
    ...DEAL_CARD_SIZE,
    alt: DEAL_CARD_ALT,
  };
}
