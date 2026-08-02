#!/usr/bin/env bash
# =====================================================================
# toggle_post_like 동시성 검증
#
#   bash supabase/tests/concurrency.sh
#
# 노션 「좋아요 기능 구현」이 지적한 lost update가 실제로 막히는지 확인한다.
#   like_count를 SELECT → +1 → UPDATE 하면 두 요청이 동시에 0을 읽어
#   결과가 2가 아니라 1이 된다. RPC의 FOR UPDATE 행 잠금이 이걸 직렬화한다.
#
# 검사 2종:
#   A. 서로 다른 N명이 동시에 좋아요  → like_count == N 이어야 한다
#   B. 같은 사람이 동시에 N번 토글    → like_count == count(post_like) (0 또는 1)
#      켜짐/꺼짐이 몇 번이든 카운터와 실제 행이 절대 어긋나면 안 된다
# =====================================================================
set -uo pipefail

DB="postgresql://postgres:postgres@127.0.0.1:64322/postgres"
API="http://127.0.0.1:64321"
N=20

ANON=$(supabase status -o env 2>/dev/null | grep '^ANON_KEY' | cut -d'"' -f2)
if [ -z "$ANON" ]; then echo "supabase 스택이 떠 있지 않습니다"; exit 1; fi

# 동시 실행되는 자식 프로세스들이 결과를 모으는 곳
OUTDIR=$(mktemp -d)
trap 'rm -rf "$OUTDIR"' EXIT

echo "=== 준비: 테스트 유저 ${N}명 + 게시글 1개 ==="
for i in $(seq 1 $N); do
  curl -s -o /dev/null -X POST "$API/auth/v1/signup" \
    -H "apikey: $ANON" -H "Content-Type: application/json" \
    -d "{\"email\":\"conc${i}@test.com\",\"password\":\"test1234\"}" &
done
wait

# macOS 기본 bash는 3.2라 mapfile이 없다 — while read로 담는다
UIDS=()
while IFS= read -r line; do
  [ -n "$line" ] && UIDS+=("$line")
done < <(psql "$DB" -tAc \
  "select id from auth.users where email like 'conc%@test.com' order by email limit $N")

if [ "${#UIDS[@]}" -ne "$N" ]; then
  echo "유저가 ${#UIDS[@]}명뿐입니다(기대 $N) — 가입 rate limit을 확인하세요"; exit 1
fi
echo "유저 ${#UIDS[@]}명 확보"

# CTE로 감싼다 — 맨몸 INSERT ... RETURNING이면 psql이 "INSERT 0 1" 명령 태그까지
# stdout에 섞어 변수가 오염된다
POST_ID=$(psql "$DB" -tAc \
  "with i as (
     insert into public.post (author_id, title, content)
     values ('${UIDS[0]}', '동시성 테스트', '본문') returning id
   ) select id from i")
echo "게시글 id=$POST_ID"

# 한 유저로 가장해 RPC를 1회 호출한다 (독립 커넥션 = 진짜 동시 실행).
#
# ⚠ 결과를 버리지 않는다. 전에는 >/dev/null 2>&1로 삼켜서, RPC가 전부 실패해도
#   "like_count = 실제 행 수"라는 단언이 그대로 참이 되어 아무것도 증명하지 못했다.
#   성공한 호출만 OUTDIR에 한 줄씩 남겨 나중에 개수를 센다.
call_toggle() {
  local out
  if out=$(psql "$DB" -tAq -v ON_ERROR_STOP=1 -c \
      "select set_config('request.jwt.claims',
          json_build_object('sub','$1','role','authenticated')::text, false);
       set role authenticated;
       select public.toggle_post_like($POST_ID);" 2>"$OUTDIR/err.$$.$RANDOM"); then
    echo "$out" | tail -1 >> "$OUTDIR/ok"
  fi
}

echo ""
echo "=== A. 서로 다른 ${N}명이 동시에 좋아요 ==="
: > "$OUTDIR/ok"
for u in "${UIDS[@]}"; do call_toggle "$u" & done
wait
OK_A=$(wc -l < "$OUTDIR/ok" | tr -d ' ')
echo "  RPC 성공 호출: $OK_A / $N  $([ "$OK_A" -eq "$N" ] && echo '(ok)' || echo '❌ 일부 실패 — 아래 단언은 무의미하다')"
psql "$DB" -c \
  "select p.like_count,
          (select count(*) from public.post_like where post_id = p.id) as actual_rows,
          p.like_count = (select count(*) from public.post_like where post_id = p.id)
            and p.like_count = $N as ok
     from public.post p where p.id = $POST_ID;"
echo "  → like_count = actual_rows = $N 이어야 ok = t (lost update가 없다는 뜻)"

echo ""
echo "=== B. 같은 사람이 동시에 ${N}번 토글 ==="
SOLO="${UIDS[0]}"
: > "$OUTDIR/ok"
for _ in $(seq 1 $N); do call_toggle "$SOLO" & done
wait
OK_B=$(wc -l < "$OUTDIR/ok" | tr -d ' ')
# 켜짐(t)/꺼짐(f) 반환이 번갈아 나와야 한다 — 직렬화되지 않으면 같은 값이 연달아 나온다
ON=$(grep -c '^t$' "$OUTDIR/ok" || true); OFF=$(grep -c '^f$' "$OUTDIR/ok" || true)
echo "  RPC 성공 호출: $OK_B / $N  $([ "$OK_B" -eq "$N" ] && echo '(ok)' || echo '❌ 일부 실패')"
echo "  반환값 분포: 켜짐 $ON / 꺼짐 $OFF  (직렬화되면 둘 차이가 0 또는 1이어야 한다)"
psql "$DB" -c \
  "select p.like_count,
          (select count(*) from public.post_like where post_id = p.id) as actual_rows,
          p.like_count = (select count(*) from public.post_like where post_id = p.id) as ok
     from public.post p where p.id = $POST_ID;"
echo "  → 토글 횟수와 무관하게 like_count = actual_rows 이면 ok = t (드리프트 없음)"

echo ""
echo "=== C. 좋아요를 누른 유저가 탈퇴해도 카운터가 맞는가 ==="
psql "$DB" -tAq -c "delete from auth.users where id = '${UIDS[1]}';"
psql "$DB" -c \
  "select p.like_count,
          (select count(*) from public.post_like where post_id = p.id) as actual_rows,
          p.like_count = (select count(*) from public.post_like where post_id = p.id) as ok
     from public.post p where p.id = $POST_ID;"
echo "  → cascade 삭제 경로에도 트리거가 붙어 있어야 ok = t"

echo ""
echo "=== 정리 ==="
psql "$DB" -tAq -c "delete from public.post where id = $POST_ID;"
psql "$DB" -tAq -c "delete from auth.users where email like 'conc%@test.com';"
rm -rf "$OUTDIR"
echo "완료"
