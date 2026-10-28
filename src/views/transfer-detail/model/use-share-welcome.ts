"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { SessionStatus } from "@/entities/session";
import { ROUTES } from "@/shared/config";
import { track } from "@/shared/lib";
import { SHARE_UTM_MEDIUM } from "@/widgets/sub-header";

/**
 * 이 브라우저가 공유 담기 안내를 이미 봤다는 표식.
 *
 * ⚠ **localStorage에 둔다** — 한 번만 보여 주는 약속이 탭·방문을 넘어 살아야 뜻이 있다(`last-auth-provider`와 같은 판단).
 * ⚠ 읽기·쓰기 모두 throw할 수 있다(사이트 데이터 차단·저장 공간). **읽지 못하면 안내를 띄우지 않는다** — 본 적이 있는지
 *   모르는 채로 띄우면 공유 링크를 열 때마다 뜬다. 안내가 빠질 뿐 화면은 그대로다.
 */
const SEEN_KEY = "otb.share-welcome.seen";

/** 문서의 주소도 표식도 이 화면에 머무는 동안 스스로 바뀌지 않는다 — 구독할 것이 없다(`useNextParam`과 같은 형태) */
function subscribe() {
  return () => {};
}

/**
 * **문서를 처음 연 주소**(경로 + 쿼리) — 브라우저에서 처음 읽을 때 한 번 정하고 그 문서가 사는 동안 그대로다.
 *
 * ⚠ **지금 주소(`location`)로 판정하지 않는다.** 앱 안 이동에서 Next는 주소를 커밋 단계에서 바꾼다(app-router의
 *   `HistoryUpdater`) — 새 화면이 렌더되는 순간의 `location`은 **이전 화면의 주소**다. 보드·구단 화면의 공유 링크로 들어와
 *   딜 행을 누르면 UTM 없는 딜 상세에서 그 낡은 `utm_medium=share`가 읽혀 안내가 떴다(리뷰 재현).
 * ⚠ 문서의 주소는 내비게이션 타이밍 항목(`performance`)이 갖는다 — 이 모듈이 언제 내려왔든(앱 안 이동 중에 늦게 받은
 *   청크여도) 같은 값이다. 항목이 없는 브라우저만 처음 읽은 순간의 `location`으로 대신한다.
 */
let documentEntry: URL | undefined;
function documentUrl(): URL {
  if (!documentEntry) {
    const nav = performance.getEntriesByType?.("navigation")[0];
    documentEntry = new URL(nav?.name || window.location.href);
  }
  return documentEntry;
}

/**
 * 이 딜의 상세가 **공유 주소로 직접 열렸고**(`utm_medium=share` — `widgets/sub-header`의 `shareUrl`이 붙이는 값을 그대로
 * 가져다 쓴다) 이 브라우저가 안내를 본 적이 없는가.
 *
 * - 문서를 연 경로가 **이 딜의 상세**여야 한다 — 딜 A의 공유 링크로 들어와 앱 안에서 딜 B로 가면 B에서는 뜨지 않는다.
 * ⚠ 브라우저에서만 불린다 — 서버·하이드레이션 렌더는 아래 서버 스냅샷(`false`)을 쓰고, 이 값은 하이드레이션이 끝난 뒤에야
 *   읽힌다. 그래서 서버 HTML에는 안내가 없고 하이드레이션이 갈리지 않는다.
 * ⚠ `useSearchParams`를 쓰지 않는다 — 이 화면의 프리렌더가 CSR로 떨어진다(`nextjs.md`). 주소의 UTM은 지우지 않는다 —
 *   GA4가 그 주소로 공유 유입을 센다.
 */
function readArrival(dealId: number): boolean {
  const url = documentUrl();
  if (url.pathname !== ROUTES.transfer(dealId)) return false;
  if (url.searchParams.get("utm_medium") !== SHARE_UTM_MEDIUM) return false;
  try {
    return window.localStorage.getItem(SEEN_KEY) === null;
  } catch {
    return false;
  }
}

function readArrivalOnServer(): boolean {
  return false;
}

/** 보였다고 적는다. 실패하면 조용히 넘어간다 — 이번 방문의 안내는 이미 떠 있다 */
function rememberSeen(): void {
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // 쓰기만 막힌 환경(저장 공간이 가득 찼다) — 위 읽기가 통과했으니 다음 방문에 다시 뜰 수 있다
  }
}

interface UseShareWelcomeArgs {
  /** 지금 보고 있는 딜 — 안내가 그 딜에 붙고, 딜이 바뀌면(같은 자리의 다른 딜) 따라가지 않는다 */
  dealId: number;
  /** 딜이 화면에 그려졌다 — 안내가 붙을 자리(하단 바·곁 칸)가 딜과 함께 생긴다. 그 전에 "봤다"를 적지 않는다 */
  dealShown: boolean;
  /** 그 딜이 지금 담겨 있는가 — 담긴 딜에는 담으라고 권하지 않는다 */
  watched: boolean;
  /** 세션 상태 — 비로그인(`guest`)에게만 낸다 */
  status: SessionStatus;
}

/**
 * **공유 링크로 처음 들어온 비로그인 방문자**에게 딜 상세에서 "관심 목록에 담기 → 알림 켜기"를 한 번 안내할지 정한다.
 * 데려온 사람이 다시 오게 만드는 장치다. `show`가 참일 때 `ShareWelcome`을 그린다.
 *
 * - 조건: 주소가 공유 주소 · 비로그인 · 딜이 그려졌고 담겨 있지 않다 · 이 브라우저에서 처음.
 * - ⚠ **세션 복원 중(`loading`)에는 정하지 않는다** — 띄우지도, "봤다"를 적지도 않는다. 로그인 사용자가 복원 직전에
 *   표식만 써 버리거나 안내가 한 프레임 보였다 사라진다.
 * - ⚠ **보인 순간을 state로 붙든다.** 보이자마자 표식을 쓰므로 그다음 렌더의 `readArrival`은 거짓이 된다 — 붙들지 않으면
 *   그 화면에 머무는 동안 남아 있어야 할 안내가 표식을 쓴 직후 사라진다. 렌더 중에 state를 맞추는 형태다(조건이 한 번만
 *   참이 되어 한 번만 돈다 — `usePushNudge`와 같은 형태). effect에서 정하면 `react-hooks/set-state-in-effect`에 걸린다.
 * - 걷는 때: 닫기(`dismiss` — 센다) · 관심 토글을 누름(`hide` — 비로그인이면 로그인 안내가 그 자리를 이어받는다) ·
 *   로그인 상태가 됨. ⚠ 한번 걷히면 이 화면에서 다시 나오지 않는다(다시 로그아웃해도).
 */
export function useShareWelcome({ dealId, dealShown, watched, status }: UseShareWelcomeArgs) {
  const arrived = useSyncExternalStore(subscribe, () => readArrival(dealId), readArrivalOnServer);
  const [shownId, setShownId] = useState<number | null>(null);
  const [closed, setClosed] = useState(false);

  if (arrived && status === "guest" && dealShown && !watched && shownId === null && !closed) setShownId(dealId);
  if (shownId !== null && !closed && status === "authenticated") setClosed(true);

  // 보인 순간에 한 번 — 표식을 쓰고 센다. 렌더가 아니라 커밋 뒤라야 실제로 보인 것만 센다
  useEffect(() => {
    if (shownId === null) return;
    rememberSeen();
    track("share_welcome", { deal_id: shownId, action: "shown" });
  }, [shownId]);

  return {
    show: shownId === dealId && !closed && status === "guest" && !watched,
    /** 닫기 버튼 — 닫은 것을 센다 */
    dismiss: () => {
      setClosed(true);
      track("share_welcome", { deal_id: dealId, action: "dismissed" });
    },
    /** 관심 토글을 눌렀다 — 세지 않고 걷는다(그다음 걸음은 로그인 이벤트가 센다) */
    hide: () => setClosed(true),
  };
}
