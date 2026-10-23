import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { unstable_rethrow } from "next/navigation";
import { TOKEN_COLORS } from "@/shared/config";
// ⚠ 배럴이 아니라 직접 경로 — 배럴은 "use client" 훅을 담는다(`app/transfers/[id]/page.tsx`와 같은 이유).
//   조립·매퍼·라벨을 화면과 **같은 함수**로 써야 카드가 화면과 같은 말을 한다.
import { parsePostId } from "@/shared/lib/post-id";
import { createSupabaseAnonClient } from "@/shared/api/supabase-anon";
import { buildDealQuery } from "@/entities/transfer/api/list-query";
import { buildDeal } from "@/entities/transfer/api/mappers";
import { dealFormMark, loanNote } from "@/entities/transfer/lib/deal-form";
import { feeKindLabel, feeLabel } from "@/entities/transfer/lib/fee";
import { playerName } from "@/entities/transfer/lib/player-name";
import { destinationClubs, routeLabels, ROUTE_CLUB_LIMIT } from "@/entities/transfer/lib/route-label";
import { STAGE_STATUS, STATUS_LABEL } from "@/entities/transfer/lib/stage";
import { DEAL_CARD_ALT, DEAL_CARD_SIZE } from "@/entities/transfer/lib/deal-meta";
import type { TransferClub, TransferDeal, TransferStatus } from "@/entities/transfer/model/types";

/**
 * 딜 상세의 공유 카드 — 선수 · 상태 · 형태(임대) · 경로 · 이적료를 한 장에 그린다.
 * 임대 계열이면 상태 뱃지 옆에 형태 표지(`임대·의무` — 화면의 `DealFormMark`와 같은 글자)를, 선수가 다른 구단에 임대 중이면 경로
 * 아래에 "○○ 임대 중"(`loanNote`)을 그린다 — 경로만 보면 완전 이적으로 읽힌다.
 *
 * 단톡방·커뮤니티에 붙인 링크가 **그 딜의 카드**로 보이게 하는 것이 목적이다 — 사이트 공통 이미지는 어느 딜이든
 * 같은 그림이라 프리뷰만으로는 무슨 소식인지 알 수 없다.
 *
 * ⚠ **익명 클라이언트로 읽는다.** 카드는 누가 열든 같아야 하고(크롤러가 받는다), 개인화 값(`isWatched`)을 그리지
 *   않는다. 쿠키를 읽지 않으므로 조회가 Data Cache를 타고(`ANON_REVALIDATE`), 그 주기가 곧 이 이미지의 재생성
 *   주기다 — 단계가 바뀌어도 그만큼 늦게 따라온다. 공유 플랫폼은 그보다 훨씬 오래 자기 쪽에 캐시한다.
 * ⚠ **한글 폰트를 통째로 싣는다**(`src/app/fonts/og`, 약 1.6MB). `ImageResponse`(satori)는 woff2를 읽지 못해
 *   화면의 Pretendard 동적 서브셋을 쓸 수 없다. 이 파일은 브라우저로 내려가지 않고 이 라우트의 함수에만 실린다.
 *   굵기는 하나뿐이다 — 위계는 크기와 색으로 만든다.
 * ⚠ **파일은 `process.cwd()` 기준으로 읽고, 배포 번들에 실리도록 `next.config.ts`의
 *   `outputFileTracingIncludes`에 적어 둔다.** 엠블럼 경로는 구단 코드로 조립해 정적 분석이 따라가지 못한다 —
 *   설정에서 빠지면 로컬은 멀쩡하고 배포에서만 엠블럼이 사라진다.
 * ⚠ 스타일은 인라인 `style`뿐이다(satori는 클래스를 읽지 않는다) — 색은 토큰과 같은 값의 `TOKEN_COLORS`를 쓴다.
 *   레이아웃은 flex만 된다: 자식이 둘 이상인 요소는 전부 `display: "flex"`여야 한다.
 * ⚠ 없는 딜은 404, 조회 실패는 사이트 공통 이미지로 답한다 — 일시 장애로 카드가 깨진 그림이 되지 않게.
 */

// 치수·대체 문구는 보드의 `?deal=` 공유가 이 그림을 가리킬 때도 쓴다(`dealCardImage`) — 한 곳에서 가져온다
export const alt = DEAL_CARD_ALT;
export const size = DEAL_CARD_SIZE;
export const contentType = "image/png";

const FONT_FAMILY = "Pretendard";
const ROOT = process.cwd();

/**
 * 카드의 캐시 — 브라우저·CDN이 잠깐 들고 있게 한다. 지정하지 않으면 이 라우트의 응답은 `max-age=0`이라, 익명이 딜 id를
 * 돌려 가며 부를 때마다 폰트를 읽고 이미지를 다시 그린다. 단계가 바뀐 카드가 그만큼 늦게 따라오지만 공유 플랫폼은
 * 어차피 자기 쪽에 훨씬 오래 캐시한다.
 */
const CARD_CACHE_CONTROL = "public, max-age=300, s-maxage=300, stale-while-revalidate=3600";

/** 한글 폰트(약 1.6MB) — 요청마다 다시 읽지 않게 한 번 읽은 것을 들고 있는다. 읽기에 실패하면 다음 요청이 다시 읽는다 */
let fontData: Promise<Buffer> | null = null;
function loadFont(): Promise<Buffer> {
  fontData ??= readFile(join(ROOT, "src/app/fonts/og/Pretendard-SemiBold.otf")).catch((e) => {
    fontData = null;
    throw e;
  });
  return fontData;
}

/** 상태 뱃지의 톤 — 화면의 `StatusBadge`와 같은 갈림이다(에메랄드는 오피셜 하나) */
const STATUS_STYLE: Record<TransferStatus, { background: string; color: string; border: string }> = {
  official: { background: TOKEN_COLORS.primary, color: TOKEN_COLORS.onPrimary, border: TOKEN_COLORS.primary },
  hwg: { background: TOKEN_COLORS.ink, color: TOKEN_COLORS.canvas, border: TOKEN_COLORS.ink },
  imminent: { background: TOKEN_COLORS.canvas, color: TOKEN_COLORS.ink, border: TOKEN_COLORS.ink },
  talks: { background: TOKEN_COLORS.canvas, color: TOKEN_COLORS.inkSecondary, border: TOKEN_COLORS.hairlineStrong },
  rumor: { background: TOKEN_COLORS.canvasSoft, color: TOKEN_COLORS.inkMute, border: TOKEN_COLORS.hairlineCool },
  dead: { background: TOKEN_COLORS.canvas, color: TOKEN_COLORS.crimson, border: TOKEN_COLORS.crimson },
  denied: { background: TOKEN_COLORS.canvas, color: TOKEN_COLORS.crimson, border: TOKEN_COLORS.crimson },
};

/** 파일 → data URI. 없으면 `null`(엠블럼이 아직 커밋되지 않은 구단 — 화면의 모노그램 폴백과 같은 경우다) */
async function dataUri(path: string, mime: string): Promise<string | null> {
  try {
    return `data:${mime};base64,${(await readFile(path)).toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * 브랜드 마크(`app/icon.svg`)의 data URI — 폰트처럼 한 번 만든 것을 들고 있는다(요청마다 읽고 base64로 바꾸지 않는다).
 * 읽지 못했으면(`null`) 들고 있지 않는다 — 다음 요청이 다시 읽는다.
 */
let markData: Promise<string | null> | null = null;
function loadMark(): Promise<string | null> {
  markData ??= dataUri(join(ROOT, "app/icon.svg"), "image/svg+xml").then((uri) => {
    if (uri === null) markData = null;
    return uri;
  });
  return markData;
}

/** 구단 엠블럼 — `code`는 DB CHECK(`^[a-z0-9-]{1,60}$`)가 슬러그로 강제해 경로를 벗어날 수 없다 */
function crestUri(club: TransferClub): Promise<string | null> {
  return dataUri(join(ROOT, "public/crests", `${club.code}.png`), "image/png");
}

/**
 * 사이트 공통 이미지 — 조회가 실패했을 때의 답.
 * ⚠ **캐시하지 않는다**(`no-store`). 일시 장애의 답이 이 딜의 주소로 캐시되면 장애가 끝난 뒤에도 공통 그림이 남는다.
 */
async function fallbackImage(): Promise<Response> {
  const png = await readFile(join(ROOT, "app/opengraph-image.png"));
  // ⚠ 길이를 붙인다(아래 카드와 같은 이유). 본문은 Buffer가 아니라 `Uint8Array` 복사본이다 — Vercel 함수가 `Buffer` 본문을
  //   UTF-8로 다시 인코딩해 PNG를 깨뜨린다는 보고가 이 Next 버전에 있다.
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": contentType, "Content-Length": String(png.byteLength), "Cache-Control": "no-store" },
  });
}

type DealCard = { state: "found"; deal: TransferDeal } | { state: "missing" } | { state: "unknown" };

async function fetchDeal(dealId: number): Promise<DealCard> {
  try {
    const supabase = createSupabaseAnonClient();
    if (!supabase) return { state: "unknown" };
    const { data, error } = await buildDealQuery(supabase, dealId);
    if (error) return { state: "unknown" };
    return data ? { state: "found", deal: buildDeal(data) } : { state: "missing" };
  } catch (e) {
    // 프레임워크 제어용 에러는 되던진다(`nextjs.md`)
    unstable_rethrow(e);
    console.error("[transfers/[id]/opengraph-image] 딜 조회 실패:", e);
    return { state: "unknown" };
  }
}

/** 이름이 길수록 작게 — 두 줄을 넘기지 않는다(넘치면 말줄임) */
function nameFontSize(name: string): number {
  const length = [...name].length;
  if (length <= 9) return 104;
  if (length <= 16) return 84;
  return 68;
}

/** 엠블럼 한 개 — 파일이 없으면 약칭 앞 두 글자의 모노그램(화면의 `Crest` 폴백과 같은 모양) */
function CrestMark({ uri, label, size: px }: { uri: string | null; label: string; size: number }) {
  if (uri) {
    // satori가 그리는 이미지다(브라우저로 가지 않는다) — `next/image`의 대상이 아니다
    return <img src={uri} width={px} height={px} alt="" style={{ objectFit: "contain" }} />;
  }
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: px,
        height: px,
        borderRadius: px / 2,
        border: `2px solid ${TOKEN_COLORS.hairline}`,
        background: TOKEN_COLORS.canvasSoft,
        color: TOKEN_COLORS.inkMute,
        fontSize: px * 0.34,
      }}
    >
      {[...label].slice(0, 2).join("")}
    </div>
  );
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dealId = parsePostId(id);
  if (dealId === null) return new Response("Not Found", { status: 404 });

  // 폰트(약 1.6MB)·마크 읽기를 딜 조회와 나란히 시작한다 — 첫 요청(메모가 빈 인스턴스)에서 조회 왕복 뒤로 밀리지 않게.
  // ⚠ 아래에서 일찍 돌아가면(없는 딜·조회 실패) 이 promise를 기다리는 쪽이 없다 → 실패를 여기서 받아 둔다
  //   (처리되지 않은 rejection이 되지 않게). 기다리는 쪽은 같은 promise라 실패를 그대로 받는다.
  const fontPromise = loadFont();
  fontPromise.catch(() => {});
  const markPromise = loadMark();

  const card = await fetchDeal(dealId);
  if (card.state === "missing") return new Response("Not Found", { status: 404 });
  if (card.state === "unknown") return fallbackImage();

  const { deal } = card;
  const status = STAGE_STATUS[deal.stage];
  const labels = routeLabels(deal);
  const destinations = destinationClubs(deal).slice(0, ROUTE_CLUB_LIMIT);
  const fee = feeLabel(deal);
  // 금액의 성격(제안액·요구액…)을 제목으로 — 상세의 이적료 카드와 같은 판정이다(금액이 없으면 성격도 없다)
  const feeCaption = feeKindLabel(fee.kind === "fee" ? deal.feeKind : null, deal.loanClause);
  const form = dealFormMark(deal);
  const note = loanNote(deal);
  const name = playerName(deal);

  const [font, mark, fromCrest, ...toCrests] = await Promise.all([
    fontPromise,
    markPromise,
    deal.fromClub ? crestUri(deal.fromClub) : null,
    ...destinations.map(crestUri),
  ]);

  const image = new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          padding: "56px 64px 52px",
          background: TOKEN_COLORS.canvas,
          color: TOKEN_COLORS.ink,
          fontFamily: FONT_FAMILY,
        }}
      >
        {/* 머리 — 브랜드 마크 + 상태 뱃지 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 34, letterSpacing: -1 }}>
            {mark && <img src={mark} width={48} height={48} alt="" />}
            온더볼
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {/* 형태 표지 — 사각형 테두리(뱃지는 알약)로 갈린다. 화면의 `DealFormMark`와 같은 글자다 */}
            {form && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  height: 56,
                  padding: "0 20px",
                  borderRadius: 12,
                  border: `2px solid ${TOKEN_COLORS.hairlineStrong}`,
                  color: TOKEN_COLORS.inkSecondary,
                  fontSize: 30,
                }}
              >
                {form.mark}
              </div>
            )}
            {status !== null && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  height: 56,
                  padding: "0 26px",
                  borderRadius: 28,
                  border: `2px solid ${STATUS_STYLE[status].border}`,
                  background: STATUS_STYLE[status].background,
                  color: STATUS_STYLE[status].color,
                  fontSize: 30,
                }}
              >
                {STATUS_LABEL[status]}
              </div>
            )}
          </div>
        </div>

        {/* 본문 — 선수 이름 + 경로. 남는 높이의 가운데에 놓는다 */}
        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center" }}>
          <div
            style={{
              display: "block",
              fontSize: nameFontSize(name),
              lineHeight: 1.12,
              letterSpacing: -3,
              lineClamp: 2,
            }}
          >
            {name}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 22, marginTop: 34, fontSize: 40, letterSpacing: -1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
              {deal.fromClub && (
                <CrestMark uri={fromCrest ?? null} label={deal.fromClub.shortName} size={60} />
              )}
              <div style={{ display: "flex", color: deal.fromClub ? TOKEN_COLORS.ink : TOKEN_COLORS.inkMute2 }}>
                {labels.from}
              </div>
            </div>

            {/* 화살표 — 글리프(→)가 폰트에 없을 수 있어 직접 그린다 */}
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
              <path
                d="M5 12h14M13 6l6 6-6 6"
                stroke={TOKEN_COLORS.inkMute2}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>

            <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
              {destinations.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
                  {destinations.map((club, i) => (
                    // 여러 구단이 노리는 루머 — 엠블럼을 겹쳐 "여럿"임을 보인다(화면의 `CrestStack`과 같은 뜻)
                    <div key={club.code} style={{ display: "flex", marginLeft: i === 0 ? 0 : -16 }}>
                      <CrestMark uri={toCrests[i] ?? null} label={club.shortName} size={60} />
                    </div>
                  ))}
                </div>
              )}
              <div
                style={{
                  display: "block",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: destinations.length > 0 ? TOKEN_COLORS.ink : TOKEN_COLORS.inkMute2,
                }}
              >
                {labels.to}
              </div>
            </div>
          </div>
          {/* 임대 중인 선수 — 경로 밖의 상태라 경로 아래 한 줄로(세 구단을 화살표로 이으면 연쇄 이적으로 읽힌다) */}
          {note && <div style={{ display: "flex", marginTop: 16, fontSize: 28, color: TOKEN_COLORS.inkMute }}>{note}</div>}
        </div>

        {/* 바닥 — 이적료(성격과 함께) + 보도 수. 위쪽 헤어라인이 본문과 가른다 */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            paddingTop: 30,
            borderTop: `2px solid ${TOKEN_COLORS.hairlineCool}`,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", fontSize: 26, color: TOKEN_COLORS.inkMute }}>{feeCaption}</div>
            <div
              style={{
                display: "flex",
                fontSize: fee.kind === "fee" ? 64 : 46,
                lineHeight: 1,
                letterSpacing: fee.kind === "fee" ? -2 : -1,
                color: fee.kind === "unknown" ? TOKEN_COLORS.inkMute2 : TOKEN_COLORS.ink,
              }}
            >
              {fee.text}
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 26, color: TOKEN_COLORS.inkMute }}>
            {`보도 ${deal.reportCount}건 · 이적시장`}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: FONT_FAMILY, data: font, style: "normal", weight: 600 }],
    },
  );

  // ⚠ **길이를 붙여 보낸다.** `ImageResponse`를 그대로 돌려주면 길이 없이 `Transfer-Encoding: chunked`로 나간다(길이를
  //   명시하지 않은 응답은 전부 그렇다 — 운영은 CDN 적중 응답도 그랬다). 카카오톡이 이 카드를 그리지 못했는데, 잘 그리는
  //   사이트 공통 이미지(정적 파일, 길이 있음)와 응답이 다른 점이 그것뿐이었다. ⚠ 카카오가 길이 없는 이미지를 거부한다는
  //   공식 근거는 없다 — 가장 유력한 차이를 없앤 것이다. 버퍼링 비용은 없다(그리기가 끝난 PNG를 한 번에 내보내는 구현이다).
  const png = await image.arrayBuffer();
  return new Response(png, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(png.byteLength),
      "Cache-Control": CARD_CACHE_CONTROL,
    },
  });
}
