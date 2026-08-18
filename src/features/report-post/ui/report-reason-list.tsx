"use client";

import { useEffect, useRef } from "react";
import { useDuplicateGuard } from "@/shared/lib";
import { SheetItem } from "@/shared/ui";
import { REPORT_REASON_LABEL, REPORT_REASONS } from "../model/report-reason";
import { useReportPost } from "../model/use-report-post";

interface ReportReasonListProps {
  postId: number;
  /** 접수됐거나 사용자가 그만두었을 때 — 호출부가 시트를 닫는다 */
  onDone: () => void;
}

/**
 * 신고 사유 목록 — **오버레이를 스스로 만들지 않는다.** 글 상세의 오버플로 시트가
 * 자기 children만 이 목록으로 바꿔 끼운다.
 *
 * ⚠ **시트 위에 시트를 겹치지 않는 이유가 그것이다.** 겹치면 `useFocusTrap`이 이중이 되어
 *   Escape 리스너와 Tab 가둠이 둘이 되고, `aria-modal` 노드도 둘이 되며 스크림이 두 겹으로
 *   어두워진다. "삭제하기 → Dialog"가 되는 건 **먼저 닫고 나서 열기 때문**인데
 *   (`inert={closing}`이 140ms 겹침을 덮는다), 시트→시트는 그 140ms 동안 한 장이 내려가고
 *   다른 장이 올라오며 교차한다.
 *
 * ⚠ `role="radiogroup"`을 붙이지 않는다 — 그 롤은 화살표 키 이동(roving tabindex)을
 *   약속하는데 구현이 없다(code-quality.md "롤은 키보드 모델을 약속한다").
 *
 * ⚠ 항목에 `danger`를 쓰지 않는다. `danger`는 파괴적 액션의 crimson인데 사유 다섯 개를
 *   전부 붉게 칠하면 "한 뷰포트당 컬러 이벤트 1개"가 깨진다 — 파괴성은 이 목록을 여는
 *   `신고하기` 항목이 이미 표시했다.
 */
export function ReportReasonList({ postId, onDone }: ReportReasonListProps) {
  const report = useReportPost(postId);
  // ⚠ 행이 쌓이는 뮤테이션이라 가드가 필수다(data-and-state.md가 "신고하기"를 이름으로 지목한다).
  //   `disabled={isPending}`는 렌더 이후에야 반영되어 같은 tick의 두 번째 탭을 막지 못한다.
  const guard = useDuplicateGuard(report);

  /**
   * ⚠ **단계가 바뀌면 포커스가 `<body>`로 떨어진다.** 시트는 열린 채 children만 갈리는데,
   *   포커스를 쥐고 있던 `신고하기` 버튼이 언마운트되기 때문이다(실측: `activeElement === body`).
   *   `useFocusTrap`의 effect는 `open`이 계속 true라 다시 돌지 않는다.
   *
   *   Tab은 트랩을 벗어나지 않는다 — 브라우저가 제거된 요소의 자리에서 순회를 이어가 다시
   *   시트 안으로 들어오고(실측), Shift+Tab도 트랩이 되잡는다. 그래서 **가둠은 깨지지 않는다.**
   *   문제는 그 사이 화면이 바뀐 사실이 스크린리더에 전달되지 않는다는 것뿐이라,
   *   첫 항목으로 포커스를 옮겨 목록이 낭독되게 한다.
   *
   * ⚠ `preventScroll` — 시트는 이미 화면 안이지만 오버레이 안 포커스 이동은 전부 이 규약을
   *   따른다(430px 프레임이 밀리면 되돌릴 수 없다 — `useFocusTrap` 주석).
   */
  const firstRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    firstRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <>
      <p className="px-5 pb-1 pt-2 text-[13px] leading-[1.6] text-ink-mute">
        사유를 고르면 바로 접수돼요. 접수 사실은 상대에게 알리지 않습니다.
      </p>
      {REPORT_REASONS.map((reason, index) => (
        <SheetItem
          key={reason}
          ref={index === 0 ? firstRef : undefined}
          disabled={report.isPending}
          onClick={() => {
            if (guard.isLocked()) return;
            guard.lock();
            // 성공·실패 문구는 훅이 토스트로 보낸다(시트가 닫혀도 도착해야 한다) —
            // 여기서는 시트만 닫는다. 실패해도 닫는 이유: 중복 신고가 대표적이라
            // 목록을 열어 둬 봐야 다시 누를 수 있는 항목이 없다.
            report.mutate(reason, { onSuccess: onDone, onError: onDone });
          }}
        >
          {REPORT_REASON_LABEL[reason]}
        </SheetItem>
      ))}
    </>
  );
}
