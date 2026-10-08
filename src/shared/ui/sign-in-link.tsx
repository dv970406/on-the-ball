"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { MouseEvent, SyntheticEvent } from "react";
import { signInWithNext } from "@/shared/config";
import { buttonClassName } from "./button-class";

/**
 * 라벨이 "로그인"인 링크 — 로그인 후 **지금 보던 주소(쿼리 포함)** 로 돌아오게 한다.
 *
 * `SignInDialog`를 끼지 않고 곧바로 이동한다 — 목적지가 라벨에 적혀 있어 되묻는 것이 방해다
 * (`AuthStatus`·데스크톱 상단 바가 이 자리다).
 *
 * ⚠ **`href`는 경로만 싣고 쿼리는 누르는 순간에 더한다.** 이적 보드의 필터(`?league=`)·딜 패널(`?deal=`)은
 *   화면 안에서 `history.pushState`로만 바뀌어 서버 렌더가 모른다 — href에 쿼리를 넣으려면
 *   `useSearchParams`가 필요한데 그건 프리렌더를 CSR로 떨어뜨리고(`nextjs.md`), 렌더 중에
 *   `location`을 읽으면 서버 HTML과 갈린다. 그래서 서버·클라 첫 렌더는 같은 href(경로만)를 그리고,
 *   클릭 순간에만 `location.search`를 읽어 목적지를 고친다.
 *   - 일반 클릭: Next의 이동을 막고(`preventDefault`) 고친 목적지로 `router.push`한다.
 *   - 그 밖의 길(수정 키 클릭·가운데 클릭·우클릭 "링크 복사"·키보드로 연 메뉴): Next가 가로채지 않고
 *     브라우저가 앵커의 `href`를 그대로 쓴다 → 그 길에 들어서는 순간(`pointerenter`·`pointerdown`·`focus`·
 *     `contextmenu`·`auxclick`)마다 DOM의 `href`를 지금 주소로 다시 쓴다(`pointerenter`는 상태 표시줄의 주소용).
 * ⚠ **보정은 쿼리 유무와 무관하게 늘 한다.** React는 prop이 같으면 속성을 다시 쓰지 않으므로, 쿼리가 있던
 *   때 고쳐 둔 `href`가 필터를 푼 뒤에도 남아 다음 새 탭·복사가 낡은 주소를 연다.
 * ⚠ 가운데 클릭은 `click`이 아니라 `auxclick`이다 — `onClick`만 걸면 그 길이 통째로 빠진다.
 * 목적지의 OAuth 복귀 파라미터(`?code=` 등)는 `signInWithNext`가 걷고, 검증은 `safeNextPath`가 한다.
 */
export function SignInLink() {
  const pathname = usePathname();
  const router = useRouter();

  // 지금 주소(쿼리 포함)로 앵커의 href를 맞추고 그 목적지를 돌려준다
  const syncHref = (anchor: HTMLAnchorElement) => {
    const target = signInWithNext(`${window.location.pathname}${window.location.search}`);
    anchor.href = target;
    return target;
  };

  const syncFromEvent = (event: SyntheticEvent<HTMLAnchorElement>) => {
    syncHref(event.currentTarget);
  };

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    const target = syncHref(event.currentTarget);
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;

    event.preventDefault();
    router.push(target);
  };

  return (
    <Link
      href={signInWithNext(pathname)}
      onClick={handleClick}
      onAuxClick={syncFromEvent}
      onPointerEnter={syncFromEvent}
      onPointerDown={syncFromEvent}
      onFocus={syncFromEvent}
      onContextMenu={syncFromEvent}
      className={buttonClassName({ variant: "secondary", size: "sm" })}
    >
      로그인
    </Link>
  );
}
