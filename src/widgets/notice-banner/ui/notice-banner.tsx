"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { type NoticeListItem, useBannerNoticeQuery } from "@/entities/notice";
import { ROUTES } from "@/shared/config";
import { Icon, Pill } from "@/shared/ui";

interface NoticeBannerProps {
  /**
   * 서버 프리페치 결과.
   * ⚠ **`null`과 `undefined`가 다른 뜻이다** — `null`은 "필독 공지가 없다"(조회 끝),
   *   `undefined`는 "프리페치를 안 했다"이다. 하나로 접으면 공지가 없는 상태에서 목록을
   *   열 때마다 조회가 한 번씩 더 나간다(글 상세의 투표와 같은 규약).
   */
  initialNotice?: NoticeListItem | null;
}

/**
 * 피드 최상단의 한 줄 공지 배너 — 가장 최신 **필독** 공지.
 *
 * ⚠ **에메랄드를 쓰지 않는다.** 이 화면의 "눌러야 할 곳"은 이미 글쓰기 FAB이고,
 *   목록 화면의 에메랄드 자리는 워드마크의 볼과 카드의 좋아요 하트뿐이다(`styling.md`).
 *   배지는 잉크(`Pill variant="dark"`)로 무게만 준다.
 * ⚠ 없으면 **아무것도 그리지 않는다.** 자리를 비워 두면 첫 화면의 가장 값진 세로 공간을
 *   빈 띠가 먹는다 — 서버가 이미 판정해 내려주므로 나중에 튀어나오지도 않는다.
 * ⚠ 조회 실패도 조용히 넘긴다(`error`를 그리지 않는다). 이 배너는 화면의 본문이 아니라
 *   덧붙는 안내라, 실패를 알리면 정작 읽으러 온 글 목록 위에 에러 박스가 얹힌다.
 * ⚠⚠ **이것이 공지로 가는 유일한 진입점이다** — 목록(`/notices`)으로는 상세 안의 "목록"
 *   버튼이 그다음 홉이다. 그래서 필독이 없는 동안에는 `'공지'` 타입 글도 함께 도달
 *   불가가 되는데, **수용한 결정이라 여기에 폴백(최신 공지로 떨어뜨리기)을 넣지 않는다.**
 *   이 자리를 없애려면 대체 진입점을 먼저 만든다(`reuse.md`).
 */
export function NoticeBanner({ initialNotice }: NoticeBannerProps) {
  const { data } = useBannerNoticeQuery(initialNotice);
  if (!data) return null;

  return (
    <Link
      href={ROUTES.notice(data.id)}
      className="flex items-center gap-2 border-b border-hairline-cool px-5 py-2.5 transition-colors duration-150 ease-otb active:bg-canvas-soft"
    >
      {/* ⚠ variant는 리터럴이어야 한다 — 동적 값은 `check:conventions`가 금지한다 */}
      <Pill variant="dark">필독</Pill>
      <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{data.title}</span>
      <Icon as={ChevronRight} size={16} className="shrink-0 text-ink-mute-2" />
    </Link>
  );
}
