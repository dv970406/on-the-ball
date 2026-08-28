"use client";

import { type SurveyListItem } from "@/entities/survey";
import { SurveyVote } from "@/features/cast-survey-vote";

/**
 * 목록의 **진행 중** 입축구 한 건 — 카드에서 바로 투표한다.
 *
 * ⚠ **상세로 보내는 버튼을 두지 않는다.** 면을 직접 탭해 투표하고, 참여했으면 결과 바가
 *   그 자리에 뜨므로 "한 표 던지기 / 결과" 버튼이 갈 곳을 잃었다.
 * ⚠ 그리는 일은 전부 `SurveyVote`가 한다 — **상세와 같은 컴포넌트**라 세션 3분기·마감 판정·
 *   결과 게이팅이 두 화면에서 갈릴 수 없다.
 * ⚠ 제목은 구역 헤딩(h2) 아래 계층이라 h3다.
 */
interface SurveyOpenItemProps {
  survey: SurveyListItem;
  onSignInRequired: () => void;
  /** 서버가 본 로그인 사용자 — 집계 쿼리 키가 userId로 스코프된다(`SurveyVote` 주석) */
  initialUserId?: string;
  /** 서버가 렌더한 시점의 시각 — 마감 판정이 여기 걸려 있다(〃) */
  serverNowMs?: number;
}

export function SurveyOpenItem({
  survey,
  onSignInRequired,
  initialUserId,
  serverNowMs,
}: SurveyOpenItemProps) {
  return (
    // ⚠ `<li><article>`이다 — 마감 목록도 `<ul>`이라 한 화면에서 두 목록의 처리가 갈리면
    //   안 되고, 이 항목은 링크로 감싼 행이 아니라 **제목 + 그 자리의 컨트롤을 가진
    //   독립 콘텐츠**라 `article`이 맞다(`CommentItem`이 같은 판단으로 같은 형태다).
    <li>
      <article className="border-b border-hairline-cool px-5 pb-6 pt-4">
        <h3 className="text-[19px] font-semibold leading-[1.3] tracking-[-0.4px] text-ink">
          {survey.title}
        </h3>
        <SurveyVote
          survey={survey}
          onSignInRequired={onSignInRequired}
          initialUserId={initialUserId}
          serverNowMs={serverNowMs}
        />
      </article>
    </li>
  );
}
