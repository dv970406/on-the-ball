"use client";

import { usePathname } from "next/navigation";
import { useEffect, type RefObject } from "react";

/**
 * 탭 스크롤 영역의 위치를 sessionStorage에 저장/복원한다.
 * 디테일 화면이 별도 라우트라 탭 레이아웃이 unmount되므로,
 * 리스트 → 디테일 → 뒤로가기 왕복 시 스크롤 위치를 유지하기 위해 필요하다.
 *
 * 복원은 콘텐츠(데이터)가 로드되어 스크롤 높이가 충분해질 때까지 재시도하고,
 * 저장 리스너는 복원이 끝난 뒤에 붙인다 — 로드 전 클램프된 scrollTop이
 * 저장값을 덮어써 원래 위치를 잃는 문제 방지.
 *
 * ⚠ 재시도는 rAF **와 타이머 양쪽**에 건다. 이유는 아래 `schedule` 주석에.
 */
/** 저장 키의 단일 소스 — 아래 훅과 clearScrollRestore가 공유한다 */
function scrollKey(pathname: string) {
  return `otb-scroll:${pathname}`;
}

/**
 * 저장된 스크롤 위치를 버린다 → 다음 진입에서 맨 위로 시작한다.
 *
 * 글 작성·삭제처럼 **목록 내용이 사용자 발밑에서 바뀐** 직후에 쓴다.
 * 그대로 복원하면 방금 올린 글이 화면 위쪽 밖에 있어 "등록됐다는데 안 보인다"가 된다
 * (핸드오프 3장의 "화면 전환 시 스크롤 최상단"이 겨냥한 상황이다).
 * 반대로 목록↔상세 왕복에서는 복원이 맞으므로 그쪽은 건드리지 않는다.
 */
export function clearScrollRestore(pathname: string) {
  try {
    sessionStorage.removeItem(scrollKey(pathname));
  } catch {
    // 저장 불가 환경 — 어차피 복원할 값이 없다
  }
}

export function useScrollRestore(ref: RefObject<HTMLElement | null>) {
  const pathname = usePathname();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 아래 함수 선언들은 호이스팅되어 TS가 el의 null 좁힘을 잃는다 — 좁혀진 값을 따로 잡는다
    const node = el;

    const key = scrollKey(pathname);
    /**
     * ⚠ sessionStorage 접근은 실패할 수 있다 — 사파리의 쿠키·사이트 데이터 차단이나
     *   일부 임베드 환경에서 접근 자체가 throw한다. effect에서 터지면 목록 화면이
     *   통째로 app/error.tsx로 떨어지므로, 스크롤 복원 실패는 조용히 넘긴다
     *   (기능이 아니라 편의다).
     */
    const readSaved = () => {
      try {
        return Number(sessionStorage.getItem(key) ?? 0);
      } catch {
        return 0;
      }
    };
    const writeSaved = (value: number) => {
      try {
        sessionStorage.setItem(key, String(value));
      } catch {
        // 저장 불가 환경 — 복원을 포기할 뿐 화면은 정상 동작한다
      }
    };

    const saved = readSaved();

    let disposed = false;
    let raf = 0;
    let retryTimer = 0;
    let saveRaf = 0;
    let ticking = false;
    const startedAt = performance.now();

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      // ⚠ 이 핸들을 따로 들고 있어야 cleanup에서 취소된다. 전에는 복원용 raf 변수만
      //   취소해서, 스크롤 직후 한 프레임 안에 화면을 떠나면 **detached 엘리먼트의
      //   scrollTop(0)이 저장되어** 뒤로가기 시 맨 위로 튀었다.
      saveRaf = requestAnimationFrame(() => {
        writeSaved(el.scrollTop);
        ticking = false;
      });
    };
    const attachSaver = () => {
      if (!disposed) el.addEventListener("scroll", onScroll, { passive: true });
    };

    /**
     * 다음 시도를 **rAF와 타이머 양쪽에** 건다 — 먼저 도착하는 쪽이 이긴다.
     *
     * ⚠ **rAF만 쓰면 백그라운드 탭에서 영영 돌지 않는다**(실측: `visibilityState:"hidden"`인
     *   탭에서 800ms 동안 0프레임). 그러면 복원이 안 되는 것으로 끝나지 않고
     *   **`attachSaver()`까지 실행되지 않아 그 탭에서는 스크롤 저장도 멈춘다.**
     *   1200ms 상한도 rAF 콜백 안에서 재는 값이라 함께 죽는다.
     *   `Sheet`가 `animationend`에 폴백 타이머를 함께 둔 것과 같은 이유다.
     */
    function schedule() {
      raf = requestAnimationFrame(tryRestore);
      retryTimer = window.setTimeout(tryRestore, 100);
    }
    function unschedule() {
      cancelAnimationFrame(raf);
      clearTimeout(retryTimer);
    }

    function tryRestore() {
      if (disposed) return;
      // 둘 중 하나가 도착했으므로 나머지 예약은 거둔다 — 같은 프레임에 두 번 돌지 않게
      unschedule();
      const canReach = node.scrollHeight - node.clientHeight >= saved - 2;
      const timedOut = performance.now() - startedAt > 1200;
      if (canReach || timedOut) {
        if (saved > 0) node.scrollTop = saved;
        attachSaver();
        return;
      }
      schedule();
    }

    if (saved > 0) {
      schedule();
    } else {
      // 공유 스크롤 컨테이너라 직전 탭의 오프셋이 남아 있을 수 있어 0으로 리셋
      el.scrollTop = 0;
      attachSaver();
    }

    return () => {
      disposed = true;
      unschedule();
      cancelAnimationFrame(saveRaf);
      el.removeEventListener("scroll", onScroll);
    };
  }, [pathname, ref]);
}
