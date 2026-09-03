/**
 * Supabase 연결 환경변수.
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
   * 선수 사진을 **실제로 그릴 것인가**.
   *
   * ⚠ **기본이 꺼짐인 것이 이 플래그의 요점이다.** 제공자는 사진의 권리자가 아니고
   *   ("identification and descriptive purposes"로 제공할 뿐 게시 라이선스를 주지 않는다),
   *   권리는 **사진 저작권(촬영 에이전시)과 선수의 초상·퍼블리시티권 두 겹**으로 걸린다.
   *   그래서 값이 없는 환경 — 즉 **새로 만든 배포 환경** — 은 자동으로 안 그리는 쪽이 된다.
   *   켜는 것은 언제나 명시적인 행위여야 한다.
   * ⚠ 끄면 화면이 깨지는 게 아니라 `PlayerPhoto`가 **실루엣으로 떨어진다** — 이미 있는
   *   폴백 경로라, 이 플래그는 UI를 되돌리는 것이 아니라 분기 하나를 닫는 일이다.
   * ⚠ 판정을 호출부가 각자 하지 않는다 — 사진 주소를 만드는 `playerPhotoUrl`이 이 값을
   *   보고 `null`을 돌려준다(호출부가 기억해야 하는 방어는 방어가 아니다).
   */
  showPlayerPhotos: process.env.NEXT_PUBLIC_SHOW_PLAYER_PHOTOS === "true",
};

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
