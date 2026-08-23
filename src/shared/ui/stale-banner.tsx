"use client";

/**
 * 목적격 조사 — 받침이 있으면 `을`, 없으면 `를`.
 *
 * ⚠ 호출부가 "글", "서베이", "댓글"처럼 **명사만** 넘길 수 있게 하려고 둔다. 조사를 prop에
 *   섞으면(`noun="서베이를"`) 다음 화면이 "글를"이라고 적어도 아무도 못 잡는다.
 * ⚠ 이 파일 밖으로 내보내지 않는다 — 소비처가 하나뿐이라 공용화 기준(3회)에 못 미친다.
 *   한글 음절이 아니면(영문·숫자) 판정할 근거가 없으므로 `를`로 둔다.
 */
function objectParticle(noun: string): "을" | "를" {
  const last = noun.codePointAt(noun.length - 1) ?? 0;
  if (last < 0xac00 || last > 0xd7a3) return "를";
  // 한글 음절 = ((초성 * 21) + 중성) * 28 + 종성 → 나머지가 0이면 받침이 없다
  return (last - 0xac00) % 28 === 0 ? "를" : "을";
}

interface StaleBannerProps {
  /** 화면이 그리고 있는 것의 이름 — 조사 없이 명사만("글"·"서베이"·"댓글") */
  noun: string;
  onRetry: () => void;
}

/**
 * 리페치가 실패했지만 **보여줄 데이터는 있을 때** 목록 위에 얹는 배너.
 *
 * ⚠ 이 배너의 존재 이유가 규약이다(`data-and-state.md`) — TanStack Query는 성공 후 리페치가
 *   실패해도 `data`를 유지하므로, `error`를 데이터 렌더보다 먼저 보고 화면을 갈아치우면
 *   좋아요 한 번에 네트워크가 잠깐 끊겨도 **읽고 있던 목록이 통째로 사라진다.**
 *   전체 대체는 `error && !data`일 때뿐이다 → **호출부의 조건은 반드시 `error && data`다.**
 *
 * ⚠ 라이브 리전(`role="status"`)을 붙이지 않는다 — 알림 채널은 `ToastViewport` 하나가
 *   소유한다(`code-quality.md`). 게다가 리전과 내용이 같은 순간에 마운트되면 발화가
 *   불안정하다. 이건 뮤테이션 실패가 아니라 조회 실패의 지속 표시다.
 */
export function StaleBanner({ noun, onRetry }: StaleBannerProps) {
  return (
    <p className="px-5 py-3 text-center text-[12px] text-ink-mute-2">
      최신 {noun}
      {objectParticle(noun)} 불러오지 못했어요.{" "}
      <button type="button" onClick={onRetry} className="underline underline-offset-2">
        다시 시도
      </button>
    </p>
  );
}
