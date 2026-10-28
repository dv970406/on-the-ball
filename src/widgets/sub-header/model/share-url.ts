/**
 * 공유할 주소 — 지금 주소에 **공유로 들어왔다는 표식(UTM)** 을 붙인다. GA4가 `utm_source`·`utm_medium`을 읽어 유입 채널로 센다
 * (공유가 실제로 사람을 데려오는지를 "공유한 횟수"가 아니라 "공유로 들어온 방문"으로 잴 수 있다).
 *
 * - `utm_medium=share`로 묶고, `utm_source`가 경로를 가른다: 카카오톡(`kakaotalk`) · OS 공유 시트(`share_sheet` — 어느 앱으로
 *   보냈는지는 브라우저가 알려 주지 않는다) · 링크 복사(`link_copy`).
 * - ⚠ **이미 붙은 UTM은 걷고 다시 붙인다** — 공유로 들어온 사람이 다시 공유하면 앞 사람의 경로가 그대로 실려 채널이 섞인다.
 * - ⚠ **OAuth 복귀 파라미터를 걷는다**(`code`·`state`·`error…`) — 복귀 화면에서 공유하면 끝난 교환 코드가 남의 단톡방에 실린다.
 * - 나머지 쿼리(보드 필터 · `?deal=`)는 원래 표기 그대로 둔다 — 받는 사람이 같은 화면을 봐야 한다. canonical은 각 화면이
 *   경로만으로 만들어 UTM이 색인에 섞이지 않는다.
 * - ⚠ `utm_medium`의 값(`SHARE_UTM_MEDIUM`)은 **딜 상세의 공유 담기 안내도 읽는다**(`views/transfer-detail`의 `useShareWelcome` —
 *   공유로 처음 온 비로그인 방문자에게 한 번). 그쪽은 이 상수를 가져다 쓴다 — 문자열을 따로 적으면 한쪽만 바뀌어 안내가 조용히 사라진다.
 */
import { withoutAuthReturnParams } from "@/shared/config";

export type ShareSource = "kakaotalk" | "share_sheet" | "link_copy";

/** 공유로 들어왔다는 표식 — GA4가 이 값으로 공유 유입을 묶고, 딜 상세의 공유 담기 안내가 이 값으로 공유 방문을 알아본다 */
export const SHARE_UTM_MEDIUM = "share";

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;

export function shareUrl(href: string, source: ShareSource): string {
  const current = new URL(href);
  // 판정은 로그인 복귀 경로(`withNext`)와 같은 함수가 갖는다
  const url = new URL(withoutAuthReturnParams(`${current.pathname}${current.search}`), current.origin);
  for (const key of UTM_KEYS) url.searchParams.delete(key);
  url.searchParams.set("utm_source", source);
  url.searchParams.set("utm_medium", SHARE_UTM_MEDIUM);
  // 조각(#)은 화면 안의 자리라 받는 사람에게 의미가 없다(위에서 경로 + 쿼리만 옮겼다)
  return url.toString();
}
