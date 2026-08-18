/** 본문에 넣을 수 있는 스킴 — 나머지는 전부 거부한다 */
const ALLOWED_PROTOCOLS = ["http:", "https:"];

/**
 * 사용자가 입력한 링크 주소를 판정한다.
 *
 * ⚠ **`safeNextPath`(`@/shared/config`)를 쓰지 않는다.** 그건 로그인 복귀용으로 **앱 내부
 *   경로만** 통과시키는 판정이라, 여기서 쓰면 모든 외부 링크가 거부된다. 목적이 반대다 —
 *   저쪽은 "밖으로 내보내지 않는다", 이쪽은 "밖으로 나가되 스킴을 제한한다".
 *
 * ⚠ `shared`로 올리지 않는다. 소비처가 이 슬라이스 하나이고, 렌더 쪽 방어는 react-markdown의
 *   기본 `urlTransform`이 이미 따로 하고 있어 **두 곳이 같아야 하는 규약이 아니다**
 *   (`parsePostId`가 proxy와 페이지 사이에서 지는 책임과는 성격이 다르다).
 */
export function parseExternalUrl(
  input: string,
): { ok: true; href: string } | { ok: false; message: string } {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, message: "링크 주소를 입력해 주세요." };

  // 사용자는 대개 스킴 없이 친다(example.com). 한 번은 https를 붙여 다시 해석한다.
  const parsed = toUrl(trimmed) ?? (hasScheme(trimmed) ? null : toUrl(`https://${trimmed}`));
  if (!parsed) return { ok: false, message: "올바른 링크 주소가 아니에요." };

  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    // javascript: · data: · file:이 전부 여기서 걸린다
    return { ok: false, message: "http 또는 https 주소만 넣을 수 있어요." };
  }
  if (!parsed.hostname) return { ok: false, message: "올바른 링크 주소가 아니에요." };

  return { ok: true, href: parsed.href };
}

function toUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** `https://`를 덧붙여도 되는지 — 이미 스킴이 있으면 붙이면 안 된다(`javascript:` 우회 방지) */
function hasScheme(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value);
}
