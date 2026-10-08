// 넓은 화면의 이적 보드가 고른 딜을 오른쪽에 펼치는 판. "use client"지만 보드가 SSR부터 늘 렌더한다(좁은 화면은 CSS로 숨김) —
// 조회는 `active`가 참일 때만 연다.
// props 모양(`DealPanelProps`)은 `ui/deal-panel.tsx`에 있다 — 소비자가 타입을 따로 쓰게 되면 그때 여기 올린다.
export { DealPanel } from "./ui/deal-panel";
