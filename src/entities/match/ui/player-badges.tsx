import { ArrowDown, Volleyball } from "lucide-react";
import type { PlayerMarks } from "../lib/player-marks";

/**
 * 선수에게 붙는 표시 — 득점 · 자책골 · 카드 · 교체 아웃.
 *
 * ⚠ **피치와 후보 명단이 같은 컴포넌트를 쓴다.** 두 곳이 각자 그리면 같은 사실이 다른
 *   모양으로 나가고, 자책골처럼 드문 경우가 한쪽에서만 빠진다.
 *
 * ⚠ **카드에만 색을 쓴다.** 노랑·빨강은 규칙이 정한 것이라 색 자체가 콘텐츠이고
 *   ("강한 컬러는 콘텐츠로만 허용"), 다른 색으로 바꾸면 무슨 카드인지 알 수 없다.
 *   반대로 교체 화살표는 방향이 이미 뜻을 지고 있어 색을 더할 이유가 없다.
 *
 * ⚠⚠ **색만으로 가르지 않는다.** 한때 노랑/빨강 배지가 크기·모양까지 똑같고 배경색만
 *   달랐는데, `accent-yellow`(#ffdb13)는 흰 배경 대비가 **약 1.36:1** 로 규약이 에메랄드
 *   (1.99:1)에 금지한 것보다도 낮다 — 저시력 사용자에게 두 카드가 같은 밝은 사각형이다.
 *   `sr-only`는 낭독만 구하고 **보이는 화면에는 아무것도 하지 않는다.**
 *   → 퇴장에 **테두리와 기울기**를 줘 형태로도 갈린다.
 */
export function PlayerBadges({ marks }: { marks: PlayerMarks }) {
  return (
    <>
      {marks.goals > 0 ? (
        <Badge label={marks.goals > 1 ? `${marks.goals}골` : "득점"}>
          <Volleyball size={11} strokeWidth={2} aria-hidden />
        </Badge>
      ) : null}
      {/*
       * ⚠ **자책골은 득점과 모양이 달라야 한다 — 뜻이 반대다.** 한때 같은 공 아이콘에
       *   색만 달리해서, 주석은 "모양이 다르다"고 적어 두고 실제로는 색뿐이었다.
       *   글자를 담으면 색을 못 보는 사람도 구분되고 대비 문제도 함께 사라진다.
       */}
      {marks.ownGoals > 0 ? (
        <Badge label="자책골" tone="danger">
          <span className="font-mono text-[8px] font-bold leading-none">OG</span>
        </Badge>
      ) : null}
      {marks.card !== null ? (
        <span
          className={
            marks.card === "red"
              ? // 퇴장 — 테두리 + 기울기로 경고와 형태가 갈린다
                "h-[13px] w-[9px] rotate-12 rounded-[2px] border border-ink bg-crimson"
              : "h-[13px] w-[9px] rounded-[2px] border border-hairline-strong bg-accent-yellow"
          }
        >
          <span className="sr-only">{marks.card === "red" ? "퇴장" : "경고"}</span>
        </span>
      ) : null}
      {marks.outMinute !== null ? (
        <Badge label={`${marks.outMinute}분 교체`}>
          <ArrowDown size={11} strokeWidth={2.5} aria-hidden />
        </Badge>
      ) : null}
    </>
  );
}

/** 아이콘 하나를 담는 흰 원 — 피치·명단 어느 배경에서도 아이콘이 묻히지 않게 한다 */
function Badge({
  label,
  tone,
  children,
}: {
  label: string;
  tone?: "danger";
  children: React.ReactNode;
}) {
  return (
    <span
      className={
        tone === "danger"
          ? "flex size-[15px] items-center justify-center rounded-full border border-crimson bg-canvas text-crimson"
          : "flex size-[15px] items-center justify-center rounded-full border border-hairline-cool bg-canvas text-ink"
      }
    >
      {children}
      <span className="sr-only">{label}</span>
    </span>
  );
}
