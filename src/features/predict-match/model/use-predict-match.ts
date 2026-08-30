"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requireBrowserSupabase, toDbErrorMessage } from "@/shared/api";
import { useToast } from "@/shared/lib";
import { useSessionStore } from "@/entities/session";
import { type Match, type MatchListPage, type MatchPick, matchKeys } from "@/entities/match";

/**
 * ⚠ **화면이 이 문구를 판정에도 쓴다.** DB가 거부했다는 것은 시각 판정이 무엇이라 말하든
 *   **이미 닫혔다는 뜻**이라, 호출부가 그 사실로 UI를 닫는다(사유는 `MatchPrediction`).
 */
export const CLOSED_MESSAGE = "킥오프가 지났거나 예측할 수 없는 경기예요.";

interface PredictSnapshot {
  match: Match | undefined;
  /**
   * 목록 캐시의 스냅샷.
   * ⚠ **목록 카드가 `myPick`을 그리므로 낙관값이 여기에도 닿아야 한다** — 상세에서 예측하고
   *   뒤로 가면 카드에 바로 반영돼야 한다(목록에는 예측 UI가 없다).
   * ⚠ `getQueriesData`(복수형)로 뜬다 — 유저별로 키가 갈려 여러 벌이 존재할 수 있다.
   */
  lists: [readonly unknown[], MatchListPage | undefined][];
  /**
   * ⚠ **낙관값을 쓴 그 키를 그대로 들고 간다.** `useMutation`은 매 렌더 옵션을 교체하므로,
   *   왕복 중에 계정이 바뀌면 `onError`·`onSettled`가 **새 userId 키**를 보게 되어 옛 키에
   *   쓴 낙관값이 롤백되지 않은 채 남는다(`useCastSurveyVote`와 같은 함정·같은 대응).
   */
  key: readonly unknown[];
}

/** 목록 페이지 안의 해당 경기만 낙관적으로 갈아끼운다 */
function withMyPick(page: MatchListPage | undefined, matchId: number, pick: MatchPick) {
  if (!page) return page;
  // ⚠ 두 구역을 **모두** 훑는다 — 어느 쪽에 있는지는 조회 시점의 킥오프가 정했고,
  //   예측 대상은 다가오는 구역이지만 경계에서 넘어간 경우까지 조용히 놓치지 않는다.
  const swap = (m: Match) => (m.id === matchId ? { ...m, myPick: pick } : m);
  return { past: page.past.map(swap), upcoming: page.upcoming.map(swap) };
}

/**
 * 경기 결과를 예측한다(킥오프 전 갈아타기 포함, 취소 불가).
 *
 * ⚠ **RPC가 아니다.** 집계 컬럼이 없어 지킬 불변조건이 행 하나뿐이고, 그 행은
 *   `(match_id, user_id)` 기본키가 이미 하나로 묶는다(`cast-survey-vote`와 같은 판단).
 *
 * ⚠ **PostgREST upsert를 쓰지 않는다.** `ON CONFLICT DO UPDATE SET`이 payload의 모든 컬럼에
 *   UPDATE 권한을 요구해 `match_id`를 열게 되는데, 그러면 표를 다른 경기로 옮겨
 *   "취소 불가"를 우회할 수 있다 → **내 예측이 있는지로 갈라** insert 또는 `pick`만 바꾸는
 *   update를 보낸다. 컬럼 grant도 `pick` 하나뿐이다.
 *
 * ⚠ **집계 캐시를 건드리지 않는다 — 투표·입축구와 갈리는 지점이다.** 저쪽은 참여하는 순간
 *   결과가 열려 낙관적으로 막대를 밀어야 하지만, 여기는 **예측이 닫히는 시점과 분포가 열리는
 *   시점이 같아서**(둘 다 킥오프) 예측할 수 있는 동안 분포는 반드시 닫혀 있다.
 *   밀 막대가 애초에 존재하지 않는다.
 *
 * ⚠ 같은 이유로 **적중률 캐시도 건드리지 않는다.** 채점은 킥오프 뒤에 일어나므로 방금
 *   넣은 예측이 적중률을 바꿀 수 없다.
 *
 * ⚠ **중복 실행 가드를 두지 않는다.** 낙관적 업데이트가 있고 결과가 멱등이다
 *   (연타해도 행이 늘지 않는다) — `data-and-state.md`의 판정표 그대로.
 */
export function usePredictMatch(matchId: number) {
  const queryClient = useQueryClient();
  const userId = useSessionStore((s) => s.user?.id);
  const toast = useToast();

  return useMutation<void, Error, MatchPick, PredictSnapshot>({
    mutationFn: async (pick: MatchPick) => {
      const supabase = requireBrowserSupabase();
      if (!userId) throw new Error("로그인이 필요해요.");

      // 캐시가 아니라 **서버에 물어** 분기한다 — 캐시가 낡아 있으면 insert가 23505로 죽는다.
      // 정책이 "내 행만"이라 이 조회는 남의 예측을 볼 수 없다.
      const { data: mine, error: readError } = await supabase
        .from("match_prediction")
        .select("pick")
        .eq("match_id", matchId)
        .eq("user_id", userId)
        .maybeSingle();

      if (readError) {
        console.error("[match] 내 예측 조회 실패:", readError);
        throw new Error(toDbErrorMessage(readError));
      }

      const send = (existing: boolean) =>
        existing
          ? supabase
              .from("match_prediction")
              .update({ pick })
              .eq("match_id", matchId)
              .eq("user_id", userId)
              .select("pick")
          : supabase
              .from("match_prediction")
              .insert({ match_id: matchId, user_id: userId, pick })
              .select("pick");

      let { data, error } = await send(mine !== null);

      // ⚠ 다른 탭에서 먼저 예측하면 위 조회가 놓친 사이 행이 생겨 23505가 난다.
      //   그대로 두면 "이미 사용 중인 값이에요"라는 엉뚱한 문구가 나가므로 update로 재시도한다.
      if (error?.code === "23505") ({ data, error } = await send(true));

      /*
       * ⚠ **INSERT와 UPDATE의 거부 형태가 다르다.**
       *   - UPDATE: `using`이 후보에서 빼므로 에러 없이 **0행**이 온다.
       *   - INSERT: `with check` 위반이라 **42501**이 온다 → `toDbErrorMessage`가
       *     "권한이 없어요."로 옮기는데, 킥오프가 지나 첫 예측을 못 하는 상황에서 그 문구는
       *     **무슨 일이 일어났는지 말해주지 못한다**(실측: 지난 경기 첫 예측 → HTTP 403).
       *   두 경로가 같은 사실("이 경기에는 더 이상 쓸 수 없다")을 뜻하므로 문구도 하나로 모은다.
       */
      const CLOSED = CLOSED_MESSAGE;
      if (error) {
        console.error("[match] 예측 실패:", error);
        /*
         * ⚠ **42501을 통째로 접지 않는다.** 이 경로에서 42501이 나오는 원인이 여럿이다:
         *   ① 정책 위반(킥오프 경과·취소) → CLOSED가 참
         *   ② 세션이 끊겼는데 스토어는 로그인 → `permission denied for table`
         *   ③ 배포 사고로 grant 회수 → `permission denied for function`
         *   ②·③에까지 CLOSED를 씌우면 **모든 경기의 모든 예측이** 그럴듯한 제품 문구로
         *   실패해 **아무도 버그로 신고하지 않는다.** "권한이 없어요."는 못생겼지만 거짓이
         *   아니다 — 정책 위반일 때만 좁혀서 바꾼다.
         */
        const rlsRejected =
          error.code === "42501" && error.message.includes("row-level security policy");
        throw new Error(rlsRejected ? CLOSED : toDbErrorMessage(error));
      }
      // ⚠ RLS 위반이 에러가 아니라 0행으로 오는 경로(UPDATE) — "예측됐다"고 거짓말하지 않는다
      if (!data || data.length === 0) throw new Error(CLOSED);
    },

    onMutate: async (pick) => {
      const key = matchKeys.detail(matchId, userId);
      await Promise.all([
        queryClient.cancelQueries({ queryKey: key }),
        queryClient.cancelQueries({ queryKey: matchKeys.lists() }),
      ]);

      const snapshot: PredictSnapshot = {
        key,
        match: queryClient.getQueryData<Match>(key),
        lists: queryClient.getQueriesData<MatchListPage>({ queryKey: matchKeys.lists() }),
      };

      queryClient.setQueryData<Match>(key, (old) => (old ? { ...old, myPick: pick } : old));
      // ⚠ **복수형이다** — 유저별로 갈린 목록 캐시를 prefix로 한 번에 갱신한다
      queryClient.setQueriesData<MatchListPage>({ queryKey: matchKeys.lists() }, (old) =>
        withMyPick(old, matchId, pick),
      );

      return snapshot;
    },

    onError: (error, _pick, snapshot) => {
      if (snapshot) {
        queryClient.setQueryData(snapshot.key, snapshot.match);
        // 찍어 둔 그대로 되돌린다(없던 키는 건드리지 않는다)
        for (const [key, page] of snapshot.lists) {
          if (page) queryClient.setQueryData(key, page);
        }
      }
      // 롤백은 선택 표시를 조용히 되돌릴 뿐이라, 알리지 않으면 **누른 적이 없는 것처럼 보인다**
      toast(error.message);
    },

    onSettled: (_data, _error, _pick, snapshot) => {
      // ⚠ Promise를 반환하지 않는다 — 낙관적 업데이트가 이미 정답을 그려 놨는데
      //   리페치까지 isPending을 끌면 연타만 막혀 반응이 둔해진다(좋아요와 같은 규약).
      queryClient.invalidateQueries({
        queryKey: snapshot?.key ?? matchKeys.detail(matchId, userId),
      });
      // ⚠ **목록은 `refetchType: "none"`이다.** `onMutate`가 이미 목록의 정답(`myPick`)을
      //   그려 놨으므로 stale 표시만 남기고 다음 마운트에 최신화한다 — 기본값(`"active"`)이면
      //   목록 화면에서 예측할 때마다 **구역 상한만큼 재조회**가 나간다(좋아요가 실제로
      //   겪었던 사고 — `data-and-state.md`의 "낙관적 갱신이 정답을 그린 캐시는 stale 표시").
      //   ⚠ 지금은 예측 UI가 상세에만 있어 목록 쿼리가 비활성이라 피해가 없지만, 목록에서
      //     바로 예측하게 만드는 순간(뷰 주석이 그걸 예고한다) 그대로 재현된다.
      // ⚠ `lists()`(prefix)로 지운다 — 유저별로 키가 갈려 있어 `list(userId)`만 지우면
      //   계정을 오가는 동안 다른 키의 낡은 표시가 남는다.
      queryClient.invalidateQueries({ queryKey: matchKeys.lists(), refetchType: "none" });
    },
  });
}
