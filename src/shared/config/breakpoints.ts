/**
 * 넓은 화면 배치(`lg`)가 서는 폭의 미디어 쿼리 — Tailwind `lg:`와 **단위까지** 같아야 한다.
 * ⚠ px로 두면 브라우저 글꼴 크기를 키운 사용자에게서 CSS(rem)와 갈려, 판이 CSS로 숨겨진 폭인데 클릭은 선택으로 가로채져 상세로 갈 길이 없어진다.
 */
export const LG_MEDIA_QUERY = "(min-width: 64rem)";
