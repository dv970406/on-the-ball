"use client";

import { CircleHelp } from "lucide-react";
import { CredibilityMark, DealFormMark, StatusBadge } from "@/entities/transfer";
import { cn } from "@/shared/lib";
import { Icon, Sheet } from "@/shared/ui";

/**
 * 상태 뱃지 범례 — 위에서 아래로 진전 순서다. 뱃지는 목록이 그리는 것과 같은 컴포넌트라 모양이 어긋나지 않는다.
 * ⚠ 단계 하나가 뱃지 하나는 아니다 — 합의 임박은 메디컬·개인 조건·합의를 한 톤으로 접은 것이다(`STAGE_STATUS`).
 *   그래서 단계(`stage`)는 그 톤을 대표하는 값 하나만 든다.
 */
const STAGE_GUIDE = [
  { stage: "rumour", text: "구단이 관심을 보인다는 수준의 이적설이에요. 협상이 시작됐다는 뜻은 아니에요." },
  { stage: "talks", text: "구단 사이에 제안이 오가거나 협상이 진행 중이에요." },
  { stage: "medical", text: "개인 조건 합의, 메디컬 테스트, 구단 간 합의 중 하나까지 왔어요." },
  { stage: "here_we_go", text: "합의가 끝난 것으로 전해진 단계예요. 아직 공식 발표 전이에요." },
  { stage: "official", text: "구단이나 선수가 공식으로 발표했어요." },
  { stage: "collapsed", text: "협상까지 갔지만 깨졌다고 전해졌어요." },
  { stage: "denied", text: "루머 단계에서 사실이 아니라고 전해졌어요." },
] as const;

/**
 * 형태 표지 범례 — 표지는 목록이 그리는 것과 같은 컴포넌트(`DealFormMark`)라 모양이 어긋나지 않는다. 형태·조항만 넘긴다.
 * 완전 이적은 표지가 없어 범례에 넣지 않는다(마지막 줄의 글이 그것을 말한다).
 */
const FORM_GUIDE = [
  { form: "loan", loanClause: null, text: "소유권은 그대로 두고 다른 구단에서 뛰는 이적이에요." },
  { form: "loan", loanClause: "obligation", text: "조건이 맞으면 임대 구단이 완전히 사야 하는 임대예요. 옆의 금액은 그때의 금액이에요." },
  { form: "loan", loanClause: "option", text: "임대 구단이 원하면 완전히 살 수 있는 임대예요." },
  { form: "loan_convert", loanClause: null, text: "지금 임대로 뛰는 구단이 그 선수를 완전히 영입하려는 움직임이에요." },
] as const;

/** 달 5단계 — 차오를수록 믿을 만하다(낮은 쪽부터 읽는다) */
const MOON_LEVELS = [1, 2, 3, 4, 5] as const;

interface GuideButtonProps {
  onClick: () => void;
  className?: string;
}

/**
 * "읽는 법" 진입점 — 헤더 옆의 작은 텍스트 버튼이다. 첫 방문에 시트를 자동으로 띄우지 않는다(보드는 SSR 첫 화면이라
 * 덮개가 첫 화면을 가리고, 묻지 않은 안내는 닫기부터 누르게 한다) — 궁금한 사람이 누르는 자리에 둔다.
 */
export function GuideButton({ onClick, className }: GuideButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("hit-area inline-flex items-center gap-1 text-[12px] text-ink-mute", className)}
    >
      <Icon as={CircleHelp} size={14} aria-hidden />
      읽는 법
    </button>
  );
}

interface GuideSheetProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 이적 소식 읽는 법 — 상태 뱃지(단계) · 형태 표지(임대) · 출처 공신력(🎖️·달)이 무슨 뜻인지 한 장으로 설명하는 시트.
 *
 * ⚠ 텍스트와 잉크 그레이뿐이다 — 새 색·알약·그림자를 만들지 않는다. 뱃지·공신력 표시는 목록과 같은 컴포넌트를 그대로 쓴다.
 * ⚠ 시트 안에 시트·다이얼로그를 겹치지 않는다(`useFocusTrap`이 이중이 된다) — 읽기만 하는 한 장이다.
 * ⚠ `TabScrollArea` 밖에 렌더한다(`Sheet`가 `absolute`다 — `LeagueSheet`와 같은 자리).
 */
export function GuideSheet({ open, onClose }: GuideSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} label="이적 소식 읽는 법">
      <div className="px-5 pb-4">
        <h2 className="text-[17px] font-medium tracking-[-0.3px] text-ink">이적 소식, 이렇게 읽어요</h2>
        <p className="mt-1.5 text-[13px] leading-[1.5] text-ink-mute">
          여러 기자와 매체의 보도를 모아 딜마다 단계를 정해요. 오피셜 말고는 모두 보도를 기준으로 한 것이라 바뀔 수 있어요.
        </p>

        <h3 className="mt-5 text-[13px] font-medium text-ink">단계</h3>
        <ul className="mt-2.5 flex flex-col gap-3">
          {STAGE_GUIDE.map(({ stage, text }) => (
            <li key={stage} className="flex items-start gap-3">
              {/* 뱃지 폭이 제각각이라 칸을 고정한다 — 설명 글이 한 줄로 정렬된다 */}
              <span className="flex w-[72px] shrink-0 justify-start pt-px">
                <StatusBadge stage={stage} />
              </span>
              <p className="min-w-0 flex-1 text-[13px] leading-[1.5] text-ink-secondary">{text}</p>
            </li>
          ))}
        </ul>

        <h3 className="mt-5 text-[13px] font-medium text-ink">형태</h3>
        <ul className="mt-2.5 flex flex-col gap-3">
          {FORM_GUIDE.map(({ form, loanClause, text }) => (
            <li key={`${form}-${loanClause ?? ""}`} className="flex items-start gap-3">
              <span className="flex w-[72px] shrink-0 justify-start pt-px">
                <DealFormMark deal={{ form, loanClause }} />
              </span>
              <p className="min-w-0 flex-1 text-[13px] leading-[1.5] text-ink-secondary">{text}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[13px] leading-[1.5] text-ink-mute">
          표지가 없는 딜은 임대로 보도되지 않은 딜이에요. 경로는 선수를 보유한 구단에서 출발하고, 다른 구단에 임대 중이면 출발 아래에 ‘○○ 임대 중’으로 적어요.
        </p>

        <h3 className="mt-5 text-[13px] font-medium text-ink">출처 공신력</h3>
        <ul className="mt-2.5 flex flex-col gap-3">
          <li className="flex items-start gap-3">
            <span className="flex w-[72px] shrink-0 justify-start">
              <CredibilityMark value={{ kind: "medal" }} />
            </span>
            <p className="min-w-0 flex-1 text-[13px] leading-[1.5] text-ink-secondary">
              오피셜에 가까울 만큼 믿을 만한 매체예요.
            </p>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex w-[72px] shrink-0 items-center justify-start">
              {/* 낮은 쪽부터 — 달이 차오르는 방향으로 읽힌다 */}
              {MOON_LEVELS.map((level) => (
                <CredibilityMark key={level} value={{ kind: "moon", level }} />
              ))}
            </span>
            <p className="min-w-0 flex-1 text-[13px] leading-[1.5] text-ink-secondary">
              달이 찰수록 믿을 만한 기자·매체예요. 표시가 없으면 아직 평가하지 않은 출처예요.
            </p>
          </li>
        </ul>
      </div>
    </Sheet>
  );
}
