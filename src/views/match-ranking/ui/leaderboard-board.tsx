import Link from "next/link";
import { LEADERBOARD_LIMIT, type LeaderboardEntry } from "@/entities/match";
import { ROUTES, avatarUrl, signInWithNext } from "@/shared/config";
import { cn, formatCount } from "@/shared/lib";
import { Avatar } from "@/shared/ui";

type SessionStatus = "loading" | "authenticated" | "guest";

interface LeaderboardBoardProps {
  entries: LeaderboardEntry[];
  /** "내 순위" 줄이 비로그인과 미참여를 가른다 */
  sessionStatus: SessionStatus;
  /** 빈 판·"내 순위" 줄이 무엇이 비었는지 말할 때 쓴다 — "2026-27 시즌"·"12라운드" */
  scopeLabel: string;
}

/** 적중률(%) — **표시용**이다. 순위 기준이 아니다(그 사유는 마이그레이션 머리말) */
function accuracyPercent(entry: Pick<LeaderboardEntry, "hits" | "total">) {
  return Math.round((entry.hits / entry.total) * 100);
}

/**
 * 순위판 한 장 — 내 순위 요약 + 상위 목록(+ 상한 밖의 내 행).
 *
 * ⚠ **순위·정렬을 다시 매기지 않는다.** 받은 순서 그대로 그린다 — 공동 순위와 동률 정렬은
 *   `match_leaderboard`가 단독으로 소유한다.
 * ⚠ **에메랄드를 쓰지 않는다.** 이 화면은 CTA가 없고, 1등을 칠하면 행마다 "눌러야 할 곳"처럼
 *   읽힌다(`styling.md`의 자리 표에 없다). 내 행은 면(`bg-canvas-soft`)과 "나" 배지로 가른다.
 */
export function LeaderboardBoard({ entries, sessionStatus, scopeLabel }: LeaderboardBoardProps) {
  /**
   * ⚠ **상한 밖의 내 행은 RPC가 맨 끝에 붙여 준다.** 그래서 길이가 상한을 넘으면 마지막 행이
   *   곧 그 행이다 — `isMe`까지 함께 확인하는 것은 그 계약이 깨졌을 때 남의 행을 "⋯" 뒤로
   *   떼어 그리지 않기 위해서다.
   */
  const last = entries.at(-1);
  const mineOutside = entries.length > LEADERBOARD_LIMIT && last?.isMe ? last : null;
  const top = mineOutside ? entries.slice(0, -1) : entries;
  const me = entries.find((entry) => entry.isMe) ?? null;

  return (
    <>
      <MyRank me={me} sessionStatus={sessionStatus} scopeLabel={scopeLabel} />

      {entries.length === 0 ? (
        <p className="px-5 pb-2 pt-8 text-center text-[13px] text-ink-mute-2">
          {scopeLabel}에 채점된 예측이 아직 없어요.
        </p>
      ) : (
        /*
          ⚠ **상한 밖의 내 행도 같은 `<ol>` 안에 둔다.** 목록을 둘로 쪼개면 스크린리더가 그 행을
            "항목 1개짜리 목록"으로 읽어 순위판의 일부라는 것이 사라진다.
        */
        <ol>
          {top.map((entry) => (
            <LeaderboardRow key={entry.userId} entry={entry} />
          ))}
          {mineOutside && (
            <>
              {/* 순위가 끊겼다는 표시 — 뜻은 아래 행의 순위 숫자가 말하므로 읽히지 않게 한다 */}
              <li aria-hidden className="py-1 text-center text-[13px] leading-none text-ink-mute-2">
                ⋯
              </li>
              <LeaderboardRow entry={mineOutside} />
            </>
          )}
        </ol>
      )}

      {/*
        ⚠ 판정은 응답 길이만으로 한다(목록 화면들과 같은 규약) — 조용히 자르지 않고 알린다.
        ⚠ 참여자가 정확히 상한만큼이어도 뜬다 — 전체 수를 따로 세지 않는 대가이고, 거짓은 아니다.
      */}
      {/*
        ⚠ 상한 밖의 내 행이 붙었으면 **그 사실까지** 말한다 — 이 문구는 목록 끝(내 행 아래)에
          오므로 "상위 50명까지"만 적으면 바로 위의 58위와 말이 어긋난다.
      */}
      {top.length >= LEADERBOARD_LIMIT && (
        <p className="px-5 pb-1 pt-3 text-center text-[12px] text-ink-mute-2">
          상위 {formatCount(LEADERBOARD_LIMIT)}명{mineOutside ? "과 내 순위를" : "까지"} 표시하고
          있어요.
        </p>
      )}
    </>
  );
}

/**
 * 내 순위 요약 — 순위판 머리에 한 줄.
 *
 * ⚠ **높이를 세 상태에서 같게 둔다.** 세션 복원이 끝나기 전(서버 렌더 포함)에는 문구를 모르므로
 *   같은 높이의 빈 줄을 그린다 — 복원 후에 줄이 새로 생기면 목록 전체가 한 줄만큼 밀린다.
 * ⚠ 내 행이 있으면 **세션 상태를 기다리지 않는다.** 그 행은 서버가 쿠키로 본 사용자 기준으로
 *   이미 와 있어서(`isMe`) 첫 프레임부터 그릴 수 있다.
 */
function MyRank({
  me,
  sessionStatus,
  scopeLabel,
}: {
  me: LeaderboardEntry | null;
  sessionStatus: SessionStatus;
  scopeLabel: string;
}) {
  return (
    <div className="flex min-h-12 items-center border-b border-hairline-cool bg-canvas-soft px-5 py-3 text-[13px] text-ink-mute">
      {me ? (
        <p>
          내 순위{" "}
          <span className="font-mono font-semibold tabular-nums text-ink">
            {formatCount(me.rank)}위
          </span>{" "}
          {/*
            ⚠ 어순을 경기 목록의 적중률 띠("통산 적중률 33% (2/6)")와 맞춘다. 다만 **범위가 다르다** —
              띠는 통산이고 여기는 이 판(시즌·라운드)이라 시즌이 바뀌면 숫자가 갈린다. 세는 경기의
              **판정**(채점 + 킥오프 경과 + 삭제 제외)만 같다.
          */}
          <span className="text-ink-mute-2">
            · 적중률 {accuracyPercent(me)}% ({formatCount(me.hits)}/{formatCount(me.total)})
          </span>
        </p>
      ) : sessionStatus === "authenticated" ? (
        /*
          ⚠ **범위를 말한다.** 라운드 판에 내 행이 없다는 것은 "그 라운드를 건너뛰었다"일 뿐인데,
            범위 없이 "채점된 내 예측이 없어요"라고 하면 시즌 판에서 순위가 있는 사람에게 같은
            화면이 서로 반대되는 말을 한다.
        */
        <p>
          {scopeLabel}에 채점된 내 예측이 아직 없어요.{" "}
          <Link href={ROUTES.matchList} className="font-medium text-ink underline underline-offset-2">
            예측하러 가기
          </Link>
        </p>
      ) : sessionStatus === "guest" ? (
        <p>
          {/* ⚠ 라벨이 "로그인"이라 `SignInDialog`를 거치지 않고 곧바로 보낸다(`reuse.md`) */}
          <Link
            href={signInWithNext(ROUTES.matchRanking)}
            className="font-medium text-ink underline underline-offset-2"
          >
            로그인
          </Link>
          하고 예측하면 내 순위를 볼 수 있어요.
        </p>
      ) : null}
    </div>
  );
}

function LeaderboardRow({ entry }: { entry: LeaderboardEntry }) {
  return (
    <li
      className={cn(
        // 세로 여백은 다른 목록 행(공지·경기 카드·댓글)과 같은 py-3.5다
        "flex items-center gap-3 border-b border-hairline-cool px-5 py-3.5",
        entry.isMe && "bg-canvas-soft",
      )}
    >
      {/*
        공동 순위면 같은 숫자다 — 그대로 그린다.
        ⚠ 폭을 고정하지 않고 **최소값**만 준다. 상위 50명은 두 자리라 칸이 맞지만, 상한 밖의
          내 행은 참여자 수만큼 커진다("1,234위") — `w-8`이면 숫자가 아바타 위로 넘친다.
      */}
      <span className="min-w-8 shrink-0 text-center font-mono text-[15px] font-semibold tabular-nums text-ink">
        {formatCount(entry.rank)}
        <span className="sr-only">위</span>
      </span>
      {/* 크기는 기본값(28px) — 차단 목록·댓글 행과 같은 목록 아바타다 */}
      <Avatar label={entry.nickname} src={avatarUrl(entry.avatarPath)} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5">
          <span className="truncate text-[14px] font-medium text-ink">{entry.nickname}</span>
          {/*
            ⚠ 댓글의 중립 배지("작성자")와 같은 형태다. `Pill variant="dark"`는 승부예측에서
              "진행 중" 전용 위계라 쓰지 않고, "내 댓글"의 에메랄드는 이 화면의 자리가 아니다
              (`styling.md`의 자리 표). 행이 이미 면(`bg-canvas-soft`)으로 갈리므로 약해도 충분하다.
          */}
          {entry.isMe && (
            <span className="shrink-0 rounded-xs border border-hairline px-1 py-px font-mono text-[9px] tracking-[0.3px] text-ink-mute">
              나
            </span>
          )}
        </p>
        <p className="mt-0.5 text-[12px] text-ink-mute-2">
          {formatCount(entry.total)}경기 · 적중률 {accuracyPercent(entry)}%
        </p>
      </div>
      <p className="shrink-0 text-right">
        <span className="font-mono text-[15px] font-semibold tabular-nums text-ink">
          {formatCount(entry.hits)}
        </span>
        <span className="ml-0.5 text-[12px] text-ink-mute">적중</span>
      </p>
    </li>
  );
}
