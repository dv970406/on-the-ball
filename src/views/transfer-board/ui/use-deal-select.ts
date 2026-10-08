"use client";

import { useEffect, useRef, type MouseEvent, type RefObject } from "react";

/**
 * 목록·상세 2분할이 서는 폭 — 이 폭부터 딜 링크의 일반 클릭이 이동이 아니라 선택이다.
 * ⚠ **rem이다** — CSS의 `lg:`(64rem)와 같은 단위여야 한다. px로 두면 브라우저 글꼴 크기를 키운 사용자에게서 둘이 갈려,
 *   판이 CSS로 숨겨진 폭인데 클릭은 선택으로 가로채져 상세로 갈 길이 없어진다.
 */
export const SPLIT_QUERY = "(min-width: 64rem)";

/** 딜 링크의 표지 — `DealRow`·`DealMiniCard`·`RumorCard`·왼쪽 레일의 관심 딜이 링크에 단다 */
const DEAL_LINK = "a[data-deal-id]";
/** 열린 모달 — `Dialog`·`Sheet`가 열려 있는 동안만 이 노드가 있다(닫히면 언마운트된다) */
const OPEN_MODAL = '[aria-modal="true"]';

interface UseDealSelectArgs {
  /** 2분할이 실제로 서 있는가 — 아니면 키보드 이동을 듣지 않는다 */
  enabled: boolean;
  /** 지금 판에 열린 딜 */
  selectedId: number | null;
  /**
   * J/K가 훑는 목록(보드의 구간 영역) — 그 안의 **보이는** 딜 링크만 차례로 고른다(접힌 행·md+에서 숨긴 미니 카드는 건너뛴다).
   * 키도 **포커스가 이 안에 있을 때만** 듣는다(아래).
   */
  listRef: RefObject<HTMLElement | null>;
  /** 주소의 `?deal=`(해석된 값) — 첫 로드에 그 행을 화면에 들일지 정한다 */
  requestedId: number | null;
  onSelect: (id: number) => void;
}

/**
 * 첫 로드의 행 들이기를 이 문서에서 이미 했는가 — **문서당 한 번**이다(모듈 스코프). 화면 안 이동으로 보드가 다시
 * 마운트될 때(상세 왕복·탭 이동)는 스크롤 복원(`useScrollRestore`)이 자리를 정한다 — 둘이 다투지 않게 한다.
 */
let initialRowScrolled = false;

const dealIdOf = (el: HTMLElement) => Number(el.dataset.dealId);
const isShown = (el: Element) => el.getClientRects().length > 0;

/**
 * 키 한 번이 고를 링크. 목록 순서(DOM 순서)로 판정한다.
 * - 고른 딜이 보이는 행이면 그 앞·뒤의 보이는 행.
 * - 고른 딜이 목록에 있지만 접혀 있으면(더 보기 전의 루머) 그 자리에서 가장 가까운 보이는 행 — J는 뒤, K는 앞.
 * - 고른 딜이 목록에 없으면(레일에서 연 관심 딜·필터로 가려진 딜) **지금 화면에 보이는 행부터** — J는 화면의 첫 행, K는
 *   화면의 마지막 행. 목록 끝(맨 위·맨 아래)으로 보내면 읽던 자리에서 스크롤이 통째로 튄다.
 */
function pickNext(all: HTMLAnchorElement[], selectedId: number | null, step: 1 | -1, viewport: DOMRect) {
  const shown = all.filter(isShown);
  if (shown.length === 0) return null;
  const isSelected = (el: HTMLAnchorElement) => dealIdOf(el) === selectedId;
  // 같은 딜이 두 벌일 수 있다(md+에서 가린 미니 카드 + 표 행) — 보이는 쪽의 자리를 기준으로 삼는다
  let at = all.findIndex((el) => isSelected(el) && isShown(el));
  if (at === -1) at = all.findIndex(isSelected);
  if (at !== -1) {
    const sequence = step === 1 ? all.slice(at + 1) : all.slice(0, at).reverse();
    const found = sequence.find((el) => isShown(el) && !isSelected(el));
    if (found) return found;
    // 끝에 닿으면 제자리(고른 행이 보이면) — 목록을 돌아 반대편 끝으로 가지 않는다
    return isShown(all[at]) ? all[at] : shown[step === 1 ? shown.length - 1 : 0];
  }
  const inView = shown.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > viewport.top && r.top < viewport.bottom;
  });
  const pool = inView.length > 0 ? inView : shown;
  return step === 1 ? pool[0] : pool[pool.length - 1];
}

/**
 * 딜 링크를 **목록·상세 2분할의 선택**으로 바꾸는 DOM 메커니즘 — 도메인을 모르고 `data-deal-id`만 본다.
 *
 * - 클릭: 링크는 상세 주소(`href`)를 가진 앵커로 남고, lg+에서 **일반 클릭일 때만** 가로채 선택한다. 수정 키·가운데 버튼
 *   (새 탭)은 그대로 통과하고, 모바일에서는 그대로 상세로 이동한다.
 *   ⚠ 폭 판정은 **클릭 순간에** `matchMedia`로 읽는다 — 렌더 때의 값은 창 크기를 바꾼 뒤 낡는다.
 *   ⚠ **캡처 단계**에서 막는다 — Next `<Link>`는 자기 `onClick`에서 이동하는데 `defaultPrevented`면 물러난다.
 *     버블 단계에서는 이미 이동이 시작된 뒤다.
 * - 키보드: **J(다음)·K(이전)만**이다. ↑·↓는 페이지 스크롤 키라 가로채지 않는다.
 *   ⚠ **포커스가 목록 안에 있을 때만 듣는다**(리스너가 `window`가 아니라 목록 요소에 붙는다) — 수정 키 없는 글자 단축키는
 *     켜진 범위를 좁혀야 한다(WCAG 2.1.4). 판·레일·문서 본문(`body`)에 포커스가 있을 때 J가 목록 선택을 바꾸면 판에서 읽던 사람의
 *     화면이 바뀐다. 행을 누르면 포커스가 그 행 링크에 놓여(아래 클릭 처리) 거기서부터 J/K가 이어진다.
 *   ⚠ 판정은 `e.code`(`KeyJ`·`KeyK` — 자판의 자리)다. `e.key`는 한글 입력 상태에서 "ㅓ"·"ㅏ"라 듣지 못한다.
 *   ⚠ 듣지 않는 때: 입력칸·편집 영역에 포커스가 있다 · 수정 키 · 조합 중(`isComposing`) · 다른 처리기가 이미 막았다
 *     (`defaultPrevented`) · **모달이 열려 있다**(`aria-modal` — 시트·로그인 안내 뒤의 선택이 바뀌면 안 된다).
 *   ⚠ 옮긴 뒤 그 행의 링크로 **포커스를 옮긴다**(`preventScroll` — 스크롤은 `nearest`로 따로 한다). 포커스가 옛 행에 남으면
 *     Enter가 옛 행을 다시 고른다.
 */
export function useDealSelect({ enabled, selectedId, listRef, requestedId, onSelect }: UseDealSelectArgs) {
  const handleClickCapture = (e: MouseEvent<HTMLElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!(e.target instanceof Element)) return;
    const link = e.target.closest<HTMLAnchorElement>(DEAL_LINK);
    if (!link || !e.currentTarget.contains(link)) return;
    if (!window.matchMedia(SPLIT_QUERY).matches) return;
    const id = dealIdOf(link);
    if (!Number.isSafeInteger(id)) return;
    e.preventDefault();
    // ⚠ 포커스를 직접 준다 — 사파리(WebKit)는 마우스 클릭으로 링크에 포커스를 주지 않아, 행을 눌러도 J/K가 들리지 않는다
    //   (키는 목록 안 포커스에서만 듣는다). 스크롤은 건드리지 않는다
    link.focus({ preventScroll: true });
    onSelect(id);
  };

  useEffect(() => {
    const list = listRef.current;
    if (!enabled || !list) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.repeat) return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const step = e.code === "KeyJ" ? 1 : e.code === "KeyK" ? -1 : 0;
      if (step === 0) return;
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) ||
          target.closest('[role="dialog"],[role="alertdialog"]') !== null)
      )
        return;
      if (document.querySelector(OPEN_MODAL)) return;
      // 화면에 보이는 범위 — 목록을 담은 스크롤 영역(`TabScrollArea`의 main)
      const viewport = (list.closest("main") ?? document.documentElement).getBoundingClientRect();
      const next = pickNext([...list.querySelectorAll<HTMLAnchorElement>(DEAL_LINK)], selectedId, step, viewport);
      if (!next) return;
      e.preventDefault();
      next.scrollIntoView({ block: "nearest" });
      next.focus({ preventScroll: true });
      const id = dealIdOf(next);
      if (id !== selectedId) onSelect(id);
    };
    list.addEventListener("keydown", handleKey);
    return () => list.removeEventListener("keydown", handleKey);
  }, [enabled, selectedId, listRef, onSelect]);

  /**
   * 첫 로드에 주소의 딜(`?deal=`) 행이 화면 밖이면 그 행을 화면 가운데로 들인다 — 공유 링크로 들어온 사람이 판에 열린 딜이
   * 목록의 어디인지 찾지 않게. 2분할이 처음 선 순간 한 번만 본다(그 뒤 고르는 것은 사용자가 화면에서 하는 일이다).
   * ⚠ 건드리지 않는 때: 문서의 뒤로가기·앞으로가기(`back_forward` — 복원된 자리가 있다) · 이미 스크롤된 화면(스크롤 복원·
   *   사용자) · 그 사이 사용자가 휠·터치·키로 움직였다 · 행이 접혀 있거나 이미 보인다.
   * ⚠ `scrollIntoView`가 아니라 스크롤 영역(`main`)의 `scrollTo`다 — `scrollIntoView`는 조상 전부를 스크롤해 `overflow-hidden`인
   *   앱 프레임까지 밀 수 있다(`styling.md`의 포커스 진입 사고와 같은 함정). 위쪽 sticky 바(모바일 앱바)의 높이를 뺀다.
   * ⚠ 두 프레임 뒤에 잰다 — 스크롤 복원이 첫 프레임에 자리를 잡고, 그 결과(`scrollTop > 0`)를 보고 물러난다.
   */
  const initialCheckedRef = useRef(false);
  useEffect(() => {
    if (initialCheckedRef.current || !enabled) return;
    const list = listRef.current;
    const main = list?.closest("main");
    if (!list || !main) return;
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (initialRowScrolled || requestedId === null || nav?.type === "back_forward") {
      initialCheckedRef.current = true;
      return;
    }
    let moved = false;
    const onUserMove = () => {
      moved = true;
    };
    const events = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
    events.forEach((type) => main.addEventListener(type, onUserMove, { passive: true }));
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        initialCheckedRef.current = true;
        initialRowScrolled = true;
        if (moved || main.scrollTop > 0) return;
        const row = [...list.querySelectorAll<HTMLAnchorElement>(`a[data-deal-id="${requestedId}"]`)].find(isShown);
        if (!row) return;
        const bar = main.querySelector<HTMLElement>(":scope > header")?.offsetHeight ?? 0;
        const view = main.getBoundingClientRect();
        const rect = row.getBoundingClientRect();
        if (rect.top >= view.top + bar && rect.bottom <= view.bottom) return;
        const visible = view.height - bar;
        main.scrollTo({ top: main.scrollTop + rect.top - view.top - bar - (visible - rect.height) / 2 });
      });
    });
    return () => {
      cancelAnimationFrame(raf);
      events.forEach((type) => main.removeEventListener(type, onUserMove));
    };
  }, [enabled, listRef, requestedId]);

  return handleClickCapture;
}
