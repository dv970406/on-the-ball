/**
 * 공개 환경변수(`NEXT_PUBLIC_*`)의 단일 소스 — Supabase 연결 · 배포 도메인 · 검색엔진 확인 · 분석.
 * NEXT_PUBLIC_* 값은 빌드 시 인라인되므로 모듈 최상위에서 읽어도 안전하다.
 * 값이 비어 있어도 빌드는 성공해야 하므로 여기서 throw하지 않는다 — 호출부에서 가드.
 */
export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  /**
   * 절대 URL이 필요한 메타데이터(`metadataBase` → og:image)의 기준 오리진.
   *
   * ⚠ 비워 두면 localhost로 폴백해 **공유 프리뷰 이미지가 열리지 않는다**.
   *   배포 도메인이 정해지면 `NEXT_PUBLIC_SITE_URL`을 채운다.
   *   Vercel은 프리뷰 배포마다 도메인이 달라지므로 `VERCEL_URL`을 그다음으로 본다.
   * ⚠ `NEXT_PUBLIC_*`는 **빌드 시점에 인라인된다.** 런타임에만 주입하는 배포(도커 등)에서는
   *   값이 잡히지 않고 조용히 localhost가 나가므로, 반드시 빌드 환경에 넣어야 한다.
   */
  siteUrl: resolveSiteUrl(),
  /**
   * 검색엔진 소유권 확인 토큰 — 루트 layout이 `<meta name="…-site-verification">`으로 내보낸다.
   *
   * Search Console·네이버 서치어드바이저에 사이트를 등록해야 사이트맵 제출·색인 요청·검색
   * 유입 리포트가 열린다. 비어 있으면 태그를 아예 내보내지 않는다(빈 content는 확인에 실패한다).
   * ⚠ 값은 HTML에 그대로 실리는 공개 토큰이라 `NEXT_PUBLIC_*`이어도 무해하다 — 비밀이 아니라
   *   "이 도메인의 HTML을 내가 고칠 수 있다"는 증명이다.
   */
  googleSiteVerification: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ?? "",
  naverSiteVerification: process.env.NEXT_PUBLIC_NAVER_SITE_VERIFICATION ?? "",
  /**
   * GA4 측정 ID(`G-XXXXXXXXXX`) — 루트 layout이 이 값이 있을 때만 gtag를 싣고, `track`
   * (`@/shared/lib`)도 이 값이 있을 때만 이벤트를 보낸다. 비우면 분석 스크립트가 아예 내려가지 않는다
   * (로컬·프리뷰가 운영 수치에 섞이지 않게 운영 빌드에만 넣는다).
   *
   * ⚠ 값이 인라인 스크립트와 스크립트 주소에 그대로 들어간다 — 형식이 아니면 비운 것으로 다룬다.
   *   오타 하나로 모든 화면에 깨진 스크립트가 실리는 것보다 측정이 꺼지는 편이 낫다.
   */
  gaId: resolveGaId(),
  /**
   * 웹 푸시의 VAPID **공개키**(base64url) — 브라우저가 푸시 구독을 만들 때 "이 서버의 알림만 받겠다"고 묶는 값이다.
   * 짝이 되는 비밀키는 발송 스크립트(`scripts/sync-transfer-news.mjs`)의 환경에만 있다(`VAPID_PRIVATE_KEY`) —
   * 이 모듈은 클라이언트 번들에 실리므로 **비밀키를 여기 두지 않는다.**
   *
   * 비어 있으면 알림 기능을 화면에 그리지 않는다(켤 수 없는 스위치를 두지 않는다).
   * ⚠ 키를 바꾸면 기존 구독은 전부 무효가 된다(브라우저 구독이 옛 키에 묶여 있다) — 사용자가 다시 켜야 한다.
   */
  vapidPublicKey: resolveVapidPublicKey(),
};

/** 형식(P-256 공개키 65바이트의 base64url = 87자)이 맞을 때만 받는다 — 깨진 키로 구독을 시도하면 영문 예외만 남는다 */
function resolveVapidPublicKey(): string {
  const raw = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").trim();
  if (!raw) return "";
  if (/^[A-Za-z0-9_-]{87}$/.test(raw)) return raw;
  console.error("[env] NEXT_PUBLIC_VAPID_PUBLIC_KEY가 VAPID 공개키 형식이 아니에요 — 알림 기능을 끕니다.");
  return "";
}

/** 형식(`G-` + 영숫자)이 맞을 때만 측정 ID로 받는다 — 아니면 로그를 남기고 끈다 */
function resolveGaId(): string {
  const raw = (process.env.NEXT_PUBLIC_GA_ID ?? "").trim();
  if (!raw) return "";
  if (/^G-[A-Z0-9]{4,20}$/.test(raw)) return raw;
  console.error(`[env] NEXT_PUBLIC_GA_ID가 GA4 측정 ID 형식이 아니에요: ${JSON.stringify(raw)} — 분석을 끕니다.`);
  return "";
}

/** 스킴이 빠진 값이 흔해서 붙여준다 — `new URL("example.com")`은 그대로 두면 throw한다 */
function withScheme(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

/**
 * ⚠ **반드시 유효한 절대 URL을 돌려줘야 한다.** 이 값은 루트 layout의 `metadataBase`에서
 *   `new URL()`에 들어가는데, 그건 모듈 최상위라 throw하면 **앱의 모든 라우트가 죽는다**
 *   (메시지도 `Invalid URL` 한 줄이라 원인이 드러나지 않는다).
 *   깨진 설정 하나로 서비스가 내려가는 것보다, 로그를 남기고 폴백해 뜨는 편이 낫다.
 */
function resolveSiteUrl(): string {
  const fallback = "http://localhost:3000";
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  if (!raw) return fallback;

  try {
    // origin이 아니라 href다 — basePath 배포(`https://example.com/app`)의 경로를 잘라내지 않는다
    return new URL(withScheme(raw)).href;
  } catch {
    console.error(
      `[env] NEXT_PUBLIC_SITE_URL이 올바른 URL이 아니에요: ${JSON.stringify(raw)} — ` +
        `${fallback}으로 대체합니다. 공유 프리뷰 이미지가 열리지 않습니다.`,
    );
    return fallback;
  }
}

/** Supabase 환경변수가 채워졌는지 여부 (미설정 시 화면·API에서 안내 노출) */
export function isSupabaseConfigured(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}
